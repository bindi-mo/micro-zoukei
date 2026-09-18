/**
 * MicroZoukei Injected Script Entry Point
 * Combines all modules and initializes the RPC bridge in the WebView environment
 */

// Proxy port number embedded at boot time (injected by Tauri)
const PROXY_PORT = 8080;

import { hideAllErrors, showError } from './components/error-handler';
import {
    cleanupInitialIndexLifecycle,
} from './components/initial-index';
import { checkBridgeHealth, rpcBridge } from './components/rpc-bridge';
import { initializeAppExtension } from './components/uiex-initializer';
import type { MicroZoukeiAPI, MicroZoukeiInjectedState } from './types/injected';

let activeCleanup: (() => void) | null = null;
let initializationToken = 0;
let pendingInitializationTimeout: ReturnType<typeof setTimeout> | undefined;

const clearPendingInitialization = (): void => {
    if (pendingInitializationTimeout !== undefined) {
        clearTimeout(pendingInitializationTimeout);
        pendingInitializationTimeout = undefined;
    }
};

const waitForMicroStudioLoad = (token: number): Promise<void> => {
    return new Promise(resolve => {
        const check = (): void => {
            if (token !== initializationToken) {
                return;
            }

            if ((window as any).app?.appui?.setMainSection) {
                resolve();
                return;
            }

            pendingInitializationTimeout = setTimeout(check, 100);
        };

        check();
    });
};

const waitForDomReady = async (): Promise<void> => {
    if (document.body) return;
    await new Promise<void>(resolve => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
};

/**
 * Clean up all state owned by the currently injected script.
 */
export const cleanupInjectedScript = (): void => {
    initializationToken += 1;
    clearPendingInitialization();

    hideAllErrors();

    if ((window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei) {
        delete (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei;
    }

    if (activeCleanup) {
        const cleanup = activeCleanup;
        activeCleanup = null;
        cleanup();
    }

    cleanupInitialIndexLifecycle();
    delete (window as unknown as { microZoukeiInjectedState?: MicroZoukeiInjectedState }).microZoukeiInjectedState;
};

/**
 * Expose the RPC bridge and initialize the injected UI after microStudio is ready.
 */
const initializeInjectedScript = async (): Promise<void> => {
    const token = ++initializationToken;

    try {
        await waitForDomReady();
        if (token !== initializationToken) {
            return;
        }
    } catch {
        return;
    }

    // Expose cleanup immediately so hot reload can stop this script before replacement.
    (window as unknown as { microZoukeiInjectedState?: MicroZoukeiInjectedState }).microZoukeiInjectedState = {
        cleanup: cleanupInjectedScript,
    };
    (window as any).PROXY_PORT = PROXY_PORT;

    try {
        const ready = await checkBridgeHealth();
        if (!ready || token !== initializationToken) {
            return;
        }

        (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei = rpcBridge;
        rpcBridge.logMessage('info', '[MicroZoukei] RPC Bridge initialized and ready');

        await waitForMicroStudioLoad(token);
        if (token !== initializationToken) {
            return;
        }

        const cleanup = await initializeAppExtension();
        if (token !== initializationToken) {
            cleanup();
            return;
        }

        activeCleanup = cleanup;
    } catch (error) {
        if (token !== initializationToken) {
            return;
        }

        const message = error instanceof Error ? error.message : 'Unknown initialization error';
        showError({
            message: `MicroZoukei initialization failed: ${message}`,
            showDetails: true,
        });
    }
};

if (typeof window !== 'undefined') {
    console.log('[MicroZoukei] Injected script loaded and executing');
    void initializeInjectedScript();
}