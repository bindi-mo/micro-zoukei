/**
 * MicroZoukei RPC Bridge Module
 * Handles all Tauri command invocations from the WebView environment
 */

import type { MicroZoukeiAPI, InvokeOptions } from '../types/injected';

const COMMAND_MAP: Record<string, string> = {
    listFiles: 'mzd_list_files',
    readFile: 'mzd_read_file',
    writeFile: 'mzd_write_file',
    deleteFile: 'mzd_delete_file',
    syncProject: 'mzd_sync_project',
    syncFiles: 'mzd_sync_files',
};

/**
 * Internal function to dispatch commands to the Rust backend.
 * Supports multiple Tauri version injection points.
 */
async function invokeTauriCommand(options: InvokeOptions): Promise<unknown> {
    const tauriApi = window.__tauri_prod__ || window.__tauri_2021__ || window.__tauri__;
    
    if (!tauriApi) {
        throw new Error('Tauri API not available');
    }

    try {
        return await tauriApi.invoke(options.commandName, options.args);
    } catch (error) {
        console.error(`[MicroZoukei] Error invoking ${options.commandName}:`, error);
        throw error;
    }
}

/**
 * RPC Bridge implementation exposed to the WebView environment.
 */
export const rpcBridge: MicroZoukeiAPI = {
    listFiles: async (path?: string) => {
        return await invokeTauriCommand({ commandName: 'mzd_list_files', args: { path } });
    },
    
    readFile: async (path: string) => {
        return await invokeTauriCommand({ commandName: 'mzd_read_file', args: { path } });
    },
    
    writeFile: async (path: string, content: string) => {
        return await invokeTauriCommand({ 
            commandName: 'mzd_write_file', 
            args: { path, content } 
        });
    },
    
    deleteFile: async (path: string) => {
        return await invokeTauriCommand({ commandName: 'mzd_delete_file', args: { path } });
    },
    
    syncProject: async (projectId?: string) => {
        return await invokeTauriCommand({ 
            commandName: 'mzd_sync_project', 
            args: projectId ? { projectId } : undefined 
        });
    },
    
    syncFiles: async (projectId: string, path: string) => {
        return await invokeTauriCommand({ 
            commandName: 'mzd_sync_files', 
            args: { projectId, path } 
        });
    },
};

/**
 * Check if the bridge is initialized.
 */
export function isBridgeReady(): boolean {
    return !!(window.__tauri_prod__ || window.__tauri_2021__ || window.__tauri__);
}
