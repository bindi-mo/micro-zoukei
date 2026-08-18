/**
 * MicroZoukei Injected Script Entry Point
 * Combines all modules and initializes the RPC bridge in the WebView environment
 */

// Proxy port number embedded at boot time (injected by Tauri)
const PROXY_PORT = 8080;
export let bridgeReady: boolean = false;

import { hideAllErrors, showError } from './components/error-handler';
import { hideLoading, isLoadingDisplayed, showLoading } from './components/loading';
import { checkBridgeHealth, rpcBridge } from './components/rpc-bridge';
import type { MicroZoukeiAPI } from './types/injected';

/**
 * Cleanup function called when the injected script needs to be reloaded.
 */
export function cleanupInjectedScript(): void {
    hideAllErrors();

    // Remove microZoukei from window if it exists
    if ((window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei) {
        delete (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei;
    }

    rpcBridge.logMessage('[MicroZoukei] Cleanup completed');
}

/**
 * Utility function to show loading while performing async operations.
 */
export async function withLoading<T>(
    operation: () => Promise<T>,
    message?: string
): Promise<T> {
    if (!isLoadingDisplayed()) {
        showLoading({ message });
    }

    try {
        const result = await operation();
        return result;
    } finally {
        hideLoading();
    }
}

// Auto-initialize when script is injected via inject_updated_script()
if (typeof window !== 'undefined') {
    console.log('[MicroZoukei] Injected script loaded and executing');

    // Expose getProxyPort to window for RPC bridge to use
    (window as any).getProxyPort = async (): Promise<number> => {
        return PROXY_PORT;
    };

    void checkBridgeHealth().then((ready: boolean) => {
        bridgeReady = ready;

        if (bridgeReady) {
            // Expose RPC bridge to window object
            (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei = rpcBridge;

            rpcBridge.logMessage('[MicroZoukei] RPC Bridge initialized and ready');
        } else {
            showError({
                message: 'Tauri API not available. Please ensure the app is running.',
                showDetails: true,
            });

            console.warn('[MicroZoukei] Tauri API not yet available. Will initialize when injected.');
        }
    });
}