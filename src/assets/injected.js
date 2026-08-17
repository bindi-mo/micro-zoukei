var InjectedScript = (function(exports) {
  "use strict";
  async function getProxyPort() {
    if (typeof window !== "undefined") {
      const win = window;
      if (win.getProxyPort) {
        return await win.getProxyPort();
      }
    }
    return 8080;
  }
  async function fetchCommand(options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e4);
    try {
      const port = await getProxyPort();
      const proxyUrl = `http://127.0.0.1:${port}/api/command`;
      console.log("[RPC Bridge] Sending command via local proxy:", proxyUrl);
      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          command: options.commandName,
          args: options.args || {}
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      if (!result.success) {
        let errorMessage = result.error || "Command failed";
        if (errorMessage.includes("File not found")) {
          errorMessage = `File not found: ${result.error}`;
        } else if (errorMessage.includes("Permission denied")) {
          errorMessage = "Permission denied when accessing the file";
        } else if (errorMessage.includes("Invalid path")) {
          errorMessage = "The specified path is invalid";
        }
        throw new Error(errorMessage);
      }
      return result.data;
    } catch (error) {
      console.error(`[MicroZoukei] Error invoking ${options.commandName}:`, error);
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error("Failed to connect to local proxy server. Is the app running?");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  const rpcBridge = {
    listFiles: async (path) => {
      return await fetchCommand({
        commandName: "mzd_list_files",
        args: { path }
      });
    },
    readFile: async (path) => {
      return await fetchCommand({
        commandName: "mzd_read_file",
        args: { path }
      });
    },
    writeFile: async (path, content) => {
      return await fetchCommand({
        commandName: "mzd_write_file",
        args: { path, content }
      });
    },
    deleteFile: async (path) => {
      return await fetchCommand({
        commandName: "mzd_delete_file",
        args: { path }
      });
    },
    syncProject: async (projectId) => {
      return await fetchCommand({
        commandName: "mzd_sync_project",
        args: projectId ? { projectId } : void 0
      });
    },
    syncFiles: async (projectId, path) => {
      return await fetchCommand({
        commandName: "mzd_sync_files",
        args: { projectId, path }
      });
    },
    logMessage: async (message) => {
      await fetchCommand({
        commandName: "mzd_log_message",
        args: { message }
      });
    },
    isReady: () => {
      return isBridgeReady();
    },
    getProxyPort: async () => {
      if (typeof window !== "undefined") {
        const win = window;
        if (win.getProxyPort) {
          return await win.getProxyPort();
        }
      }
      return 8080;
    }
  };
  function isBridgeReady() {
    return true;
  }
  const ERROR_CLASS = "micro-zoukei-error";
  function hideAllErrors() {
    const errorElements = document.querySelectorAll(`.${ERROR_CLASS}`);
    errorElements.forEach((el) => el.remove());
    rpcBridge.logMessage("[MicroZoukei] All errors dismissed");
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
  const PROXY_PORT = 8080;
  if (typeof window !== "undefined") {
    window.getProxyPort = async () => {
      return PROXY_PORT;
    };
  }
  function initMicroZoukei() {
    rpcBridge.logMessage("[MicroZoukei] Initializing...");
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
    {
      initMicroZoukei();
    }
  }
  exports.cleanupInjectedScript = cleanupInjectedScript;
  exports.initMicroZoukei = initMicroZoukei;
  exports.withLoading = withLoading;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
