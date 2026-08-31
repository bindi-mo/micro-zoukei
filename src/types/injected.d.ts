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

export interface SyncFilesResponse {
    success: boolean;
    message?: string;
    errors?: Array<{ path: string; error: string }>;
    files_processed?: number;
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

    /** Sync project files to local workspace */
    syncFiles(title: string, files: ProjectFileItem[]): Promise<SyncFilesResponse>;

    /** Log a message to the backend */
    logMessage(message: string): Promise<void>;

    /** Check if the bridge is initialized */
    isReady(): boolean;
}

/**
 * Represents an individual file in a project for synchronization.
 */
export interface ProjectFileItem {
    file: string;
    content: string;
    isBinaryBase64: boolean;
}
