/**
 * MicroZoukei RPC Bridge
 * 
 * This script is injected into the WebView's environment to bridge 
 * the frontend (microstudio.dev) with the local Rust backend.
 */

(function() {
    // Registry of available commands and their corresponding Tauri command names
    const COMMAND_MAP = {
        "listFiles": "mzd_list_files",
        "readFile": "mzd_read_file",
        "writeFile": "mzd_write_file",
        "deleteFile": "mzd_delete_file",
        "syncProject": "mzd_sync_project",
        "syncFiles": "mzd_sync_files"
    };

    /**
     * Internal function to dispatch commands to the Rust backend.
     * @param {string} commandKey - The key from COMMAND_MAP
    * @param {Object} args - Arguments for the command
    * @returns {Promise<any>}
    */
    async function dispatch(commandKey, args) {
        const commandName = COMMAND_MAP[commandKey];
        if (!commandName) {
            console.error(`[MicroZoukei] Unknown command: ${commandKey}`);
            throw new Error(`Unknown command: ${commandKey}`);
        }

        try {
            // Use Tauri's invoke to call the rust-side mzd_ commands
            // Supports multiple potential injection points for different Tauri versions
            const result = await window.__tauri_prod__?.invoke(commandName, args) 
                        || await window.__tauri_2021__?.invoke(commandName, args)
                        || await window.__tauri__?.invoke(commandName, args);

            return result;
        } catch (error) {
            console.error(`[MicroZoukei] Error invoking ${commandName}:`, error);
            throw error;
        }
    }

    /**
     * Public API for the frontend to use.
     * exposes "microZoukei" global object.
     */
    const microZoukei = {
        listFiles: (path) => dispatch("listFiles", { path }),
        readFile: (path) => dispatch("readFile", { path }),
        writeFile: (path, content) => dispatch("writeFile", { path, content }),
        deleteFile: (path) => dispatch("deleteFile", { path }),
        syncProject: (projectId) => dispatch("syncProject", { projectId }),
        syncFiles: (projectId, path) => dispatch("syncFiles", { projectId, path }),

        // Helper to check if the bridge is initialized
        isReady: () => !!(window.__tauri_prod__ || window.__tauri_2021__ || window.__tauri__)
    };

    // Attach to window and log initialization
    window.microZoukei = microZoukei;
    console.log("[MicroZoukei] RPC Bridge initialized successfully.");

})();
