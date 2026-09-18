import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listen } from '@tauri-apps/api/event';
import {
    getFrontendRequestState,
    handleInitialIndexResponse,
    handleInitialIndexStatus,
    requestInitialIndexStatus,
    cleanupInitialIndexLifecycle,
} from './initial-index';
import type { EnsureInitialIndexResponse, InitialIndexStatusEvent } from '../types/injected';

const mockedListen = vi.mocked(listen);

vi.mock('./rpc-bridge', () => ({
    rpcBridge: {
        ensureInitialIndex: vi.fn().mockResolvedValue({
            status: 'started',
            valid: true,
            documentCount: 0,
        } as EnsureInitialIndexResponse),
        logMessage: vi.fn().mockResolvedValue(undefined),
    },
}));

describe('initial-index lifecycle coordinator', () => {
    beforeEach(() => {
        cleanupInitialIndexLifecycle();
        mockedListen.mockReset();
        mockedListen.mockResolvedValue(() => undefined);
    });

    afterEach(() => {
        cleanupInitialIndexLifecycle();
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

    it('registers the Tauri listener exactly once', async () => {
        const { startInitialIndexEventListening } = await import('./initial-index');
        await startInitialIndexEventListening();
        await startInitialIndexEventListening();
        expect(mockedListen).toHaveBeenCalledTimes(1);
    });
});