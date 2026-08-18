/**
 * MicroZoukei RPC Bridge Module
 * Handles all command invocations via the local proxy server
 */

import { bridgeReady } from '../injected';
import type { FileEntry, MicroZoukeiAPI, SyncFilesResponse, SyncProjectResponse } from '../types/injected';

const COMMAND_MAP: Record<string, string> = {
    listFiles: 'mzd_list_files',
    readFile: 'mzd_read_file',
    writeFile: 'mzd_write_file',
    deleteFile: 'mzd_delete_file',
    syncProject: 'mzd_sync_project',
    syncFiles: 'mzd_sync_files',
    logMessage: 'mzd_log_message',
    health: 'mzd_health',
};

// Get proxy port from Tauri API (exposed via injected.ts)
async function getProxyPort(): Promise<number> {
    if (typeof window !== 'undefined') {
        const win = window as unknown as { microZoukei?: MicroZoukeiAPI; getProxyPort: () => Promise<number> };
        if (win.getProxyPort) {
            return await win.getProxyPort();
        }
    }
    // Fallback for testing without Tauri
    return 8080;
}

/**
 * Internal function to dispatch commands via the proxy server.
 */
async function fetchCommand(options: { commandName: string; args?: any }): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
        // Use local proxy server instead of remote microstudio.dev
        const port = await getProxyPort();
        const proxyUrl = `http://127.0.0.1:${port}/api/command`;
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                command: options.commandName,
                args: options.args || {},
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        if (!result.success) {
            // Map proxy/handler errors to user-friendly messages
            let errorMessage = result.error || 'Command failed';

            // Handle common error patterns from handlers.rs
            if (errorMessage.includes('File not found')) {
                errorMessage = `File not found: ${result.error}`;
            } else if (errorMessage.includes('Permission denied')) {
                errorMessage = 'Permission denied when accessing the file';
            } else if (errorMessage.includes('Invalid path')) {
                errorMessage = 'The specified path is invalid';
            }

            throw new Error(errorMessage);
        }

        return result.data;
    } catch (error) {
        console.error(`[MicroZoukei] Error invoking ${options.commandName}:`, error);

        // Handle network errors specifically
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Failed to connect to local proxy server. Is the app running?');
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * RPC Bridge implementation exposed to the WebView environment.
 */
export const rpcBridge: MicroZoukeiAPI = {
    listFiles: async (path?: string) => {
        return await fetchCommand({
            commandName: 'mzd_list_files',
            args: { path }
        }) as FileEntry[];
    },

    readFile: async (path: string) => {
        return await fetchCommand({
            commandName: 'mzd_read_file',
            args: { path }
        }) as string;
    },

    writeFile: async (path: string, content: string) => {
        return await fetchCommand({
            commandName: 'mzd_write_file',
            args: { path, content }
        }) as boolean;
    },

    deleteFile: async (path: string) => {
        return await fetchCommand({
            commandName: 'mzd_delete_file',
            args: { path }
        }) as boolean;
    },

    syncProject: async (projectId?: string) => {
        return await fetchCommand({
            commandName: 'mzd_sync_project',
            args: projectId ? { projectId } : undefined
        }) as SyncProjectResponse;
    },

    syncFiles: async (projectId: string, path: string) => {
        return await fetchCommand({
            commandName: 'mzd_sync_files',
            args: { projectId, path }
        }) as SyncFilesResponse;
    },

    logMessage: async (message: string): Promise<void> => {
        await fetchCommand({
            commandName: 'mzd_log_message',
            args: { message }
        });
    },

    isReady: () => {
        return bridgeReady;
    },

    getProxyPort: async (): Promise<number> => {
        if (typeof window !== 'undefined') {
            const win = window as unknown as { microZoukei?: MicroZoukeiAPI; getProxyPort: () => Promise<number> };
            if (win.getProxyPort) {
                return await win.getProxyPort();
            }
        }
        // Fallback for testing without Tauri
        return 8080;
    }
};

/**
 * Check if the bridge is healthy by testing connectivity.
 */
export async function checkBridgeHealth(): Promise<boolean> {
    try {
        await fetchCommand({ commandName: 'mzd_health' });
        return true;
    } catch {
        return false;
    }
}
