/**
 * MicroZoukei RPC Bridge Types
 * Defines the interface between frontend JavaScript and Rust backend commands
 */

export interface FileEntry {
    name: string;
    path: string;
    size?: number;
    modified?: Date;
}

export interface SyncProjectResponse {
    success: boolean;
    message?: string;
    files_synced?: number;
}

export interface SyncFilesResponse {
    success: boolean;
    message?: string;
    errors?: Array<{ path: string; error: string }>;
}

/**
 * RPC Bridge API exposed to the WebView environment
 */
export interface MicroZoukeiAPI {
    /** List files in a directory */
    listFiles(path?: string): Promise<FileEntry[]>;

    /** Read file content */
    readFile(path: string): Promise<string>;

    /** Write file content */
    writeFile(path: string, content: string): Promise<boolean>;

    /** Delete a file */
    deleteFile(path: string): Promise<boolean>;

    /** Sync project state */
    syncProject(projectId?: string): Promise<SyncProjectResponse>;

    /** Sync specific files */
    syncFiles(projectId: string, path: string): Promise<SyncFilesResponse>;

    /** Log a message to the backend */
    logMessage(message: string): Promise<void>;

    /** Check if the bridge is initialized */
    isReady(): boolean;
}

/**
 * Tauri command invocation options
 */
export interface InvokeOptions {
    commandName: string;
    args?: Record<string, unknown>;
}
