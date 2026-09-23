import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncFilesResponse } from '../types/injected';
import { overrideProjectLoaded } from './project-files';

const { logError, logInfo, syncFiles } = vi.hoisted(() => ({
    logError: vi.fn().mockResolvedValue(undefined),
    logInfo: vi.fn().mockResolvedValue(undefined),
    syncFiles: vi.fn(),
}));

vi.mock('./rpc-bridge', () => ({
    rpcBridge: {
        log: {
            error: logError,
            info: logInfo,
        },
        syncFiles,
    },
}));

const partialResponse: SyncFilesResponse = {
    success: false,
    files_processed: 2,
    files_skipped: 1,
    errors: [
        { path: 'src/bad.ms', error: 'permission denied' },
    ],
};

describe('project file synchronization', () => {
    beforeEach(() => {
        logError.mockClear();
        logInfo.mockClear();
        syncFiles.mockReset();
        syncFiles.mockResolvedValue(partialResponse);

        (window as any).app = {
            openProject: vi.fn(() => 'opened'),
            project: {
                title: 'My Game',
                language: 'python',
                file_types: ['source'],
                source_list: [
                    {
                        file: 'Player.ms',
                        content: 'print("ready")',
                        fetched: true,
                    },
                ],
            },
        };
    });

    afterEach(() => {
        delete (window as any).app;
    });

    it('awaits bulk sync and reports processed, skipped, and failed files', async () => {
        let resolveSync: ((response: SyncFilesResponse) => void) | undefined;
        syncFiles.mockReturnValue(
            new Promise(resolve => {
                resolveSync = resolve;
            })
        );

        const cleanup = overrideProjectLoaded();
        expect((window as any).app.openProject('project-argument')).toBe('opened');

        await vi.waitFor(() => {
            expect(syncFiles).toHaveBeenCalledTimes(1);
        });
        expect(syncFiles).toHaveBeenCalledWith('My Game', [
            {
                file: 'Player.py',
                content: 'print("ready")',
                isBinaryBase64: false,
            },
        ]);
        expect(logInfo).not.toHaveBeenCalledWith(
            'Project file sync completed:',
            'My Game',
            expect.any(Object)
        );

        resolveSync?.(partialResponse);

        await vi.waitFor(() => {
            expect(logInfo).toHaveBeenCalledWith(
                'Project file sync completed:',
                'My Game',
                {
                    processed: 2,
                    skipped: 1,
                    failed: 1,
                }
            );
        });
        expect(logError).toHaveBeenCalledWith(
            'Failed to save project files:',
            'My Game',
            partialResponse.errors
        );

        cleanup();
    });
});
