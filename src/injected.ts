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
import { initializeAppExtension } from './components/uiex-initializer';
import type { MicroZoukeiAPI } from './types/injected';

/**
 * Cleanup function called when the injected script needs to be reloaded.
 */
export const cleanupInjectedScript = (): void => {
    hideAllErrors();

    // Remove microZoukei from window if it exists
    if ((window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei) {
        delete (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei;
    }
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

/**
 * A function that safely waits for the microStudio
 * main application (window.app) to launch and performs
 * initialization the moment it starts up
 */
const waitForMicroStudioLoad = (): void => {
    const isLoaded = (window as any).app && (window as any).app.appui;

    if (isLoaded) {
        console.log('🎯 I have confirmed that microStudio has started. I will now begin extending the UI.');

        setTimeout(() => {
            initializeAppExtension();
        }, 100);

        return;
    }

    // If it hasn't started yet, check again during the browser's next
    // rendering frame (using a safe timer that prevents an infinite loop).
    requestAnimationFrame(waitForMicroStudioLoad);
};

// Auto-initialize when script is injected via inject_updated_script()
if (typeof window !== 'undefined') {
    console.log('[MicroZoukei] Injected script loaded and executing');
    cleanupInjectedScript();

    // Expose PROXY_PORT to window for RPC bridge to use directly
    (window as any).PROXY_PORT = PROXY_PORT;

    void checkBridgeHealth().then((ready: boolean) => {
        bridgeReady = ready;

        if (bridgeReady) {
            // Expose RPC bridge to window object
            (window as unknown as { microZoukei?: MicroZoukeiAPI }).microZoukei = rpcBridge;

            rpcBridge.logMessage('[MicroZoukei] RPC Bridge initialized and ready');

            // ----------------------------------------------------
            // Initalize UI extention
            // ----------------------------------------------------
            waitForMicroStudioLoad();

        } else {
            showError({
                message: 'Tauri API not available. Please ensure the app is running.',
                showDetails: true,
            });

            console.warn('[MicroZoukei] Tauri API not yet available. Will initialize when injected.');
        }
    });
}