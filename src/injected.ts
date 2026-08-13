/**
 * MicroZoukei Injected Script Entry Point
 * Combines all modules and initializes the RPC bridge in the WebView environment
 */

import { rpcBridge, isBridgeReady } from './components/rpc-bridge';
import { showLoading, hideLoading, isLoadingDisplayed } from './components/loading';
import { showError, hideAllErrors } from './components/error-handler';

/**
 * Initialize MicroZoukei RPC bridge.
 * This function should be called when the WebView is ready.
 */
export function initMicroZoukei(): void {
    console.log('[MicroZoukei] Initializing...');

    // Check if Tauri API is available
    if (!isBridgeReady()) {
        showError({
            message: 'Tauri API not available. Please ensure the app is running.',
            showDetails: true,
        });
        console.error('[MicroZoukei] Tauri API not available');
        return;
    }

    // Expose RPC bridge to window object
    (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei = rpcBridge;

    console.log('[MicroZoukei] RPC Bridge initialized successfully.');
}

/**
 * Cleanup function called when the injected script needs to be reloaded.
 */
export function cleanupInjectedScript(): void {
    hideAllErrors();

    // Remove microZoukei from window if it exists
    if ((window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei) {
        delete (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei;
    }

    console.log('[MicroZoukei] Cleanup completed');
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
