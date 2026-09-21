import { listen } from '@tauri-apps/api/event';
import type { EnsureInitialIndexResponse, InitialIndexStatusEvent } from '../types/injected';
import { showError } from './error-handler';
import {
    disposeIndexModal,
    hideIndexModal,
    IndexModalState,
    showIndexModal,
} from './index-modal';
import { rpcBridge } from './rpc-bridge';

const INITIAL_INDEX_EVENT = 'initial-index-status';
const INITIAL_INDEX_RESPONSE_TIMEOUT_MS = 3000;

export type FrontendRequestState = 'idle' | 'in_progress' | 'completed' | 'failed';

let frontendState: FrontendRequestState = 'idle';
let unlistenInitialIndexStatus: (() => void) | undefined;
let listenerRegistration: Promise<void> | null = null;
let listenerGeneration = 0;
let requestPromise: Promise<void> | null = null;
let requestResolve: (() => void) | undefined;
let responseTimeoutId: ReturnType<typeof setTimeout> | undefined;
let requestGeneration = 0;
let activeRequestGeneration: number | null = null;

function clearInitialIndexResponseTimeout(): void {
    if (responseTimeoutId !== undefined) {
        clearTimeout(responseTimeoutId);
        responseTimeoutId = undefined;
    }
}

function resolveActiveRequest(): void {
    const resolve = requestResolve;
    requestResolve = undefined;
    resolve?.();
}

function failInitialIndexRequest(error: unknown): void {
    if (frontendState === 'completed' || frontendState === 'failed') {
        return;
    }

    frontendState = 'failed';
    requestPromise = null;
    activeRequestGeneration = null;
    clearInitialIndexResponseTimeout();
    resolveActiveRequest();

    const errorMessage = error instanceof Error ? error.message : 'Unknown indexing error';
    showIndexingFailure(errorMessage);
}

export function getFrontendRequestState(): FrontendRequestState {
    return frontendState;
}

function showIndexingProgress(status: 'started' | 'in_progress'): void {
    showIndexModal(IndexModalState.InProgress, {
        message: status === 'started'
            ? 'Starting initial knowledge base index...'
            : 'Indexing knowledge base in progress...'
    });
}

function showIndexingFailure(error: string): void {
    hideIndexModal();
    showError({
        message: `Initial knowledge base indexing failed: ${error}`,
        showDetails: true,
    });
}

/**
 * Handle a lifecycle event payload emitted by the Rust backend.
 */
export function handleInitialIndexStatus(payload: InitialIndexStatusEvent): void {
    if (frontendState === 'completed' || frontendState === 'failed') {
        return;
    }

    switch (payload.status) {
        case 'started':
        case 'in_progress':
            frontendState = 'in_progress';
            showIndexingProgress(payload.status);
            break;
        case 'completed':
            frontendState = 'completed';
            requestPromise = null;
            activeRequestGeneration = null;
            clearInitialIndexResponseTimeout();
            resolveActiveRequest();
            hideIndexModal();
            void rpcBridge.log.info(
                `Initial index completed with ${payload.documentCount ?? 0} documents`
            );
            break;
        case 'failed': {
            const errorMessage = payload.error || 'Unknown indexing error';
            failInitialIndexRequest(new Error(errorMessage));
            break;
        }
    }
}

/**
 * Handle the immediate lifecycle response from mzd_ensure_initial_index.
 */
export function handleInitialIndexResponse(response: EnsureInitialIndexResponse): void {
    if (frontendState === 'completed' || frontendState === 'failed') {
        return;
    }

    switch (response.status) {
        case 'already_valid':
            frontendState = 'completed';
            requestPromise = null;
            activeRequestGeneration = null;
            clearInitialIndexResponseTimeout();
            resolveActiveRequest();
            hideIndexModal();
            break;
        case 'in_progress':
        case 'started':
            frontendState = 'in_progress';
            showIndexingProgress(response.status);
            clearInitialIndexResponseTimeout();
            resolveActiveRequest();
            break;
    }
}

/**
 * Install the Tauri event listener before the navigation hook is installed.
 */
export function startInitialIndexEventListening(): Promise<void> {
    if (unlistenInitialIndexStatus) {
        return Promise.resolve();
    }
    if (listenerRegistration) {
        return listenerRegistration;
    }

    const generation = ++listenerGeneration;
    const registration = listen<InitialIndexStatusEvent>(INITIAL_INDEX_EVENT, event => {
        handleInitialIndexStatus(event.payload);
    }).then(unlisten => {
        if (generation !== listenerGeneration) {
            unlisten();
            return;
        }
        unlistenInitialIndexStatus = unlisten;
    }).catch(error => {
        rpcBridge.log.error('Failed to subscribe to initial index events:', error);
        if (generation === listenerGeneration) {
            unlistenInitialIndexStatus = undefined;
        }
    });

    listenerRegistration = registration;
    void registration.finally(() => {
        if (listenerRegistration === registration) {
            listenerRegistration = null;
        }
    });
    return registration;
}

/**
 * Request initial indexing when microStudio enters the projects route.
 */
export function requestInitialIndexStatus(): Promise<void> {
    if (frontendState === 'completed' || frontendState === 'in_progress') {
        return Promise.resolve();
    }

    frontendState = 'in_progress';
    showIndexingProgress('started');

    const generation = ++requestGeneration;
    activeRequestGeneration = generation;

    const promise = new Promise<void>(resolve => {
        requestResolve = resolve;
    });
    requestPromise = promise;

    responseTimeoutId = setTimeout(() => {
        responseTimeoutId = undefined;
        if (activeRequestGeneration !== generation) {
            return;
        }
        failInitialIndexRequest(
            new Error(`Initial indexing request timed out: backend did not respond within ${INITIAL_INDEX_RESPONSE_TIMEOUT_MS / 1000} seconds`)
        );
    }, INITIAL_INDEX_RESPONSE_TIMEOUT_MS);

    let request: Promise<EnsureInitialIndexResponse>;
    try {
        request = rpcBridge.ensureInitialIndex();
    } catch (error) {
        request = Promise.reject(error);
    }

    void request
        .then(response => {
            if (activeRequestGeneration === generation && frontendState !== 'failed') {
                handleInitialIndexResponse(response);
            }
        })
        .catch(error => {
            if (activeRequestGeneration === generation) {
                failInitialIndexRequest(error);
            }
        });

    return promise.finally(() => {
        if (requestPromise === promise) {
            requestPromise = null;
        }
    });
}

/**
 * Alias used by the navigation initializer to keep routing concerns separate.
 */
export function requestInitialIndexForProjectsRoute(): Promise<void> {
    return requestInitialIndexStatus();
}

/**
 * Remove event subscriptions and reset transient frontend state during hot reload.
 */
export function cleanupInitialIndexLifecycle(): void {
    listenerGeneration += 1;
    const pendingRegistration = listenerRegistration;
    listenerRegistration = null;

    if (unlistenInitialIndexStatus) {
        unlistenInitialIndexStatus();
        unlistenInitialIndexStatus = undefined;
    }
    if (pendingRegistration) {
        void pendingRegistration.catch(() => undefined);
    }

    requestPromise = null;
    const resolve = requestResolve;
    requestResolve = undefined;
    clearInitialIndexResponseTimeout();
    activeRequestGeneration = null;
    requestGeneration += 1;
    frontendState = 'idle';
    resolve?.();
    disposeIndexModal();
}
