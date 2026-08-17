/// <reference types="vite/client" />

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
