import { listen } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnsureInitialIndexResponse } from '../types/injected';
import { showError } from './error-handler';
import { IndexModalState, showIndexModal } from './index-modal';
import {
    cleanupInitialIndexLifecycle,
    getFrontendRequestState,
    handleInitialIndexResponse,
    handleInitialIndexStatus,
    requestInitialIndexStatus,
} from './initial-index';
import { rpcBridge } from './rpc-bridge';

const mockedListen = vi.mocked(listen);
const mockedShowError = vi.mocked(showError);
const mockedEnsureInitialIndex = vi.mocked(rpcBridge.ensureInitialIndex);

vi.mock('./error-handler', () => ({
    showError: vi.fn(),
}));

vi.mock('./rpc-bridge', () => ({
    rpcBridge: {
        ensureInitialIndex: vi.fn().mockResolvedValue({
            status: 'started',
            valid: true,
            documentCount: 0,
        } as EnsureInitialIndexResponse),
        log: vi.fn().mockResolvedValue(undefined),
    },
}));

describe('initial-index lifecycle coordinator', () => {
    beforeEach(() => {
        cleanupInitialIndexLifecycle();
        mockedListen.mockReset();
        mockedListen.mockResolvedValue(() => undefined);
        mockedShowError.mockReset();
        mockedEnsureInitialIndex.mockReset();
        mockedEnsureInitialIndex.mockResolvedValue({
            status: 'started',
            valid: true,
            documentCount: 0,
        });
    });

    afterEach(() => {
        cleanupInitialIndexLifecycle();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('starts in the idle state', () => {
        expect(getFrontendRequestState()).toBe('idle');
    });

    it('transitions to in_progress on started response', () => {
        handleInitialIndexResponse({ status: 'started', valid: true, documentCount: 0 });
        expect(getFrontendRequestState()).toBe('in_progress');
    });

    it('treats already_valid as completed and is a no-op when already completed', () => {
        handleInitialIndexResponse({ status: 'already_valid', valid: true, documentCount: 12 });
        expect(getFrontendRequestState()).toBe('completed');
        handleInitialIndexResponse({ status: 'already_valid', valid: true, documentCount: 12 });
        expect(getFrontendRequestState()).toBe('completed');
    });

    it('ignores completed events after a completed state', () => {
        handleInitialIndexResponse({ status: 'already_valid', valid: true, documentCount: 1 });
        handleInitialIndexStatus({ status: 'completed', documentCount: 1 });
        expect(getFrontendRequestState()).toBe('completed');
    });

    it('resets to idle after cleanup so a failed state can be retried', () => {
        handleInitialIndexStatus({ status: 'failed', error: 'boom' });
        expect(getFrontendRequestState()).toBe('failed');
        cleanupInitialIndexLifecycle();
        expect(getFrontendRequestState()).toBe('idle');
    });

    it('disposes the index modal during lifecycle cleanup', () => {
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            callback(0);
            return 0;
        });

        expect(document.getElementById('micro-zoukei-index-overlay')).toBeNull();
        showIndexModal(IndexModalState.InProgress);
        expect(document.getElementById('micro-zoukei-index-overlay')).not.toBeNull();

        cleanupInitialIndexLifecycle();

        expect(document.getElementById('micro-zoukei-index-overlay')).toBeNull();
        expect(getFrontendRequestState()).toBe('idle');
    });

    it('registers the Tauri listener exactly once', async () => {
        const { startInitialIndexEventListening } = await import('./initial-index');
        await startInitialIndexEventListening();
        await startInitialIndexEventListening();
        expect(mockedListen).toHaveBeenCalledTimes(1);
    });

    it('times out an initial RPC response after three seconds', async () => {
        vi.useFakeTimers();
        mockedEnsureInitialIndex.mockReturnValue(new Promise(() => undefined));

        const request = requestInitialIndexStatus();
        vi.advanceTimersByTime(3000);
        await request;

        expect(getFrontendRequestState()).toBe('failed');
        expect(document.getElementById('micro-zoukei-index-overlay')?.style.display).toBe('none');
        expect(mockedShowError).toHaveBeenCalledTimes(1);
        expect(mockedShowError).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('did not respond within 3 seconds'),
        }));
    });

    it.each([
        ['started', 'in_progress'],
        ['in_progress', 'in_progress'],
        ['already_valid', 'completed'],
    ] as const)(
        'cancels the response timeout after a %s response',
        async (status, expectedState) => {
            vi.useFakeTimers();
            mockedEnsureInitialIndex.mockResolvedValue({
                status,
                valid: status === 'already_valid',
                documentCount: status === 'already_valid' ? 1 : 0,
            });

            const request = requestInitialIndexStatus();
            await request;
            vi.advanceTimersByTime(3000);

            expect(mockedShowError).not.toHaveBeenCalled();
            expect(getFrontendRequestState()).toBe(expectedState);
        }
    );

    it('reports an RPC rejection without scheduling a duplicate timeout', async () => {
        vi.useFakeTimers();
        mockedEnsureInitialIndex.mockRejectedValue(new Error('transport failed'));

        const request = requestInitialIndexStatus();
        await request;
        vi.advanceTimersByTime(3000);

        expect(getFrontendRequestState()).toBe('failed');
        expect(mockedShowError).toHaveBeenCalledTimes(1);
        expect(mockedShowError).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('transport failed'),
        }));
    });

    it('prevents a timeout after lifecycle cleanup', async () => {
        vi.useFakeTimers();
        mockedEnsureInitialIndex.mockReturnValue(new Promise(() => undefined));

        const request = requestInitialIndexStatus();
        cleanupInitialIndexLifecycle();
        vi.advanceTimersByTime(3000);
        await request;

        expect(getFrontendRequestState()).toBe('idle');
        expect(mockedShowError).not.toHaveBeenCalled();
    });

    it('ignores late RPC and lifecycle results after a timeout', async () => {
        vi.useFakeTimers();
        let resolveRpc: ((response: EnsureInitialIndexResponse) => void) | undefined;
        mockedEnsureInitialIndex.mockReturnValue(
            new Promise(resolve => {
                resolveRpc = resolve;
            })
        );

        const request = requestInitialIndexStatus();
        vi.advanceTimersByTime(3000);
        await request;

        resolveRpc?.({ status: 'started', valid: true, documentCount: 0 });
        handleInitialIndexStatus({ status: 'started' });
        handleInitialIndexStatus({ status: 'completed', documentCount: 12 });
        await Promise.resolve();

        expect(getFrontendRequestState()).toBe('failed');
        expect(document.getElementById('micro-zoukei-index-overlay')?.style.display).toBe('none');
        expect(mockedShowError).toHaveBeenCalledTimes(1);
    });
});