/**
 * MicroZoukei RPC Bridge Module
 * Handles all command invocations via the local proxy server
 */

import type {
    EnsureInitialIndexResponse, FileEntry, LogLevel,
    MicroZoukeiAPI, ProjectFileItem, SyncFilesResponse
} from '../types/injected';

const COMMAND_MAP: Record<string, string> = {
    listFiles: 'mzd_list_files',
    readFile: 'mzd_read_file',
    writeFile: 'mzd_write_file',
    deleteFile: 'mzd_delete_file',
    syncFiles: 'mzd_sync_files',
    log: 'mzd_log_message',
    health: 'mzd_health',
};

/**
 * Internal function to dispatch commands via the proxy server.
 */
async function fetchCommand(options: { commandName: string; args?: any }): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
        // Use local proxy server instead of remote microstudio.dev
        const port = (window as any).PROXY_PORT;
        if (typeof port !== 'number' || isNaN(port)) {
            console.error('[RPC Bridge Error] PROXY_PORT is not defined on window object.');
            throw new Error('PROXY_PORT_NOT_SET');
        }

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

function stringifyLogArg(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    if (value === undefined) {
        return 'undefined';
    }

    if (value === null) {
        return 'null';
    }

    try {
        if (typeof value === 'object') {
            return JSON.stringify(value) ?? String(value);
        }

        return String(value);
    } catch {
        return String(value);
    }
}

async function log(level: LogLevel, ...args: unknown[]): Promise<void> {
    const message = args.map(stringifyLogArg).join(' ');
    await fetchCommand({
        commandName: 'mzd_log_message',
        args: { level, message }
    });
}

log.debug = (...args: unknown[]): Promise<void> =>
    log('debug', ...args);

log.info = (...args: unknown[]): Promise<void> =>
    log('info', ...args);

log.warn = (...args: unknown[]): Promise<void> =>
    log('warn', ...args);

log.error = (...args: unknown[]): Promise<void> =>
    log('error', ...args);

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

    writeFile: async (path: string, file: ProjectFileItem) => {
        return await fetchCommand({
            commandName: 'mzd_write_file',
            args: { path, file }
        }) as boolean;
    },

    deleteFile: async (path: string) => {
        return await fetchCommand({
            commandName: 'mzd_delete_file',
            args: { path }
        }) as boolean;
    },

    syncFiles: async (title: string, files: ProjectFileItem[]) => {
        return await fetchCommand({
            commandName: 'mzd_sync_files',
            args: { title, files }
        }) as SyncFilesResponse;
    },

    log,

    ensureInitialIndex: async () => {
        return await fetchCommand({
            commandName: 'mzd_ensure_initial_index'
        }) as EnsureInitialIndexResponse;
    },

    isReady: () => {
        return true;
    },
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
