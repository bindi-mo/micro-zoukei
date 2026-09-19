var InjectedScript = (function(exports) {
  "use strict";
  async function fetchCommand(options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    try {
      const port = window.PROXY_PORT;
      if (typeof port !== "number" || isNaN(port)) {
        console.error("[RPC Bridge Error] PROXY_PORT is not defined on window object.");
        throw new Error("PROXY_PORT_NOT_SET");
      }
      const proxyUrl = `http://127.0.0.1:${port}/api/command`;
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
    syncFiles: async (title, files) => {
      return await fetchCommand({
        commandName: "mzd_sync_files",
        args: { title, files }
      });
    },
    logMessage: async (level, message) => {
      await fetchCommand({
        commandName: "mzd_log_message",
        args: { level, message }
      });
    },
    ensureInitialIndex: async () => {
      return await fetchCommand({
        commandName: "mzd_ensure_initial_index"
      });
    },
    isReady: () => {
      return true;
    }
  };
  async function checkBridgeHealth() {
    try {
      await fetchCommand({ commandName: "mzd_health" });
      return true;
    } catch {
      return false;
    }
  }
  const DEFAULT_CONTAINER = "body";
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
    const container = options?.container || document.querySelector(DEFAULT_CONTAINER);
    const existingStyle = document.getElementById("micro-zoukei-error-style");
    if (!existingStyle) {
      const styleSheet = document.createElement("style");
      styleSheet.id = "micro-zoukei-error-style";
      styleSheet.textContent = ERROR_STYLE;
      document.head.appendChild(styleSheet);
    }
    const errorDiv = document.createElement("div");
    errorDiv.className = ERROR_CLASS;
    if (options.showDetails) {
      errorDiv.innerHTML = `
            <strong>Error:</strong> ${escapeHtml(options.message)}
            <button onclick="this.parentElement.remove()">Dismiss</button>
        `;
    } else {
      errorDiv.innerHTML = `<strong>Error:</strong> ${escapeHtml(options.message)}<button onclick="this.parentElement.remove()">×</button>`;
    }
    if (container) {
      container.appendChild(errorDiv);
    }
    (async () => {
      await rpcBridge.logMessage("error", `[MicroZoukei] Error: ${options.message}`);
    })();
  }
  function hideAllErrors() {
    const errorElements = document.querySelectorAll(`.${ERROR_CLASS}`);
    errorElements.forEach((el) => el.remove());
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function __classPrivateFieldGet(receiver, state, kind, f) {
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }
  function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (typeof state === "function" ? receiver !== state || true : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return state.set(receiver, value), value;
  }
  typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
  };
  var _Resource_rid;
  const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
  function transformCallback(callback, once2 = false) {
    return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
  }
  async function invoke(cmd, args = {}, options) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  }
  class Resource {
    get rid() {
      return __classPrivateFieldGet(this, _Resource_rid, "f");
    }
    constructor(rid) {
      _Resource_rid.set(this, void 0);
      __classPrivateFieldSet(this, _Resource_rid, rid);
    }
    /**
     * Destroys and cleans up this resource from memory.
     * **You should not call any method on this object anymore and should drop any reference to it.**
     */
    async close() {
      return invoke("plugin:resources|close", {
        rid: this.rid
      });
    }
  }
  _Resource_rid = /* @__PURE__ */ new WeakMap();
  var TauriEvent;
  (function(TauriEvent2) {
    TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
    TauriEvent2["WINDOW_MOVED"] = "tauri://move";
    TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
    TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
    TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
    TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
    TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
    TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
    TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
    TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
    TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
    TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
    TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
    TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
    TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
    TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
  })(TauriEvent || (TauriEvent = {}));
  async function _unlisten(event, eventId) {
    window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
    await invoke("plugin:event|unlisten", {
      event,
      eventId
    });
  }
  async function listen(event, handler, options) {
    var _a;
    const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
    return invoke("plugin:event|listen", {
      event,
      target,
      handler: transformCallback(handler)
    }).then((eventId) => {
      return async () => _unlisten(event, eventId);
    });
  }
  async function once(event, handler, options) {
    return listen(event, (eventData) => {
      void _unlisten(event, eventData.id);
      handler(eventData);
    }, options);
  }
  async function emit(event, payload) {
    await invoke("plugin:event|emit", {
      event,
      payload
    });
  }
  async function emitTo(target, event, payload) {
    const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
    await invoke("plugin:event|emit_to", {
      target: eventTarget,
      event,
      payload
    });
  }
  var IndexModalState = /* @__PURE__ */ ((IndexModalState2) => {
    IndexModalState2[IndexModalState2["Idle"] = 0] = "Idle";
    IndexModalState2[IndexModalState2["InProgress"] = 1] = "InProgress";
    IndexModalState2[IndexModalState2["Completed"] = 2] = "Completed";
    IndexModalState2[IndexModalState2["Failed"] = 3] = "Failed";
    return IndexModalState2;
  })(IndexModalState || {});
  class IndexModal {
    overlay;
    modal;
    statusElement;
    progressBar;
    state = 0;
    active = false;
    mounted = false;
    listenersAttached = false;
    originalScrollY = 0;
    originalFocusElement = null;
    inertElements = [];
    constructor() {
      this.overlay = document.createElement("div");
      this.modal = document.createElement("div");
      this.statusElement = document.createElement("p");
      this.progressBar = document.createElement("div");
      this.initializeOverlay();
      this.initializeModal();
      this.attachEventListeners();
    }
    initializeOverlay() {
      this.overlay.id = "micro-zoukei-index-overlay";
      this.overlay.setAttribute("role", "presentation");
      this.overlay.style.cssText = `
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(15, 23, 42, 0.82);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;
    }
    initializeModal() {
      this.modal.id = "micro-zoukei-index-modal";
      this.modal.setAttribute("role", "alertdialog");
      this.modal.setAttribute("aria-modal", "true");
      this.modal.setAttribute("aria-labelledby", "micro-zoukei-index-title");
      this.modal.setAttribute("aria-describedby", "micro-zoukei-index-status");
      this.modal.setAttribute("aria-busy", "true");
      this.modal.tabIndex = -1;
      this.modal.style.cssText = `
            background-color: #1e293b;
            color: #e2e8f0;
            padding: 40px;
            border: 1px solid #334155;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            transform: scale(0.9);
            transition: transform 0.3s ease;
            outline: none;
        `;
      const title = document.createElement("h2");
      title.id = "micro-zoukei-index-title";
      title.style.cssText = "font-size: 24px; font-weight: 600; margin: 0 0 8px;";
      title.textContent = "Initializing Knowledge Base";
      this.statusElement.id = "micro-zoukei-index-status";
      this.statusElement.style.cssText = "font-size: 16px; color: #94a3b8; margin: 0 0 24px;";
      this.statusElement.setAttribute("aria-live", "polite");
      this.statusElement.textContent = "Starting index validation...";
      const progressContainer = document.createElement("div");
      progressContainer.id = "micro-zoukei-index-progress";
      progressContainer.style.cssText = "width: 100%; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;";
      progressContainer.setAttribute("role", "progressbar");
      progressContainer.setAttribute("aria-label", "Initial index progress");
      progressContainer.setAttribute("aria-valuemin", "0");
      progressContainer.setAttribute("aria-valuemax", "100");
      progressContainer.setAttribute("aria-valuenow", "0");
      this.progressBar.id = "micro-zoukei-index-progress-bar";
      this.progressBar.style.cssText = "width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s ease;";
      progressContainer.appendChild(this.progressBar);
      this.modal.append(title, this.statusElement, progressContainer);
      this.overlay.appendChild(this.modal);
    }
    attachEventListeners() {
      this.overlay.addEventListener("click", (event) => {
        if (event.target === this.overlay && this.state !== 1) {
          this.hide();
        }
      });
      this.overlay.addEventListener("wheel", (event) => {
        if (this.active) event.preventDefault();
      }, { passive: false });
      this.overlay.addEventListener("touchmove", (event) => {
        if (this.active) event.preventDefault();
      }, { passive: false });
      document.addEventListener("keydown", this.keydownHandler, { capture: true });
      this.listenersAttached = true;
    }
    keydownHandler = (event) => {
      if (!this.active) return;
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = this.getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        this.modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    getFocusableElements() {
      return Array.from(
        this.modal.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
    }
    mount() {
      if (this.mounted) return true;
      const body = document.body;
      if (!body) return false;
      body.appendChild(this.overlay);
      this.mounted = true;
      return true;
    }
    restorePageState() {
      if (document.body) {
        document.body.style.overflow = "";
      }
      this.inertElements.forEach(({ element, wasInert }) => {
        element.inert = wasInert;
      });
      this.inertElements = [];
      try {
        window.scrollTo(0, this.originalScrollY);
      } catch {
      }
      if (this.originalFocusElement?.isConnected) {
        this.originalFocusElement.focus();
      } else {
        this.modal.blur();
      }
      this.originalFocusElement = null;
    }
    show(state, options = {}) {
      if (state !== 1) {
        this.state = state;
        this.hide();
        return;
      }
      if (!this.mount()) return;
      this.state = state;
      if (!this.active) {
        this.active = true;
        this.originalScrollY = window.scrollY;
        this.originalFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.inertElements = Array.from(document.body.children).filter((element) => element instanceof HTMLElement && element !== this.overlay).map((element) => ({ element, wasInert: element.inert }));
        this.inertElements.forEach(({ element }) => {
          element.inert = true;
        });
        document.body.style.overflow = "hidden";
        this.overlay.style.display = "flex";
        requestAnimationFrame(() => this.modal.focus());
      }
      this.modal.setAttribute("aria-busy", "true");
      this.statusElement.textContent = options.message || "Indexing knowledge base...";
    }
    hide() {
      this.overlay.style.display = "none";
      if (!this.active) return;
      this.active = false;
      this.modal.setAttribute("aria-busy", "false");
      this.restorePageState();
    }
    updateProgress(percentage) {
      const value = Math.max(0, Math.min(100, percentage));
      this.progressBar.style.width = `${value}%`;
      this.progressBar.parentElement?.setAttribute("aria-valuenow", String(value));
    }
    dispose() {
      if (this.active) {
        this.hide();
      }
      if (this.listenersAttached) {
        document.removeEventListener("keydown", this.keydownHandler, { capture: true });
        this.listenersAttached = false;
      }
      this.overlay.remove();
      this.mounted = false;
      this.state = 0;
      this.originalScrollY = 0;
      this.originalFocusElement = null;
      this.inertElements = [];
    }
  }
  let indexModal;
  const getIndexModal = () => {
    indexModal ??= new IndexModal();
    return indexModal;
  };
  function showIndexModal(state, options) {
    getIndexModal().show(state, options ?? {});
  }
  function hideIndexModal() {
    indexModal?.hide();
  }
  function disposeIndexModal() {
    indexModal?.dispose();
    indexModal = void 0;
  }
  const INITIAL_INDEX_EVENT = "initial-index-status";
  const INITIAL_INDEX_RESPONSE_TIMEOUT_MS = 3e3;
  let frontendState = "idle";
  let unlistenInitialIndexStatus;
  let listenerRegistration = null;
  let listenerGeneration = 0;
  let requestResolve;
  let responseTimeoutId;
  let requestGeneration = 0;
  let activeRequestGeneration = null;
  function clearInitialIndexResponseTimeout() {
    if (responseTimeoutId !== void 0) {
      clearTimeout(responseTimeoutId);
      responseTimeoutId = void 0;
    }
  }
  function resolveActiveRequest() {
    const resolve = requestResolve;
    requestResolve = void 0;
    resolve?.();
  }
  function failInitialIndexRequest(error) {
    if (frontendState === "completed" || frontendState === "failed") {
      return;
    }
    frontendState = "failed";
    activeRequestGeneration = null;
    clearInitialIndexResponseTimeout();
    resolveActiveRequest();
    const errorMessage = error instanceof Error ? error.message : "Unknown indexing error";
    showIndexingFailure(errorMessage);
  }
  function showIndexingProgress(status) {
    showIndexModal(IndexModalState.InProgress, {
      message: status === "started" ? "Starting initial knowledge base index..." : "Indexing knowledge base in progress..."
    });
  }
  function showIndexingFailure(error) {
    hideIndexModal();
    showError({
      message: `Initial knowledge base indexing failed: ${error}`,
      showDetails: true
    });
  }
  function handleInitialIndexStatus(payload) {
    if (frontendState === "completed" || frontendState === "failed") {
      return;
    }
    switch (payload.status) {
      case "started":
      case "in_progress":
        frontendState = "in_progress";
        showIndexingProgress(payload.status);
        break;
      case "completed":
        frontendState = "completed";
        activeRequestGeneration = null;
        clearInitialIndexResponseTimeout();
        resolveActiveRequest();
        hideIndexModal();
        void rpcBridge.logMessage(
          "info",
          `[MicroZoukei] Initial index completed with ${payload.documentCount ?? 0} documents`
        );
        break;
      case "failed": {
        const errorMessage = payload.error || "Unknown indexing error";
        failInitialIndexRequest(new Error(errorMessage));
        break;
      }
    }
  }
  function handleInitialIndexResponse(response) {
    if (frontendState === "completed" || frontendState === "failed") {
      return;
    }
    switch (response.status) {
      case "already_valid":
        frontendState = "completed";
        activeRequestGeneration = null;
        clearInitialIndexResponseTimeout();
        resolveActiveRequest();
        hideIndexModal();
        break;
      case "in_progress":
      case "started":
        frontendState = "in_progress";
        showIndexingProgress(response.status);
        clearInitialIndexResponseTimeout();
        resolveActiveRequest();
        break;
    }
  }
  function startInitialIndexEventListening() {
    if (unlistenInitialIndexStatus) {
      return Promise.resolve();
    }
    if (listenerRegistration) {
      return listenerRegistration;
    }
    const generation = ++listenerGeneration;
    const registration = listen(INITIAL_INDEX_EVENT, (event) => {
      handleInitialIndexStatus(event.payload);
    }).then((unlisten) => {
      if (generation !== listenerGeneration) {
        unlisten();
        return;
      }
      unlistenInitialIndexStatus = unlisten;
    }).catch((error) => {
      console.error("[MicroZoukei] Failed to subscribe to initial index events:", error);
      if (generation === listenerGeneration) {
        unlistenInitialIndexStatus = void 0;
      }
    });
    listenerRegistration = registration;
    void registration.finally(() => {
      if (listenerRegistration === registration) {
        listenerRegistration = null;
      }
    });
    return registration;
  }
  function requestInitialIndexStatus() {
    if (frontendState === "completed" || frontendState === "in_progress") {
      return Promise.resolve();
    }
    frontendState = "in_progress";
    showIndexingProgress("started");
    const generation = ++requestGeneration;
    activeRequestGeneration = generation;
    const promise = new Promise((resolve) => {
      requestResolve = resolve;
    });
    responseTimeoutId = setTimeout(() => {
      responseTimeoutId = void 0;
      if (activeRequestGeneration !== generation) {
        return;
      }
      failInitialIndexRequest(
        new Error(`Initial indexing request timed out: backend did not respond within ${INITIAL_INDEX_RESPONSE_TIMEOUT_MS / 1e3} seconds`)
      );
    }, INITIAL_INDEX_RESPONSE_TIMEOUT_MS);
    let request;
    try {
      request = rpcBridge.ensureInitialIndex();
    } catch (error) {
      request = Promise.reject(error);
    }
    void request.then((response) => {
      if (activeRequestGeneration === generation && frontendState !== "failed") {
        handleInitialIndexResponse(response);
      }
    }).catch((error) => {
      if (activeRequestGeneration === generation) {
        failInitialIndexRequest(error);
      }
    });
    return promise.finally(() => {
    });
  }
  function requestInitialIndexForProjectsRoute() {
    return requestInitialIndexStatus();
  }
  function cleanupInitialIndexLifecycle() {
    listenerGeneration += 1;
    const pendingRegistration = listenerRegistration;
    listenerRegistration = null;
    if (unlistenInitialIndexStatus) {
      unlistenInitialIndexStatus();
      unlistenInitialIndexStatus = void 0;
    }
    if (pendingRegistration) {
      void pendingRegistration.catch(() => void 0);
    }
    const resolve = requestResolve;
    requestResolve = void 0;
    clearInitialIndexResponseTimeout();
    activeRequestGeneration = null;
    requestGeneration += 1;
    frontendState = "idle";
    resolve?.();
    disposeIndexModal();
  }
  class LogicalSize {
    constructor(...args) {
      this.type = "Logical";
      if (args.length === 1) {
        if ("Logical" in args[0]) {
          this.width = args[0].Logical.width;
          this.height = args[0].Logical.height;
        } else {
          this.width = args[0].width;
          this.height = args[0].height;
        }
      } else {
        this.width = args[0];
        this.height = args[1];
      }
    }
    /**
     * Converts the logical size to a physical one.
     * @example
     * ```typescript
     * import { LogicalSize } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const size = new LogicalSize(400, 500);
     * const physical = size.toPhysical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toPhysical(scaleFactor) {
      return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        width: this.width,
        height: this.height
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class PhysicalSize {
    constructor(...args) {
      this.type = "Physical";
      if (args.length === 1) {
        if ("Physical" in args[0]) {
          this.width = args[0].Physical.width;
          this.height = args[0].Physical.height;
        } else {
          this.width = args[0].width;
          this.height = args[0].height;
        }
      } else {
        this.width = args[0];
        this.height = args[1];
      }
    }
    /**
     * Converts the physical size to a logical one.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const size = await appWindow.innerSize(); // PhysicalSize
     * const logical = size.toLogical(factor);
     * ```
     */
    toLogical(scaleFactor) {
      return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        width: this.width,
        height: this.height
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class Size {
    constructor(size) {
      this.size = size;
    }
    toLogical(scaleFactor) {
      return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
    }
    toPhysical(scaleFactor) {
      return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        [`${this.size.type}`]: {
          width: this.size.width,
          height: this.size.height
        }
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class LogicalPosition {
    constructor(...args) {
      this.type = "Logical";
      if (args.length === 1) {
        if ("Logical" in args[0]) {
          this.x = args[0].Logical.x;
          this.y = args[0].Logical.y;
        } else {
          this.x = args[0].x;
          this.y = args[0].y;
        }
      } else {
        this.x = args[0];
        this.y = args[1];
      }
    }
    /**
     * Converts the logical position to a physical one.
     * @example
     * ```typescript
     * import { LogicalPosition } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const position = new LogicalPosition(400, 500);
     * const physical = position.toPhysical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toPhysical(scaleFactor) {
      return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        x: this.x,
        y: this.y
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class PhysicalPosition {
    constructor(...args) {
      this.type = "Physical";
      if (args.length === 1) {
        if ("Physical" in args[0]) {
          this.x = args[0].Physical.x;
          this.y = args[0].Physical.y;
        } else {
          this.x = args[0].x;
          this.y = args[0].y;
        }
      } else {
        this.x = args[0];
        this.y = args[1];
      }
    }
    /**
     * Converts the physical position to a logical one.
     * @example
     * ```typescript
     * import { PhysicalPosition } from '@tauri-apps/api/dpi';
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     *
     * const appWindow = getCurrentWindow();
     * const factor = await appWindow.scaleFactor();
     * const position = new PhysicalPosition(400, 500);
     * const physical = position.toLogical(factor);
     * ```
     *
     * @since 2.0.0
     */
    toLogical(scaleFactor) {
      return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        x: this.x,
        y: this.y
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class Position {
    constructor(position) {
      this.position = position;
    }
    toLogical(scaleFactor) {
      return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
    }
    toPhysical(scaleFactor) {
      return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
    }
    [SERIALIZE_TO_IPC_FN]() {
      return {
        [`${this.position.type}`]: {
          x: this.position.x,
          y: this.position.y
        }
      };
    }
    toJSON() {
      return this[SERIALIZE_TO_IPC_FN]();
    }
  }
  class Image extends Resource {
    /**
     * Creates an Image from a resource ID. For internal use only.
     *
     * @ignore
     */
    constructor(rid) {
      super(rid);
    }
    /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
    static async new(rgba, width, height) {
      return invoke("plugin:image|new", {
        rgba: transformImage(rgba),
        width,
        height
      }).then((rid) => new Image(rid));
    }
    /**
     * Creates a new image using the provided bytes by inferring the file format.
     * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
     *
     * Only `ico` and `png` are supported (based on activated feature flag).
     *
     * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     */
    static async fromBytes(bytes) {
      return invoke("plugin:image|from_bytes", {
        bytes: transformImage(bytes)
      }).then((rid) => new Image(rid));
    }
    /**
     * Creates a new image using the provided path.
     *
     * Only `ico` and `png` are supported (based on activated feature flag).
     *
     * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     */
    static async fromPath(path) {
      return invoke("plugin:image|from_path", { path }).then((rid) => new Image(rid));
    }
    /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
    async rgba() {
      return invoke("plugin:image|rgba", {
        rid: this.rid
      }).then((buffer) => new Uint8Array(buffer));
    }
    /** Returns the size of this image.  */
    async size() {
      return invoke("plugin:image|size", { rid: this.rid });
    }
  }
  function transformImage(image) {
    const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
    return ret;
  }
  var UserAttentionType;
  (function(UserAttentionType2) {
    UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
    UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
  })(UserAttentionType || (UserAttentionType = {}));
  class CloseRequestedEvent {
    constructor(event) {
      this._preventDefault = false;
      this.event = event.event;
      this.id = event.id;
    }
    preventDefault() {
      this._preventDefault = true;
    }
    isPreventDefault() {
      return this._preventDefault;
    }
  }
  var ProgressBarStatus;
  (function(ProgressBarStatus2) {
    ProgressBarStatus2["None"] = "none";
    ProgressBarStatus2["Normal"] = "normal";
    ProgressBarStatus2["Indeterminate"] = "indeterminate";
    ProgressBarStatus2["Paused"] = "paused";
    ProgressBarStatus2["Error"] = "error";
  })(ProgressBarStatus || (ProgressBarStatus = {}));
  function getCurrentWindow() {
    return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    });
  }
  async function getAllWindows() {
    return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    })));
  }
  const localTauriEvents$1 = ["tauri://created", "tauri://error"];
  class Window {
    /**
     * Creates a new Window.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const appWindow = new Window('my-label');
     * appWindow.once('tauri://created', function () {
     *  // window successfully created
     * });
     * appWindow.once('tauri://error', function (e) {
     *  // an error happened creating the window
     * });
     * ```
     *
     * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
     * @returns The {@link Window} instance to communicate with the window.
     */
    constructor(label, options = {}) {
      var _a;
      this.label = label;
      this.listeners = /* @__PURE__ */ Object.create(null);
      if (!(options === null || options === void 0 ? void 0 : options.skip)) {
        invoke("plugin:window|create", {
          options: {
            ...options,
            parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
            label
          }
        }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
      }
    }
    /**
     * Gets the Window associated with the given label.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const mainWindow = Window.getByLabel('main');
     * ```
     *
     * @param label The window label.
     * @returns The Window instance to communicate with the window or null if the window doesn't exist.
     */
    static async getByLabel(label) {
      var _a;
      return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Get an instance of `Window` for the current window.
     */
    static getCurrent() {
      return getCurrentWindow();
    }
    /**
     * Gets a list of instances of `Window` for all available windows.
     */
    static async getAll() {
      return getAllWindows();
    }
    /**
     *  Gets the focused window.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window';
     * const focusedWindow = Window.getFocusedWindow();
     * ```
     *
     * @returns The Window instance or `undefined` if there is not any focused window.
     */
    static async getFocusedWindow() {
      for (const w of await getAllWindows()) {
        if (await w.isFocused()) {
          return w;
        }
      }
      return null;
    }
    /**
     * Listen to an emitted event on this window.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
     *   console.log(`Got error: ${payload}`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async listen(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return listen(event, handler, {
        target: { kind: "Window", label: this.label }
      });
    }
    /**
     * Listen to an emitted event on this window only once.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
     *   console.log(`Window initialized!`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async once(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return once(event, handler, {
        target: { kind: "Window", label: this.label }
      });
    }
    /**
     * Emits an event to all {@link EventTarget|targets}.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emit(event, payload) {
      if (localTauriEvents$1.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emit(event, payload);
    }
    /**
     * Emits an event to all {@link EventTarget|targets} matching the given target.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emitTo(target, event, payload) {
      if (localTauriEvents$1.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emitTo(target, event, payload);
    }
    /** @ignore */
    _handleTauriEvent(event, handler) {
      if (localTauriEvents$1.includes(event)) {
        if (!(event in this.listeners)) {
          this.listeners[event] = [handler];
        } else {
          this.listeners[event].push(handler);
        }
        return true;
      }
      return false;
    }
    // Getters
    /**
     * The scale factor that can be used to map physical pixels to logical pixels.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const factor = await getCurrentWindow().scaleFactor();
     * ```
     *
     * @returns The window's monitor scale factor.
     */
    async scaleFactor() {
      return invoke("plugin:window|scale_factor", {
        label: this.label
      });
    }
    /**
     * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const position = await getCurrentWindow().innerPosition();
     * ```
     *
     * @returns The window's inner position.
     */
    async innerPosition() {
      return invoke("plugin:window|inner_position", {
        label: this.label
      }).then((p) => new PhysicalPosition(p));
    }
    /**
     * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const position = await getCurrentWindow().outerPosition();
     * ```
     *
     * @returns The window's outer position.
     */
    async outerPosition() {
      return invoke("plugin:window|outer_position", {
        label: this.label
      }).then((p) => new PhysicalPosition(p));
    }
    /**
     * The physical size of the window's client area.
     * The client area is the content of the window, excluding the title bar and borders.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const size = await getCurrentWindow().innerSize();
     * ```
     *
     * @returns The window's inner size.
     */
    async innerSize() {
      return invoke("plugin:window|inner_size", {
        label: this.label
      }).then((s) => new PhysicalSize(s));
    }
    /**
     * The physical size of the entire window.
     * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const size = await getCurrentWindow().outerSize();
     * ```
     *
     * @returns The window's outer size.
     */
    async outerSize() {
      return invoke("plugin:window|outer_size", {
        label: this.label
      }).then((s) => new PhysicalSize(s));
    }
    /**
     * Gets the window's current fullscreen state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const fullscreen = await getCurrentWindow().isFullscreen();
     * ```
     *
     * @returns Whether the window is in fullscreen mode or not.
     */
    async isFullscreen() {
      return invoke("plugin:window|is_fullscreen", {
        label: this.label
      });
    }
    /**
     * Gets the window's current minimized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const minimized = await getCurrentWindow().isMinimized();
     * ```
     */
    async isMinimized() {
      return invoke("plugin:window|is_minimized", {
        label: this.label
      });
    }
    /**
     * Gets the window's current maximized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const maximized = await getCurrentWindow().isMaximized();
     * ```
     *
     * @returns Whether the window is maximized or not.
     */
    async isMaximized() {
      return invoke("plugin:window|is_maximized", {
        label: this.label
      });
    }
    /**
     * Gets the window's current focus state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const focused = await getCurrentWindow().isFocused();
     * ```
     *
     * @returns Whether the window is focused or not.
     */
    async isFocused() {
      return invoke("plugin:window|is_focused", {
        label: this.label
      });
    }
    /**
     * Gets the window's current decorated state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const decorated = await getCurrentWindow().isDecorated();
     * ```
     *
     * @returns Whether the window is decorated or not.
     */
    async isDecorated() {
      return invoke("plugin:window|is_decorated", {
        label: this.label
      });
    }
    /**
     * Gets the window's current resizable state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const resizable = await getCurrentWindow().isResizable();
     * ```
     *
     * @returns Whether the window is resizable or not.
     */
    async isResizable() {
      return invoke("plugin:window|is_resizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native maximize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const maximizable = await getCurrentWindow().isMaximizable();
     * ```
     *
     * @returns Whether the window's native maximize button is enabled or not.
     */
    async isMaximizable() {
      return invoke("plugin:window|is_maximizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native minimize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const minimizable = await getCurrentWindow().isMinimizable();
     * ```
     *
     * @returns Whether the window's native minimize button is enabled or not.
     */
    async isMinimizable() {
      return invoke("plugin:window|is_minimizable", {
        label: this.label
      });
    }
    /**
     * Gets the window's native close button state.
     *
     * #### Platform-specific
     *
     * - **iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const closable = await getCurrentWindow().isClosable();
     * ```
     *
     * @returns Whether the window's native close button is enabled or not.
     */
    async isClosable() {
      return invoke("plugin:window|is_closable", {
        label: this.label
      });
    }
    /**
     * Gets the window's current visible state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const visible = await getCurrentWindow().isVisible();
     * ```
     *
     * @returns Whether the window is visible or not.
     */
    async isVisible() {
      return invoke("plugin:window|is_visible", {
        label: this.label
      });
    }
    /**
     * Gets the window's current title.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const title = await getCurrentWindow().title();
     * ```
     */
    async title() {
      return invoke("plugin:window|title", {
        label: this.label
      });
    }
    /**
     * Gets the window's current theme.
     *
     * #### Platform-specific
     *
     * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const theme = await getCurrentWindow().theme();
     * ```
     *
     * @returns The window theme.
     */
    async theme() {
      return invoke("plugin:window|theme", {
        label: this.label
      });
    }
    /**
     * Whether the window is configured to be always on top of other windows or not.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
     * ```
     *
     * @returns Whether the window is visible or not.
     */
    async isAlwaysOnTop() {
      return invoke("plugin:window|is_always_on_top", {
        label: this.label
      });
    }
    async activityName() {
      return invoke("plugin:window|activity_name", {
        label: this.label
      });
    }
    async sceneIdentifier() {
      return invoke("plugin:window|scene_identifier", {
        label: this.label
      });
    }
    // Setters
    /**
     * Centers the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().center();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async center() {
      return invoke("plugin:window|center", {
        label: this.label
      });
    }
    /**
     *  Requests user attention to the window, this has no effect if the application
     * is already focused. How requesting for user attention manifests is platform dependent,
     * see `UserAttentionType` for details.
     *
     * Providing `null` will unset the request for user attention. Unsetting the request for
     * user attention might not be done automatically by the WM when the window receives input.
     *
     * #### Platform-specific
     *
     * - **macOS:** `null` has no effect.
     * - **Linux:** Urgency levels have the same effect.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().requestUserAttention();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async requestUserAttention(requestType) {
      let requestType_ = null;
      if (requestType) {
        if (requestType === UserAttentionType.Critical) {
          requestType_ = { type: "Critical" };
        } else {
          requestType_ = { type: "Informational" };
        }
      }
      return invoke("plugin:window|request_user_attention", {
        label: this.label,
        value: requestType_
      });
    }
    /**
     * Updates the window resizable flag.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setResizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setResizable(resizable) {
      return invoke("plugin:window|set_resizable", {
        label: this.label,
        value: resizable
      });
    }
    /**
     * Enable or disable the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setEnabled(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.0.0
     */
    async setEnabled(enabled) {
      return invoke("plugin:window|set_enabled", {
        label: this.label,
        value: enabled
      });
    }
    /**
     * Whether the window is enabled or disabled.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setEnabled(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.0.0
     */
    async isEnabled() {
      return invoke("plugin:window|is_enabled", {
        label: this.label
      });
    }
    /**
     * Sets whether the window's native maximize button is enabled or not.
     * If resizable is set to false, this setting is ignored.
     *
     * #### Platform-specific
     *
     * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMaximizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaximizable(maximizable) {
      return invoke("plugin:window|set_maximizable", {
        label: this.label,
        value: maximizable
      });
    }
    /**
     * Sets whether the window's native minimize button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMinimizable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinimizable(minimizable) {
      return invoke("plugin:window|set_minimizable", {
        label: this.label,
        value: minimizable
      });
    }
    /**
     * Sets whether the window's native close button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
     * - **iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setClosable(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setClosable(closable) {
      return invoke("plugin:window|set_closable", {
        label: this.label,
        value: closable
      });
    }
    /**
     * Sets the window title.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setTitle('Tauri');
     * ```
     *
     * @param title The new title
     * @returns A promise indicating the success or failure of the operation.
     */
    async setTitle(title) {
      return invoke("plugin:window|set_title", {
        label: this.label,
        value: title
      });
    }
    /**
     * Maximizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().maximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async maximize() {
      return invoke("plugin:window|maximize", {
        label: this.label
      });
    }
    /**
     * Unmaximizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().unmaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unmaximize() {
      return invoke("plugin:window|unmaximize", {
        label: this.label
      });
    }
    /**
     * Toggles the window maximized state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().toggleMaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async toggleMaximize() {
      return invoke("plugin:window|toggle_maximize", {
        label: this.label
      });
    }
    /**
     * Minimizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().minimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async minimize() {
      return invoke("plugin:window|minimize", {
        label: this.label
      });
    }
    /**
     * Unminimizes the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().unminimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unminimize() {
      return invoke("plugin:window|unminimize", {
        label: this.label
      });
    }
    /**
     * Sets the window visibility to true.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().show();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async show() {
      return invoke("plugin:window|show", {
        label: this.label
      });
    }
    /**
     * Sets the window visibility to false.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().hide();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async hide() {
      return invoke("plugin:window|hide", {
        label: this.label
      });
    }
    /**
     * Closes the window.
     *
     * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().close();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async close() {
      return invoke("plugin:window|close", {
        label: this.label
      });
    }
    /**
     * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().destroy();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async destroy() {
      return invoke("plugin:window|destroy", {
        label: this.label
      });
    }
    /**
     * Whether the window should have borders and bars.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setDecorations(false);
     * ```
     *
     * @param decorations Whether the window should have borders and bars.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setDecorations(decorations) {
      return invoke("plugin:window|set_decorations", {
        label: this.label,
        value: decorations
      });
    }
    /**
     * Whether or not the window should have shadow.
     *
     * #### Platform-specific
     *
     * - **Windows:**
     *   - `false` has no effect on decorated window, shadows are always ON.
     *   - `true` will make undecorated window have a 1px white border,
     * and on Windows 11, it will have a rounded corners.
     * - **Linux:** Unsupported.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setShadow(false);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setShadow(enable) {
      return invoke("plugin:window|set_shadow", {
        label: this.label,
        value: enable
      });
    }
    /**
     * Set window effects.
     */
    async setEffects(effects) {
      return invoke("plugin:window|set_effects", {
        label: this.label,
        value: effects
      });
    }
    /**
     * Clear any applied effects if possible.
     */
    async clearEffects() {
      return invoke("plugin:window|set_effects", {
        label: this.label,
        value: null
      });
    }
    /**
     * Whether the window should always be on top of other windows.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setAlwaysOnTop(true);
     * ```
     *
     * @param alwaysOnTop Whether the window should always be on top of other windows or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAlwaysOnTop(alwaysOnTop) {
      return invoke("plugin:window|set_always_on_top", {
        label: this.label,
        value: alwaysOnTop
      });
    }
    /**
     * Whether the window should always be below other windows.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setAlwaysOnBottom(true);
     * ```
     *
     * @param alwaysOnBottom Whether the window should always be below other windows or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAlwaysOnBottom(alwaysOnBottom) {
      return invoke("plugin:window|set_always_on_bottom", {
        label: this.label,
        value: alwaysOnBottom
      });
    }
    /**
     * Prevents the window contents from being captured by other apps.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setContentProtected(true);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setContentProtected(protected_) {
      return invoke("plugin:window|set_content_protected", {
        label: this.label,
        value: protected_
      });
    }
    /**
     * Resizes the window with a new inner size.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSize(size) {
      return invoke("plugin:window|set_size", {
        label: this.label,
        value: size instanceof Size ? size : new Size(size)
      });
    }
    /**
     * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
     * @example
     * ```typescript
     * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinSize(size) {
      return invoke("plugin:window|set_min_size", {
        label: this.label,
        value: size instanceof Size ? size : size ? new Size(size) : null
      });
    }
    /**
     * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
     * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaxSize(size) {
      return invoke("plugin:window|set_max_size", {
        label: this.label,
        value: size instanceof Size ? size : size ? new Size(size) : null
      });
    }
    /**
     * Sets the window inner size constraints.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
     * ```
     *
     * @param constraints The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSizeConstraints(constraints) {
      function logical(pixel) {
        return pixel ? { Logical: pixel } : null;
      }
      return invoke("plugin:window|set_size_constraints", {
        label: this.label,
        value: {
          minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
          minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
          maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
          maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
        }
      });
    }
    /**
     * Sets the window outer position.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
     * ```
     *
     * @param position The new position, in logical or physical pixels.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setPosition(position) {
      return invoke("plugin:window|set_position", {
        label: this.label,
        value: position instanceof Position ? position : new Position(position)
      });
    }
    /**
     * Sets the window fullscreen state.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFullscreen(true);
     * ```
     *
     * @param fullscreen Whether the window should go to fullscreen or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFullscreen(fullscreen) {
      return invoke("plugin:window|set_fullscreen", {
        label: this.label,
        value: fullscreen
      });
    }
    /**
     * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
     * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
     *
     * On other platforms, this is the same as {@link Window.setFullscreen}.
     *
     * @param fullscreen Whether the window should go to simple fullscreen or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSimpleFullscreen(fullscreen) {
      return invoke("plugin:window|set_simple_fullscreen", {
        label: this.label,
        value: fullscreen
      });
    }
    /**
     * Bring the window to front and focus.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFocus();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocus() {
      return invoke("plugin:window|set_focus", {
        label: this.label
      });
    }
    /**
     * Sets whether the window can be focused.
     *
     * #### Platform-specific
     *
     * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
     *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setFocusable(true);
     * ```
     *
     * @param focusable Whether the window can be focused.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocusable(focusable) {
      return invoke("plugin:window|set_focusable", {
        label: this.label,
        value: focusable
      });
    }
    /**
     * Sets the window icon.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setIcon('/tauri/awesome.png');
     * ```
     *
     * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     *
     * @param icon Icon bytes or path to the icon file.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIcon(icon) {
      return invoke("plugin:window|set_icon", {
        label: this.label,
        value: transformImage(icon)
      });
    }
    /**
     * Whether the window icon should be hidden from the taskbar or not.
     *
     * #### Platform-specific
     *
     * - **macOS:** Unsupported.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setSkipTaskbar(true);
     * ```
     *
     * @param skip true to hide window icon, false to show it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSkipTaskbar(skip) {
      return invoke("plugin:window|set_skip_taskbar", {
        label: this.label,
        value: skip
      });
    }
    /**
     * Grabs the cursor, preventing it from leaving the window.
     *
     * There's no guarantee that the cursor will be hidden. You should
     * hide it by yourself if you want so.
     *
     * #### Platform-specific
     *
     * - **Linux:** Unsupported.
     * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorGrab(true);
     * ```
     *
     * @param grab `true` to grab the cursor icon, `false` to release it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorGrab(grab) {
      return invoke("plugin:window|set_cursor_grab", {
        label: this.label,
        value: grab
      });
    }
    /**
     * Modifies the cursor's visibility.
     *
     * #### Platform-specific
     *
     * - **Windows:** The cursor is only hidden within the confines of the window.
     * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
     *   outside of the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorVisible(false);
     * ```
     *
     * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorVisible(visible) {
      return invoke("plugin:window|set_cursor_visible", {
        label: this.label,
        value: visible
      });
    }
    /**
     * Modifies the cursor icon of the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorIcon('help');
     * ```
     *
     * @param icon The new cursor icon.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorIcon(icon) {
      return invoke("plugin:window|set_cursor_icon", {
        label: this.label,
        value: icon
      });
    }
    /**
     * Sets the window background color.
     *
     * #### Platform-specific:
     *
     * - **Windows:** alpha channel is ignored.
     * - **iOS / Android:** Unsupported.
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.1.0
     */
    async setBackgroundColor(color) {
      return invoke("plugin:window|set_background_color", { color });
    }
    /**
     * Changes the position of the cursor in window coordinates.
     * @example
     * ```typescript
     * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
     * ```
     *
     * @param position The new cursor position.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorPosition(position) {
      return invoke("plugin:window|set_cursor_position", {
        label: this.label,
        value: position instanceof Position ? position : new Position(position)
      });
    }
    /**
     * Changes the cursor events behavior.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setIgnoreCursorEvents(true);
     * ```
     *
     * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIgnoreCursorEvents(ignore) {
      return invoke("plugin:window|set_ignore_cursor_events", {
        label: this.label,
        value: ignore
      });
    }
    /**
     * Starts dragging the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().startDragging();
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async startDragging() {
      return invoke("plugin:window|start_dragging", {
        label: this.label
      });
    }
    /**
     * Starts resize-dragging the window.
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().startResizeDragging();
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async startResizeDragging(direction) {
      return invoke("plugin:window|start_resize_dragging", {
        label: this.label,
        value: direction
      });
    }
    /**
     * Sets the badge count. It is app wide and not specific to this window.
     *
     * #### Platform-specific
     *
     * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setBadgeCount(5);
     * ```
     *
     * @param count The badge count. Use `undefined` to remove the badge.
     * @return A promise indicating the success or failure of the operation.
     */
    async setBadgeCount(count) {
      return invoke("plugin:window|set_badge_count", {
        label: this.label,
        value: count
      });
    }
    /**
     * Sets the badge cont **macOS only**.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setBadgeLabel("Hello");
     * ```
     *
     * @param label The badge label. Use `undefined` to remove the badge.
     * @return A promise indicating the success or failure of the operation.
     */
    async setBadgeLabel(label) {
      return invoke("plugin:window|set_badge_label", {
        label: this.label,
        value: label
      });
    }
    /**
     * Sets the overlay icon. **Windows only**
     * The overlay icon can be set for every window.
     *
     *
     * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     *
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "image-png"] }
     * ```
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from '@tauri-apps/api/window';
     * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
     * ```
     *
     * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
     * @return A promise indicating the success or failure of the operation.
     */
    async setOverlayIcon(icon) {
      return invoke("plugin:window|set_overlay_icon", {
        label: this.label,
        value: icon ? transformImage(icon) : void 0
      });
    }
    /**
     * Sets the taskbar progress state.
     *
     * #### Platform-specific
     *
     * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
     * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
     *
     * @example
     * ```typescript
     * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
     * await getCurrentWindow().setProgressBar({
     *   status: ProgressBarStatus.Normal,
     *   progress: 50,
     * });
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async setProgressBar(state) {
      return invoke("plugin:window|set_progress_bar", {
        label: this.label,
        value: state
      });
    }
    /**
     * Sets whether the window should be visible on all workspaces or virtual desktops.
     *
     * #### Platform-specific
     *
     * - **Windows / iOS / Android:** Unsupported.
     *
     * @since 2.0.0
     */
    async setVisibleOnAllWorkspaces(visible) {
      return invoke("plugin:window|set_visible_on_all_workspaces", {
        label: this.label,
        value: visible
      });
    }
    /**
     * Sets the title bar style. **macOS only**.
     *
     * @since 2.0.0
     */
    async setTitleBarStyle(style) {
      return invoke("plugin:window|set_title_bar_style", {
        label: this.label,
        value: style
      });
    }
    /**
     * Set window theme, pass in `null` or `undefined` to follow system theme
     *
     * #### Platform-specific
     *
     * - **Linux / macOS**: Theme is app-wide and not specific to this window.
     * - **iOS / Android:** Unsupported.
     *
     * @since 2.0.0
     */
    async setTheme(theme) {
      return invoke("plugin:window|set_theme", {
        label: this.label,
        value: theme
      });
    }
    // Listeners
    /**
     * Listen to window resize.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
     *  console.log('Window resized', size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onResized(handler) {
      return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
        e.payload = new PhysicalSize(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window move.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
     *  console.log('Window moved', position);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onMoved(handler) {
      return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
        e.payload = new PhysicalPosition(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window close requested. Emitted when the user requests to closes the window.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * import { confirm } from '@tauri-apps/api/dialog';
     * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
     *   const confirmed = await confirm('Are you sure?');
     *   if (!confirmed) {
     *     // user did not confirm closing the window; let's prevent it
     *     event.preventDefault();
     *   }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onCloseRequested(handler) {
      return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event) => {
        const evt = new CloseRequestedEvent(event);
        await handler(evt);
        if (!evt.isPreventDefault()) {
          await this.destroy();
        }
      });
    }
    /**
     * Listen to a file drop event.
     * The listener is triggered when the user hovers the selected files on the webview,
     * drops the files or cancels the operation.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/webview";
     * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
     *  if (event.payload.type === 'over') {
     *    console.log('User hovering', event.payload.position);
     *  } else if (event.payload.type === 'drop') {
     *    console.log('User dropped', event.payload.paths);
     *  } else {
     *    console.log('File drop cancelled');
     *  }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onDragDropEvent(handler) {
      const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
        handler({
          ...event,
          payload: {
            type: "enter",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
        handler({
          ...event,
          payload: {
            type: "over",
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
        handler({
          ...event,
          payload: {
            type: "drop",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
        handler({ ...event, payload: { type: "leave" } });
      });
      return () => {
        unlistenDrag();
        unlistenDrop();
        unlistenDragOver();
        unlistenCancel();
      };
    }
    /**
     * Listen to window focus change.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
     *  console.log('Focus changed, window is focused? ' + focused);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onFocusChanged(handler) {
      const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
        handler({ ...event, payload: true });
      });
      const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
        handler({ ...event, payload: false });
      });
      return () => {
        unlistenFocus();
        unlistenBlur();
      };
    }
    /**
     * Listen to window scale change. Emitted when the window's scale factor has changed.
     * The following user actions can cause DPI changes:
     * - Changing the display's resolution.
     * - Changing the display's scale factor (e.g. in Control Panel on Windows).
     * - Moving the window to a display with a different scale factor.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
     *  console.log('Scale changed', payload.scaleFactor, payload.size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onScaleChanged(handler) {
      return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
    }
    /**
     * Listen to the system theme change.
     *
     * @example
     * ```typescript
     * import { getCurrentWindow } from "@tauri-apps/api/window";
     * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
     *  console.log('New theme: ' + theme);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onThemeChanged(handler) {
      return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
    }
  }
  var BackgroundThrottlingPolicy;
  (function(BackgroundThrottlingPolicy2) {
    BackgroundThrottlingPolicy2["Disabled"] = "disabled";
    BackgroundThrottlingPolicy2["Throttle"] = "throttle";
    BackgroundThrottlingPolicy2["Suspend"] = "suspend";
  })(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
  var ScrollBarStyle;
  (function(ScrollBarStyle2) {
    ScrollBarStyle2["Default"] = "default";
    ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
  })(ScrollBarStyle || (ScrollBarStyle = {}));
  var Effect;
  (function(Effect2) {
    Effect2["AppearanceBased"] = "appearanceBased";
    Effect2["Light"] = "light";
    Effect2["Dark"] = "dark";
    Effect2["MediumLight"] = "mediumLight";
    Effect2["UltraDark"] = "ultraDark";
    Effect2["Titlebar"] = "titlebar";
    Effect2["Selection"] = "selection";
    Effect2["Menu"] = "menu";
    Effect2["Popover"] = "popover";
    Effect2["Sidebar"] = "sidebar";
    Effect2["HeaderView"] = "headerView";
    Effect2["Sheet"] = "sheet";
    Effect2["WindowBackground"] = "windowBackground";
    Effect2["HudWindow"] = "hudWindow";
    Effect2["FullScreenUI"] = "fullScreenUI";
    Effect2["Tooltip"] = "tooltip";
    Effect2["ContentBackground"] = "contentBackground";
    Effect2["UnderWindowBackground"] = "underWindowBackground";
    Effect2["UnderPageBackground"] = "underPageBackground";
    Effect2["Mica"] = "mica";
    Effect2["Blur"] = "blur";
    Effect2["Acrylic"] = "acrylic";
    Effect2["Tabbed"] = "tabbed";
    Effect2["TabbedDark"] = "tabbedDark";
    Effect2["TabbedLight"] = "tabbedLight";
  })(Effect || (Effect = {}));
  var EffectState;
  (function(EffectState2) {
    EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
    EffectState2["Active"] = "active";
    EffectState2["Inactive"] = "inactive";
  })(EffectState || (EffectState = {}));
  function getCurrentWebview() {
    return new Webview(getCurrentWindow(), window.__TAURI_INTERNALS__.metadata.currentWebview.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    });
  }
  async function getAllWebviews() {
    return invoke("plugin:webview|get_all_webviews").then((webviews) => webviews.map((w) => new Webview(new Window(w.windowLabel, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    }), w.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    })));
  }
  const localTauriEvents = ["tauri://created", "tauri://error"];
  class Webview {
    /**
     * Creates a new Webview.
     * @example
     * ```typescript
     * import { Window } from '@tauri-apps/api/window'
     * import { Webview } from '@tauri-apps/api/webview'
     * const appWindow = new Window('my-label')
     *
     * appWindow.once('tauri://created', async function() {
     *   const webview = new Webview(appWindow, 'my-label', {
     *     url: 'https://github.com/tauri-apps/tauri',
     *
     *     // create a webview with specific logical position and size
     *     x: 0,
     *     y: 0,
     *     width: 800,
     *     height: 600,
     *   });
     *
     *   webview.once('tauri://created', function () {
     *     // webview successfully created
     *   });
     *   webview.once('tauri://error', function (e) {
     *     // an error happened creating the webview
     *   });
     * });
     * ```
     *
     * @param window the window to add this webview to.
     * @param label The unique webview label. Must be alphanumeric: `a-zA-Z-/:_`.
     * @returns The {@link Webview} instance to communicate with the webview.
     */
    constructor(window2, label, options) {
      this.window = window2;
      this.label = label;
      this.listeners = /* @__PURE__ */ Object.create(null);
      if (!(options === null || options === void 0 ? void 0 : options.skip)) {
        invoke("plugin:webview|create_webview", {
          windowLabel: window2.label,
          options: {
            ...options,
            label
          }
        }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
      }
    }
    /**
     * Gets the Webview for the webview associated with the given label.
     * @example
     * ```typescript
     * import { Webview } from '@tauri-apps/api/webview';
     * const mainWebview = Webview.getByLabel('main');
     * ```
     *
     * @param label The webview label.
     * @returns The Webview instance to communicate with the webview or null if the webview doesn't exist.
     */
    static async getByLabel(label) {
      var _a;
      return (_a = (await getAllWebviews()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Get an instance of `Webview` for the current webview.
     */
    static getCurrent() {
      return getCurrentWebview();
    }
    /**
     * Gets a list of instances of `Webview` for all available webviews.
     */
    static async getAll() {
      return getAllWebviews();
    }
    /**
     * Listen to an emitted event on this webview.
     *
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * const unlisten = await getCurrentWebview().listen<string>('state-changed', (event) => {
     *   console.log(`Got error: ${payload}`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async listen(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return listen(event, handler, {
        target: { kind: "Webview", label: this.label }
      });
    }
    /**
     * Listen to an emitted event on this webview only once.
     *
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * const unlisten = await getCurrent().once<null>('initialized', (event) => {
     *   console.log(`Webview initialized!`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async once(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return once(event, handler, {
        target: { kind: "Webview", label: this.label }
      });
    }
    /**
     * Emits an event to all {@link EventTarget|targets}.
     *
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().emit('webview-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emit(event, payload) {
      if (localTauriEvents.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emit(event, payload);
    }
    /**
     * Emits an event to all {@link EventTarget|targets} matching the given target.
     *
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().emitTo('main', 'webview-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     *
     * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emitTo(target, event, payload) {
      if (localTauriEvents.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({
            event,
            id: -1,
            payload
          });
        }
        return;
      }
      return emitTo(target, event, payload);
    }
    /** @ignore */
    _handleTauriEvent(event, handler) {
      if (localTauriEvents.includes(event)) {
        if (!(event in this.listeners)) {
          this.listeners[event] = [handler];
        } else {
          this.listeners[event].push(handler);
        }
        return true;
      }
      return false;
    }
    // Getters
    /**
     * The position of the top-left hand corner of the webview's client area relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * const position = await getCurrentWebview().position();
     * ```
     *
     * @returns The webview's position.
     */
    async position() {
      return invoke("plugin:webview|webview_position", {
        label: this.label
      }).then((p) => new PhysicalPosition(p));
    }
    /**
     * The physical size of the webview's client area.
     * The client area is the content of the webview, excluding the title bar and borders.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * const size = await getCurrentWebview().size();
     * ```
     *
     * @returns The webview's size.
     */
    async size() {
      return invoke("plugin:webview|webview_size", {
        label: this.label
      }).then((s) => new PhysicalSize(s));
    }
    // Setters
    /**
     * Closes the webview.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().close();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async close() {
      return invoke("plugin:webview|webview_close", {
        label: this.label
      });
    }
    /**
     * Resizes the webview.
     * @example
     * ```typescript
     * import { getCurrent, LogicalSize } from '@tauri-apps/api/webview';
     * await getCurrentWebview().setSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical size.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSize(size) {
      return invoke("plugin:webview|set_webview_size", {
        label: this.label,
        value: size instanceof Size ? size : new Size(size)
      });
    }
    /**
     * Sets the webview position.
     * @example
     * ```typescript
     * import { getCurrent, LogicalPosition } from '@tauri-apps/api/webview';
     * await getCurrentWebview().setPosition(new LogicalPosition(600, 500));
     * ```
     *
     * @param position The new position, in logical or physical pixels.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setPosition(position) {
      return invoke("plugin:webview|set_webview_position", {
        label: this.label,
        value: position instanceof Position ? position : new Position(position)
      });
    }
    /**
     * Bring the webview to front and focus.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().setFocus();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocus() {
      return invoke("plugin:webview|set_webview_focus", {
        label: this.label
      });
    }
    /**
     * Sets whether the webview should automatically grow and shrink its size and position when the parent window resizes.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().setAutoResize(true);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAutoResize(autoResize) {
      return invoke("plugin:webview|set_webview_auto_resize", {
        label: this.label,
        value: autoResize
      });
    }
    /**
     * Hide the webview.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().hide();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async hide() {
      return invoke("plugin:webview|webview_hide", {
        label: this.label
      });
    }
    /**
     * Show the webview.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().show();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async show() {
      return invoke("plugin:webview|webview_show", {
        label: this.label
      });
    }
    /**
     * Set webview zoom level.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().setZoom(1.5);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setZoom(scaleFactor) {
      return invoke("plugin:webview|set_webview_zoom", {
        label: this.label,
        value: scaleFactor
      });
    }
    /**
     * Moves this webview to the given label.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().reparent('other-window');
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async reparent(window2) {
      return invoke("plugin:webview|reparent", {
        label: this.label,
        window: typeof window2 === "string" ? window2 : window2.label
      });
    }
    /**
     * Clears all browsing data for this webview.
     * @example
     * ```typescript
     * import { getCurrentWebview } from '@tauri-apps/api/webview';
     * await getCurrentWebview().clearAllBrowsingData();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async clearAllBrowsingData() {
      return invoke("plugin:webview|clear_all_browsing_data");
    }
    /**
     * Specify the webview background color.
     *
     * #### Platfrom-specific:
     *
     * - **macOS / iOS**: Not implemented.
     * - **Windows**:
     *   - On Windows 7, transparency is not supported and the alpha value will be ignored.
     *   - On Windows higher than 7: translucent colors are not supported so any alpha value other than `0` will be replaced by `255`
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.1.0
     */
    async setBackgroundColor(color) {
      return invoke("plugin:webview|set_webview_background_color", { color });
    }
    // Listeners
    /**
     * Listen to a file drop event.
     * The listener is triggered when the user hovers the selected files on the webview,
     * drops the files or cancels the operation.
     *
     * @example
     * ```typescript
     * import { getCurrentWebview } from "@tauri-apps/api/webview";
     * const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
     *  if (event.payload.type === 'over') {
     *    console.log('User hovering', event.payload.position);
     *  } else if (event.payload.type === 'drop') {
     *    console.log('User dropped', event.payload.paths);
     *  } else {
     *    console.log('File drop cancelled');
     *  }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * When the debugger panel is open, the drop position of this event may be inaccurate due to a known limitation.
     * To retrieve the correct drop position, please detach the debugger.
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async onDragDropEvent(handler) {
      const unlistenDragEnter = await this.listen(TauriEvent.DRAG_ENTER, (event) => {
        handler({
          ...event,
          payload: {
            type: "enter",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event) => {
        handler({
          ...event,
          payload: {
            type: "over",
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDragDrop = await this.listen(TauriEvent.DRAG_DROP, (event) => {
        handler({
          ...event,
          payload: {
            type: "drop",
            paths: event.payload.paths,
            position: new PhysicalPosition(event.payload.position)
          }
        });
      });
      const unlistenDragLeave = await this.listen(TauriEvent.DRAG_LEAVE, (event) => {
        handler({ ...event, payload: { type: "leave" } });
      });
      return () => {
        unlistenDragEnter();
        unlistenDragDrop();
        unlistenDragOver();
        unlistenDragLeave();
      };
    }
  }
  function getCurrentWebviewWindow() {
    const webview = getCurrentWebview();
    return new WebviewWindow(webview.label, { skip: true });
  }
  async function getAllWebviewWindows() {
    return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new WebviewWindow(w, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    })));
  }
  class WebviewWindow {
    /**
     * Creates a new {@link Window} hosting a {@link Webview}.
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
     * const webview = new WebviewWindow('my-label', {
     *   url: 'https://github.com/tauri-apps/tauri'
     * });
     * webview.once('tauri://created', function () {
     *  // webview successfully created
     * });
     * webview.once('tauri://error', function (e) {
     *  // an error happened creating the webview
     * });
     * ```
     *
     * @param label The unique webview label. Must be alphanumeric: `a-zA-Z-/:_`.
     * @returns The {@link WebviewWindow} instance to communicate with the window and webview.
     */
    constructor(label, options = {}) {
      var _a;
      this.label = label;
      this.listeners = /* @__PURE__ */ Object.create(null);
      if (!(options === null || options === void 0 ? void 0 : options.skip)) {
        invoke("plugin:webview|create_webview_window", {
          options: {
            ...options,
            parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
            label
          }
        }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
      }
    }
    /**
     * Gets the Webview for the webview associated with the given label.
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
     * const mainWebview = WebviewWindow.getByLabel('main');
     * ```
     *
     * @param label The webview label.
     * @returns The Webview instance to communicate with the webview or null if the webview doesn't exist.
     */
    static async getByLabel(label) {
      var _a;
      const webview = (_a = (await getAllWebviewWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
      if (webview) {
        return new WebviewWindow(webview.label, { skip: true });
      }
      return null;
    }
    /**
     * Get an instance of `Webview` for the current webview.
     */
    static getCurrent() {
      return getCurrentWebviewWindow();
    }
    /**
     * Gets a list of instances of `Webview` for all available webviews.
     */
    static async getAll() {
      return getAllWebviewWindows();
    }
    /**
     * Listen to an emitted event on this webview window.
     *
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
     * const unlisten = await WebviewWindow.getCurrent().listen<string>('state-changed', (event) => {
     *   console.log(`Got error: ${payload}`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async listen(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return listen(event, handler, {
        target: { kind: "WebviewWindow", label: this.label }
      });
    }
    /**
     * Listen to an emitted event on this webview window only once.
     *
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
     * const unlisten = await WebviewWindow.getCurrent().once<null>('initialized', (event) => {
     *   console.log(`Webview initialized!`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     */
    async once(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return () => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        };
      }
      return once(event, handler, {
        target: { kind: "WebviewWindow", label: this.label }
      });
    }
    /**
     * Set the window and webview background color.
     *
     * #### Platform-specific:
     *
     * - **Android / iOS:** Unsupported for the window layer.
     * - **macOS / iOS**: Not implemented for the webview layer.
     * - **Windows**:
     *   - alpha channel is ignored for the window layer.
     *   - On Windows 7, alpha channel is ignored for the webview layer.
     *   - On Windows 8 and newer, if alpha channel is not `0`, it will be ignored.
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 2.1.0
     */
    async setBackgroundColor(color) {
      return invoke("plugin:window|set_background_color", { color }).then(() => {
        return invoke("plugin:webview|set_webview_background_color", { color });
      });
    }
  }
  applyMixins(WebviewWindow, [Window, Webview]);
  function applyMixins(baseClass, extendedClasses) {
    (Array.isArray(extendedClasses) ? extendedClasses : [extendedClasses]).forEach((extendedClass) => {
      Object.getOwnPropertyNames(extendedClass.prototype).forEach((name) => {
        var _a;
        if (typeof baseClass.prototype === "object" && baseClass.prototype && name in baseClass.prototype)
          return;
        Object.defineProperty(
          baseClass.prototype,
          name,
          // eslint-disable-next-line
          (_a = Object.getOwnPropertyDescriptor(extendedClass.prototype, name)) !== null && _a !== void 0 ? _a : /* @__PURE__ */ Object.create(null)
        );
      });
    });
  }
  const createChatMarkup = () => {
    return `
    <div class="agent-chat-container" style="display: flex; flex-direction: column; height: 100%; color: #fff; font-family: sans-serif;">
      <!-- header -->
      <div style="padding: 15px; border-bottom: 1px solid #333; background: hsl(200, 30%, 30%);">
        <h3 style="margin: 0; font-size: 16px;">AI Coding Agent</h3>
      </div>

      <!-- Message display area -->
      <div id="chat-message-log" style="flex: 1; padding: 20px; overflow-y: auto; background: #1e1e1e; display: flex; flex-direction: column; gap: 12px;">
        <p id="chat-placeholder" style="color: #888; text-align: center; margin-top: 20px;">Please submit your questions to the AI ​​coding agent here.</p>
      </div>

      <!-- Input footer -->
      <div style="padding: 15px; background: #252526; border-top: 1px solid #333; display: flex; gap: 10px;">
        <input type="text" id="chat-user-input" placeholder="Consult with an agent about the code...."
          style="flex: 1; padding: 10px; background: #3c3c3c; border: 1px solid #555; color: #fff; border-radius: 4px; outline: none;">
        <button id="chat-send-button"
          style="padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          Send
        </button>
      </div>
    </div>
  `.trim();
  };
  const appendMessageToLog = (message) => {
    const logContainer = document.getElementById("chat-message-log");
    if (!logContainer) return;
    const placeholder = document.getElementById("chat-placeholder");
    if (placeholder) {
      placeholder.remove();
    }
    const msgElement = document.createElement("div");
    if (message.sender === "user") {
      msgElement.style.alignSelf = "flex-end";
      msgElement.style.backgroundColor = "#007acc";
      msgElement.style.borderRadius = "8px 8px 0 8px";
    } else {
      msgElement.style.alignSelf = "flex-start";
      msgElement.style.backgroundColor = "#333333";
      msgElement.style.borderRadius = "8px 8px 8px 0";
    }
    msgElement.style.maxWidth = "70%";
    msgElement.style.padding = "10px 14px";
    msgElement.style.lineHeight = "1.4";
    msgElement.style.wordBreak = "break-word";
    msgElement.textContent = message.text;
    logContainer.appendChild(msgElement);
    logContainer.scrollTop = logContainer.scrollHeight;
  };
  const handleSendMessage = () => {
    const inputEl = document.getElementById("chat-user-input");
    if (!inputEl || inputEl.value.trim() === "") return;
    const userText = inputEl.value;
    appendMessageToLog({
      sender: "user",
      text: userText
    });
    inputEl.value = "";
    setTimeout(() => {
      appendMessageToLog({
        sender: "agent",
        text: `Regarding "${userText}", I am currently analyzing the codebase...`
      });
    }, 800);
  };
  const setupAgentChatWindow = () => {
    const codeSection = document.getElementById("code-section");
    if (!codeSection) {
      console.error("The chat screen could not be initialized because #code-section could not be found.");
      return;
    }
    if (document.getElementById("agent-chat-window")) return;
    const chatWindow = document.createElement("div");
    chatWindow.id = "agent-chat-window";
    chatWindow.style.position = "absolute";
    chatWindow.style.display = "none";
    chatWindow.style.width = "571px";
    chatWindow.style.height = "100%";
    chatWindow.style.backgroundColor = "#1e1e1e";
    const updateWidth = () => {
      const sidemenuBar = document.getElementById("sidemenu");
      const sidemenuWidth = sidemenuBar && sidemenuBar.style.left !== "-60px" ? sidemenuBar.clientWidth : 0;
      const runtimeContainer = document.getElementById("runtime-container");
      const runtimeWidth = runtimeContainer ? runtimeContainer.clientWidth : 0;
      const codeSplitbar = document.getElementById("code-splitbar");
      const splitbarWidth = codeSplitbar ? codeSplitbar.clientWidth : 0;
      const offsetWidth = sidemenuWidth + runtimeWidth + splitbarWidth;
      if (offsetWidth > 0) {
        const mainWidth = window.innerWidth - offsetWidth;
        chatWindow.style.width = `${mainWidth}px`;
      }
    };
    window.addEventListener("resize", updateWidth);
    chatWindow.innerHTML = createChatMarkup();
    codeSection.appendChild(chatWindow);
    const sendBtn = chatWindow.querySelector("#chat-send-button");
    sendBtn?.addEventListener("click", handleSendMessage);
    const inputEl = chatWindow.querySelector("#chat-user-input");
    inputEl?.addEventListener("keydown", (e) => {
      const keyEvent = e;
      if (keyEvent.key === "Enter" && !keyEvent.isComposing) {
        e.preventDefault();
        handleSendMessage();
      }
    });
    console.log("The UI for the Agent chat window is now ready.");
  };
  const getTargetExtensions = (lang) => {
    const langLower = lang.toLowerCase();
    if (["python"].includes(langLower)) {
      return [".py"];
    }
    if (["javascript"].includes(langLower)) {
      return [".js"];
    }
    if (["lua"].includes(langLower)) {
      return [".lua"];
    }
    return [];
  };
  const convertFileExtensions = (filelist, lang) => {
    const targetExts = getTargetExtensions(lang);
    if (targetExts.length === 0) {
      return filelist;
    }
    return filelist.map((item) => {
      if (!item.file.toLowerCase().endsWith(".ms")) {
        return item;
      }
      const dir = item.file.substring(0, item.file.lastIndexOf("/"));
      const baseName = item.file.substring(item.file.lastIndexOf("/") + 1);
      const nameWithoutExt = baseName.replace(/\.ms$/i, "");
      const targetFiles = [];
      for (const ext of targetExts) {
        const targetPath = dir !== "" ? `${dir}/${nameWithoutExt}${ext}` : `${nameWithoutExt}${ext}`;
        targetFiles.push({
          file: targetPath,
          content: item.content,
          isBinaryBase64: item.isBinaryBase64
        });
      }
      return targetFiles.length > 0 ? targetFiles[0] : item;
    }).flat();
  };
  const saveAllFilesToLocal = async (title, lang, filelist) => {
    const processedFileList = convertFileExtensions(filelist, lang);
    console.log("Saving files locally:", title, lang, processedFileList.length);
    console.log(processedFileList);
    if (processedFileList.length > 0) {
      await rpcBridge.syncFiles(title, processedFileList);
    } else {
      console.log("not found files");
    }
  };
  const fetchAsBase64 = async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result;
        resolve(base64Url.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };
  const processFileItem = async (item) => {
    let fileContent = "";
    let isBinaryBase64 = false;
    if (typeof item.content === "string") {
      fileContent = item.content;
    } else if (typeof item.url === "string" && item.url.trim() !== "") {
      try {
        fileContent = await fetchAsBase64(item.url);
        isBinaryBase64 = true;
      } catch (e) {
        console.error(`[Sync Fetch Error] ${item.url}:`, e);
        return null;
      }
    }
    return {
      file: item.file.replace(/-/g, "/"),
      content: fileContent,
      isBinaryBase64
    };
  };
  const processFileGroup = async (fileTypeItems) => {
    const groupResults = [];
    for (const item of fileTypeItems) {
      const processedItem = await processFileItem(item);
      if (processedItem) {
        groupResults.push(processedItem);
      }
    }
    return groupResults;
  };
  const getMicroStudioFileList = async () => {
    const project = window.app?.project;
    if (!project) {
      console.error("There is no information about the project.");
      return [];
    }
    if (!Array.isArray(project.file_types)) {
      return [];
    }
    const fileList = [];
    for (const type of project.file_types) {
      const listKey = `${type}_list`;
      const fileTypeItems = project[listKey];
      if (Array.isArray(fileTypeItems)) {
        const groupResults = await processFileGroup(fileTypeItems);
        fileList.push(...groupResults);
      }
    }
    return fileList;
  };
  const isProjectDataReady = (project) => {
    if (!Array.isArray(project.file_types)) return false;
    for (const type of project.file_types) {
      const listKey = `${type}_list`;
      const fileTypeItems = project[listKey];
      if (Array.isArray(fileTypeItems)) {
        for (const item of fileTypeItems) {
          if (!item) continue;
          if (type === "source") {
            const isFetched = typeof item.fetched === "boolean" ? item.fetched : true;
            const hasContent = typeof item.content === "string" && item.content.length > 0;
            if (!isFetched && !hasContent) {
              return false;
            }
          } else {
            const hasUrl = typeof item.url === "string" && item.url.trim() !== "";
            const hasFile = typeof item.file === "string" && item.file.trim() !== "";
            if (!hasUrl && !hasFile) {
              return false;
            }
          }
        }
      }
    }
    return true;
  };
  let isProjectAlreadySaved = false;
  const overrideProjectLoaded = () => {
    const mainApp = window.app;
    if (!mainApp || typeof mainApp.openProject !== "function") {
      console.error("Not found window.app.openProject.");
      return;
    }
    if (mainApp.openProject.__isOverridden) return;
    const originalOpenProject = mainApp.openProject;
    const newOpenProject = function(...args) {
      const result = originalOpenProject.apply(this, args);
      isProjectAlreadySaved = false;
      let checkCount = 0;
      const MAX_CHECKS = 20;
      const waitForSourceList = async () => {
        if (isProjectAlreadySaved) return;
        const project = window.app?.project;
        if (project && Array.isArray(project.source_list) && project.source_list.length > 0 && isProjectDataReady(project)) {
          const lang = project.language;
          const title = project.title;
          isProjectAlreadySaved = true;
          const currentFiles = await getMicroStudioFileList();
          if (currentFiles.length > 0) {
            saveAllFilesToLocal(title, lang, currentFiles);
          }
          return;
        }
        checkCount++;
        if (checkCount >= MAX_CHECKS) {
          console.warn(`⚠️ time out`);
          return;
        }
        setTimeout(waitForSourceList, 200);
      };
      waitForSourceList();
      return result;
    };
    newOpenProject.__isOverridden = true;
    mainApp.openProject = newOpenProject;
    console.log("The event hook for `window.app.openProject` has completed.");
  };
  let flag_morespace = false;
  let elm = null;
  let morespace_icon = null;
  let cachedCodeEditor = null;
  let createdMoreSpaceIcon = false;
  let initializeAppExtensionCleanup = null;
  let initializationGeneration = 0;
  const visible_header = (visible) => {
    const header = document.getElementsByTagName("header")[0];
    const container = document.getElementsByClassName("main-container")[0];
    if (header && container) {
      if (visible) {
        header.style.top = "0";
      } else {
        header.style.top = "-60px";
      }
      if (container instanceof HTMLElement) {
        if (visible) {
          container.style.top = "60px";
        } else {
          container.style.top = "0";
        }
      }
    }
  };
  const visible_sidemenu = (visible) => {
    const sidemenu = document.getElementsByClassName("sidemenu")[0];
    if (sidemenu) {
      if (sidemenu instanceof HTMLElement) {
        if (visible) {
          sidemenu.style.left = "0";
        } else {
          sidemenu.style.left = "-60px";
        }
      }
    }
    const container = document.getElementsByClassName("section-container")[0];
    if (container) {
      if (container instanceof HTMLElement) {
        if (visible) {
          container.style.left = "60px";
          container.style.borderLeft = "solid 10px hsl(200,30%,30%)";
          container.style.borderRadius = "10px 0 0 0";
        } else {
          container.style.left = "1px";
          container.style.borderLeft = "solid 1px hsl(200,30%,30%)";
          container.style.borderRadius = "0";
        }
      }
    }
  };
  const visible_runbar = (visible) => {
    elm = document.getElementById("runbar");
    if (elm) {
      const firstRunbar = elm.children[0];
      if (firstRunbar instanceof HTMLElement) {
        if (visible) {
          firstRunbar.style.display = "inline-block";
        } else {
          firstRunbar.style.display = "none";
        }
      }
      const secondRunbar = elm.children[1];
      if (secondRunbar instanceof HTMLElement) {
        if (visible) {
          secondRunbar.style.marginLeft = "20px";
        } else {
          secondRunbar.style.marginLeft = "0";
        }
      }
    }
  };
  const visible_terminal_toolbar = (visible) => {
    elm = document.getElementById("terminal-toolbar");
    if (elm) {
      const firstChild = elm.children[0];
      if (firstChild instanceof HTMLElement) {
        if (visible) {
          firstChild.style.display = "inline-block";
        } else {
          firstChild.style.display = "none";
        }
      }
      const secondChild = elm.children[1];
      if (secondChild instanceof HTMLElement) {
        if (visible) {
          secondChild.style.marginLeft = "20px";
        } else {
          secondChild.style.marginLeft = "0";
        }
      }
    }
  };
  const hide_morespace = () => {
    visible_header(false);
    visible_sidemenu(false);
    visible_runbar(false);
    visible_terminal_toolbar(false);
  };
  const expose_morespace = () => {
    visible_header(true);
    visible_sidemenu(true);
    visible_runbar(true);
    visible_terminal_toolbar(true);
  };
  const toggle_morespace = () => {
    if (!morespace_icon) return;
    if (flag_morespace) {
      expose_morespace();
      morespace_icon.setAttribute("class", "fas fa-expand-arrows-alt");
    } else {
      hide_morespace();
      morespace_icon.setAttribute("class", "fas fa-compress-arrows-alt");
    }
    flag_morespace = !flag_morespace;
  };
  const injectAgentMenuItem = (appui) => {
    const ulElement = document.querySelector("#sidemenu ul");
    if (ulElement && document.getElementById("menuitem-agent") === null) {
      const htmlString = `
          <li id="menuitem-agent">
            <i class="fas fa-robot"></i><br> Agent</li>
        `.trim();
      ulElement.insertAdjacentHTML("afterbegin", htmlString);
      const agentMenu = document.getElementById("menuitem-agent");
      agentMenu?.addEventListener("click", (event) => {
        const targetAppUi = appui;
        if (targetAppUi && typeof targetAppUi.setSection === "function") {
          targetAppUi.setSection("agent", true);
        }
      });
    } else if (!ulElement) {
      console.error("The specified `ul` element was not found.");
    }
  };
  const removeElements = () => {
    const discordLink = document.querySelector(
      'a[href="https://discord.com/invite/BDMqjxd"][target="_blank"]'
    );
    if (discordLink) {
      discordLink.remove();
    }
    const communityLink = document.querySelector(
      'a[href="/community/"][target="_blank"]'
    );
    if (communityLink) {
      communityLink.remove();
    }
  };
  const overrideCreateFullscreenFeatures = (appui) => {
    if (!appui || typeof appui.createFullscreenFeatures !== "function") {
      console.error("Not found appui.createFullscreenFeatures function");
      return;
    }
    const appWindow = getCurrentWebviewWindow();
    const setupTauriFullscreen = () => {
      const button = document.getElementById("project-fullscreen");
      if (button) {
        const newButton = button.cloneNode(true);
        button.parentNode?.replaceChild(newButton, button);
        newButton.addEventListener("click", async (e) => {
          try {
            const isFullscreen = await appWindow.isFullscreen();
            if (isFullscreen) {
              await appWindow.setFullscreen(false);
              Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
              window.dispatchEvent(new Event("fullscreenchange"));
            } else {
              await appWindow.setFullscreen(true);
              Object.defineProperty(document, "fullscreenElement", {
                value: document.getElementById("projectview"),
                configurable: true
              });
              window.dispatchEvent(new Event("fullscreenchange"));
            }
          } catch (err) {
            console.error("Tauri Fullscreen Error:", err);
          }
        });
        window.addEventListener("fullscreenchange", () => {
          const projectview = document.getElementById("projectview");
          if (projectview) {
            if (document.fullscreenElement) {
              newButton.classList.remove("fa-expand");
              newButton.classList.add("fa-compress");
              projectview.style.background = "hsl(200,20%,15%)";
            } else {
              newButton.classList.add("fa-expand");
              newButton.classList.remove("fa-compress");
              projectview.style.background = "none";
            }
          }
        });
      } else {
        console.log("The specified `#project-fullscreen` element was not found.");
      }
    };
    appui.createFullscreenFeatures = function() {
      setupTauriFullscreen();
    };
    setupTauriFullscreen();
  };
  const overrideSetSection = (appui) => {
    if (!appui || typeof appui.setSection !== "function") {
      console.error("Not found appui.setSection function");
      return;
    }
    const originalSetSection = appui.setSection;
    appui.setSection = function(section, useraction) {
      let targetSection = section;
      if (section === "agent") {
        targetSection = "code";
      }
      const result = originalSetSection.apply(this, [targetSection, useraction]);
      const codeSection = document.getElementById("code-section");
      const codeEditor = document.getElementById("code-editor");
      const chatWindow = document.getElementById("agent-chat-window");
      const agentMenu = document.getElementById("menuitem-agent");
      const codeMenu = document.getElementById("menuitem-code");
      if (section === "agent") {
        if (chatWindow) chatWindow.style.display = "block";
        if (codeEditor && codeSection) {
          cachedCodeEditor = codeEditor;
          codeEditor.remove();
          console.log("Moved the editor off the screen.");
        }
        codeMenu?.classList.remove("selected");
        agentMenu?.classList.add("selected");
        if (useraction && this.app?.project) {
          this.app.app_state.pushState(
            `project.${this.app.project.slug}.agent`,
            `/projects/${this.app.project.slug}/agent/`
          );
        }
      } else {
        if (chatWindow) chatWindow.style.display = "none";
        agentMenu?.classList.remove("selected");
        if (cachedCodeEditor && codeSection) {
          codeSection.insertBefore(cachedCodeEditor, chatWindow);
          cachedCodeEditor = null;
          console.log("The editor has been restored to the screen.");
        }
        return result;
      }
      console.log("Successfully hijacked and extended setSection.");
    };
  };
  let originalSetMainSection = null;
  let wrappedSetMainSection = null;
  const restoreSetMainSectionOverride = () => {
    const appui = window.app?.appui;
    if (appui?.setMainSection === wrappedSetMainSection && originalSetMainSection) {
      appui.setMainSection = originalSetMainSection;
    }
    originalSetMainSection = null;
    wrappedSetMainSection = null;
  };
  const overrideSetMainSection = (appui) => {
    if (!appui || typeof appui.setMainSection !== "function") {
      console.error("Not found appui.setMainSection function");
      return () => void 0;
    }
    if (appui.setMainSection === wrappedSetMainSection) {
      return restoreSetMainSectionOverride;
    }
    const originalSetMainSectionRef = appui.setMainSection;
    const wrappedSetMainSectionRef = function(section, ...args) {
      const result = originalSetMainSectionRef.apply(this, [section, ...args]);
      if (section === "projects") {
        void requestInitialIndexForProjectsRoute();
      }
      return result;
    };
    originalSetMainSection = originalSetMainSectionRef;
    wrappedSetMainSection = wrappedSetMainSectionRef;
    appui.setMainSection = wrappedSetMainSectionRef;
    return restoreSetMainSectionOverride;
  };
  const injectRequiredStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
    .projectoption select {
      color: rgba(0,0,0, .8)
    }
    .projectheader #project-morespace {
      margin: 0;
      color: rgba(255,255,255,.5);
      border-radius: 3px ;
      padding: 4px;
    }
    .projectheader #project-morespace:hover {
      background: rgba(0,0,0,.25) ;
      color: rgba(255,255,255,.75);
    }
    .sidemenu li .fa-robot {
        color: hsla(190, 40%, 90%, 0.85);
    }
        `;
    document.head.appendChild(style);
  };
  const normalizePathname = (pathname) => {
    const normalized = pathname.trim();
    const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
  };
  const isProjectsRoute = () => normalizePathname(window.location.pathname) === "/projects/";
  const initializeAppExtension = async () => {
    initializeAppExtensionCleanup?.();
    const generation = ++initializationGeneration;
    await startInitialIndexEventListening();
    removeElements();
    const projectIcon = document.getElementById("project-icon");
    if (!document.getElementById("project-morespace") && projectIcon instanceof HTMLElement) {
      const icon = document.createElement("i");
      icon.setAttribute("class", "fas fa-expand-arrows-alt");
      icon.setAttribute("id", "project-morespace");
      icon.setAttribute("title", "Toggle More Space");
      icon.onclick = () => {
        toggle_morespace();
      };
      projectIcon.after(icon);
      morespace_icon = icon;
      createdMoreSpaceIcon = true;
    }
    elm = document.getElementsByTagName("header")[0];
    const style = window.getComputedStyle(elm);
    let prop = style.getPropertyValue("transition-property");
    elm.style.transitionProperty = prop + ", top";
    prop = style.getPropertyValue("transition-duration");
    elm.style.transitionDuration = prop + ", 0.5s";
    elm.ontransitionend = () => {
      window.dispatchEvent(new Event("resize"));
    };
    elm.ontransitionstart = () => {
      window.dispatchEvent(new Event("resize"));
    };
    injectRequiredStyles();
    const targetAppUi = window.app?.appui;
    injectAgentMenuItem(targetAppUi);
    overrideSetSection(targetAppUi);
    overrideCreateFullscreenFeatures(targetAppUi);
    setupAgentChatWindow();
    overrideProjectLoaded();
    let restoreSetMainSection = null;
    if (targetAppUi && typeof targetAppUi.setMainSection === "function") {
      restoreSetMainSection = overrideSetMainSection(targetAppUi);
    }
    if (isProjectsRoute()) {
      void requestInitialIndexForProjectsRoute();
    }
    const cleanup = () => {
      if (generation !== initializationGeneration) {
        return;
      }
      restoreSetMainSection?.();
      cleanupInitialIndexLifecycle();
      if (createdMoreSpaceIcon && morespace_icon?.isConnected) {
        morespace_icon.remove();
      }
      if (morespace_icon) {
        morespace_icon.onclick = null;
      }
      if (createdMoreSpaceIcon) {
        flag_morespace = false;
      }
      createdMoreSpaceIcon = false;
      morespace_icon = null;
      initializeAppExtensionCleanup = null;
    };
    initializeAppExtensionCleanup = cleanup;
    return cleanup;
  };
  const PROXY_PORT = 8080;
  let activeCleanup = null;
  let initializationToken = 0;
  let pendingInitializationTimeout;
  const clearPendingInitialization = () => {
    if (pendingInitializationTimeout !== void 0) {
      clearTimeout(pendingInitializationTimeout);
      pendingInitializationTimeout = void 0;
    }
  };
  const waitForMicroStudioLoad = (token) => {
    return new Promise((resolve) => {
      const check = () => {
        if (token !== initializationToken) {
          return;
        }
        if (window.app?.appui?.setMainSection) {
          resolve();
          return;
        }
        pendingInitializationTimeout = setTimeout(check, 100);
      };
      check();
    });
  };
  const waitForDomReady = async () => {
    if (document.body) return;
    await new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  };
  const cleanupInjectedScript = () => {
    initializationToken += 1;
    clearPendingInitialization();
    hideAllErrors();
    if (window.microZoukei) {
      delete window.microZoukei;
    }
    if (activeCleanup) {
      const cleanup = activeCleanup;
      activeCleanup = null;
      cleanup();
    }
    cleanupInitialIndexLifecycle();
    delete window.microZoukeiInjectedState;
  };
  const initializeInjectedScript = async () => {
    const token = ++initializationToken;
    try {
      await waitForDomReady();
      if (token !== initializationToken) {
        return;
      }
    } catch {
      return;
    }
    window.microZoukeiInjectedState = {
      cleanup: cleanupInjectedScript
    };
    window.PROXY_PORT = PROXY_PORT;
    try {
      const ready = await checkBridgeHealth();
      if (!ready || token !== initializationToken) {
        return;
      }
      window.microZoukei = rpcBridge;
      rpcBridge.logMessage("info", "[MicroZoukei] RPC Bridge initialized and ready");
      await waitForMicroStudioLoad(token);
      if (token !== initializationToken) {
        return;
      }
      const cleanup = await initializeAppExtension();
      if (token !== initializationToken) {
        cleanup();
        return;
      }
      activeCleanup = cleanup;
    } catch (error) {
      if (token !== initializationToken) {
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown initialization error";
      showError({
        message: `MicroZoukei initialization failed: ${message}`,
        showDetails: true
      });
    }
  };
  if (typeof window !== "undefined") {
    console.log("[MicroZoukei] Injected script loaded and executing");
    void initializeInjectedScript();
  }
  exports.cleanupInjectedScript = cleanupInjectedScript;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
