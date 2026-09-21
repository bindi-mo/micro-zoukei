/// <reference types="vite/client" />

import type { MicroZoukeiAPI, MicroZoukeiInjectedState } from './types/injected';

declare global {
    interface Window {
        microZoukei?: MicroZoukeiAPI;
        microZoukeiInjectedState?: MicroZoukeiInjectedState;
        /**
         * Stashed logical section name persisted across injected-script
         * re-injections so the previously active section can be restored.
         * Set by `captureActiveSectionForReinjection` and consumed by
         * `initializeAppExtension`.
         */
        __microZoukeiRestoreSection?: string | null;
    }
}

// Tauri window API declarations for TypeScript
declare global {
    interface Window {
        __tauri_prod__: any;
        __tauri_2021__: any;
        __tauri__: any;
    }
}

// MicroZoukei-specific window extensions
declare global {
    interface Window {
        microZoukei?: MicroZoukeiAPI;
        getProxyPort(): Promise<number> | undefined;
    }
}
