/**
 * MicroZoukei RPC Bridge Module
 * Handles all Tauri command invocations from the WebView environment
 */

import type { FileEntry, MicroZoukeiAPI, SyncFilesResponse, SyncProjectResponse } from '../types/injected';

const COMMAND_MAP: Record<string, string> = {
    listFiles: 'mzd_list_files',
    readFile: 'mzd_read_file',
    writeFile: 'mzd_write_file',
    deleteFile: 'mzd_delete_file',
    syncProject: 'mzd_sync_project',
    syncFiles: 'mzd_sync_files',
    logMessage: 'mzd_log_message',
};

/**
 * Internal function to dispatch commands to the Rust backend.
 * Supports multiple Tauri version injection points.
 */
async function invokeTauriCommand(options: { commandName: string; args?: any }): Promise<unknown> {
    const tauriApi = (window as any).__tauri_prod__ || (window as any).__tauri_2021__ || (window as any).__tauri__;

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
        return await invokeTauriCommand({
            commandName: 'mzd_list_files',
            args: { path }
        }) as FileEntry[];
    },

    readFile: async (path: string) => {
        return await invokeTauriCommand({
            commandName: 'mzd_read_file',
            args: { path }
        }) as string;
    },

    writeFile: async (path: string, content: string) => {
        return await invokeTauriCommand({
            commandName: 'mzd_write_file',
            args: { path, content }
        }) as boolean;
    },

    deleteFile: async (path: string) => {
        return await invokeTauriCommand({
            commandName: 'mzd_delete_file',
            args: { path }
        }) as boolean;
    },

    syncProject: async (projectId?: string) => {
        return await invokeTauriCommand({
            commandName: 'mzd_sync_project',
            args: projectId ? { projectId } : undefined
        }) as SyncProjectResponse;
    },

    syncFiles: async (projectId: string, path: string) => {
        return await invokeTauriCommand({
            commandName: 'mzd_sync_files',
            args: { projectId, path }
        }) as SyncFilesResponse;
    },

    logMessage: async (message: string): Promise<void> => {
        await invokeTauriCommand({
            commandName: 'mzd_log_message',
            args: { message }
        });
    },

    isReady: () => {
        return isBridgeReady();
    }
};

/**
 * Check if the bridge is initialized.
 */
export function isBridgeReady(): boolean {
    return !!(window as any).__tauri_prod__ || (window as any).__tauri_2021__ || (window as any).__tauri__;
}
