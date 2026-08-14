var InjectedScript = (function(exports) {
  "use strict";
  const DEFAULT_CONTAINER$1 = "body";
  const ERROR_CLASS = "micro-zoukei-error";
  const ERROR_STYLE = `
    .${ERROR_CLASS} {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #dc2626;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        z-index: 999998;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .${ERROR_CLASS} > button {
        margin-top: 10px;
        padding: 5px 10px;
        background-color: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        border-radius: 4px;
        cursor: pointer;
    }

    .${ERROR_CLASS} > button:hover {
        background-color: rgba(255, 255, 255, 0.3);
    }
`;
  function showError(options) {
    const container = options?.container || document.querySelector(DEFAULT_CONTAINER$1);
    const existingStyle = document.getElementById("micro-zoukei-error-style");
    if (!existingStyle) {
      const styleSheet = document.createElement("style");
      styleSheet.id = "micro-zoukei-error-style";
      styleSheet.textContent = ERROR_STYLE;
      document.head.appendChild(styleSheet);
    }
    const errorDiv = document.createElement("div");
    errorDiv.className = ERROR_CLASS;
    {
      errorDiv.innerHTML = `
            <strong>Error:</strong> ${escapeHtml(options.message)}
            <button onclick="this.parentElement.remove()">Dismiss</button>
        `;
    }
    if (container) {
      container.appendChild(errorDiv);
    }
    await rpcBridge.logMessage(`[MicroZoukei] Error: ${options.message}`);
  }
  function hideAllErrors() {
    const errorElements = document.querySelectorAll(`.${ERROR_CLASS}`);
    errorElements.forEach((el) => el.remove());
    rpcBridge.logMessage("[MicroZoukei] All errors dismissed");
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  const DEFAULT_CONTAINER = "body";
  const LOADING_CLASS = "micro-zoukei-loading";
  const SPINNER_STYLE = `
    .${LOADING_CLASS}::after {
        content: '';
        display: inline-block;
        width: 40px;
        height: 40px;
        border: 3px solid #374151;
        border-radius: 50%;
        border-top-color: #60a5fa;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
  const CUSTOM_STYLE = `
    .${LOADING_CLASS} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(15, 23, 42, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
    }

    .${LOADING_CLASS} > div {
        text-align: center;
        color: #e5e7eb;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
`;
  function showLoading(options) {
    const container = options?.container || document.querySelector(DEFAULT_CONTAINER);
    if (!container) return;
    if (document.body.classList.contains(LOADING_CLASS)) {
      rpcBridge.logMessage("[MicroZoukei] Loading already visible");
      return;
    }
    const existingStyle = document.getElementById("micro-zoukei-loading-style");
    if (!existingStyle) {
      const styleSheet = document.createElement("style");
      styleSheet.id = "micro-zoukei-loading-style";
      styleSheet.textContent = SPINNER_STYLE + CUSTOM_STYLE;
      document.head.appendChild(styleSheet);
    }
    const loadingDiv = document.createElement("div");
    loadingDiv.className = LOADING_CLASS;
    if (options?.message) {
      loadingDiv.innerHTML = `
            <div>
                ${options.showSpinner !== false ? '<span class="spinner"></span>' : ""}
                <p>${options.message || "Loading..."}</p>
            </div>
        `;
    } else if (options?.showSpinner === false) {
      loadingDiv.innerHTML = `<p>Loading...</p>`;
    }
    container.appendChild(loadingDiv);
    rpcBridge.logMessage("[MicroZoukei] Loading indicator shown");
  }
  function hideLoading() {
    const loadingElement = document.querySelector(`.${LOADING_CLASS}`);
    if (loadingElement) {
      loadingElement.remove();
      rpcBridge.logMessage("[MicroZoukei] Loading indicator hidden");
    }
  }
  function isLoadingDisplayed() {
    return document.body.classList.contains(LOADING_CLASS);
  }
  async function invokeTauriCommand(options) {
    const tauriApi = window.__tauri_prod__ || window.__tauri_2021__ || window.__tauri__;
    if (!tauriApi) {
      throw new Error("Tauri API not available");
    }
    try {
      return await tauriApi.invoke(options.commandName, options.args);
    } catch (error) {
      console.error(`[MicroZoukei] Error invoking ${options.commandName}:`, error);
      throw error;
    }
  }
  const rpcBridge = {
    listFiles: async (path) => {
      return await invokeTauriCommand({
        commandName: "mzd_list_files",
        args: { path }
      });
    },
    readFile: async (path) => {
      return await invokeTauriCommand({
        commandName: "mzd_read_file",
        args: { path }
      });
    },
    writeFile: async (path, content) => {
      return await invokeTauriCommand({
        commandName: "mzd_write_file",
        args: { path, content }
      });
    },
    deleteFile: async (path) => {
      return await invokeTauriCommand({
        commandName: "mzd_delete_file",
        args: { path }
      });
    },
    syncProject: async (projectId) => {
      return await invokeTauriCommand({
        commandName: "mzd_sync_project",
        args: projectId ? { projectId } : void 0
      });
    },
    syncFiles: async (projectId, path) => {
      return await invokeTauriCommand({
        commandName: "mzd_sync_files",
        args: { projectId, path }
      });
    },
    logMessage: async (message) => {
      return await invokeTauriCommand({
        commandName: "mzd_log_message",
        args: { message }
      });
    },
    isReady: () => {
      return isBridgeReady();
    }
  };
  function isBridgeReady() {
    return !!window.__tauri_prod__ || window.__tauri_2021__ || window.__tauri__;
  }
  function initMicroZoukei() {
    rpcBridge.logMessage("[MicroZoukei] Initializing...");
    if (!isBridgeReady()) {
      showError({
        message: "Tauri API not available. Please ensure the app is running."
      });
      return;
    }
    window.microZoukei = rpcBridge;
    rpcBridge.logMessage("[MicroZoukei] RPC Bridge initialized successfully.");
  }
  function cleanupInjectedScript() {
    hideAllErrors();
    if (window.microZoukei) {
      delete window.microZoukei;
    }
    rpcBridge.logMessage("[MicroZoukei] Cleanup completed");
  }
  async function withLoading(operation, message) {
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
  if (typeof window !== "undefined") {
    rpcBridge.logMessage("[MicroZoukei] Injected script loaded");
    if (isBridgeReady()) {
      initMicroZoukei();
    } else {
      console.warn("[MicroZoukei] Tauri API not yet available. Will initialize when injected.");
    }
  }
  exports.cleanupInjectedScript = cleanupInjectedScript;
  exports.initMicroZoukei = initMicroZoukei;
  exports.withLoading = withLoading;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
