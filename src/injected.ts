/**
 * MicroZoukei Injected Script Entry Point
 * Combines all modules and initializes the RPC bridge in the WebView environment
 */

import { hideAllErrors, showError } from './components/error-handler';
import { hideLoading, isLoadingDisplayed, showLoading } from './components/loading';
import { isBridgeReady, rpcBridge } from './components/rpc-bridge';
import type { MicroZoukeiAPI } from './types/injected';

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

// Auto-initialize when script is injected via inject_updated_script()
if (typeof window !== 'undefined') {
    console.log('[MicroZoukei] Injected script loaded');
    
    // Tauri API が利用可能なら、すぐに初期化
    if (isBridgeReady()) {
        initMicroZoukei();
    } else {
        console.warn('[MicroZoukei] Tauri API not yet available. Will initialize when injected.');
    }
}