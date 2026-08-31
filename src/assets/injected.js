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
    logMessage: async (message) => {
      await fetchCommand({
        commandName: "mzd_log_message",
        args: { message }
      });
    },
    isReady: () => {
      return exports.bridgeReady;
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
    (async () => {
      await rpcBridge.logMessage(`[MicroZoukei] Error: ${options.message}`);
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
  const createChatMarkup = () => {
    return `
    <div class="agent-chat-container" style="display: flex; flex-direction: column; height: 100%; color: #fff; font-family: sans-serif;">
      <!-- header -->
      <div style="padding: 15px; border-bottom: 1px solid #333; background: #252526;">
        <h3 style="margin: 0; font-size: 16px;">🤖 AI Coding Agent</h3>
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
    chatWindow.style.display = "none";
    chatWindow.style.width = "100%";
    chatWindow.style.height = "100%";
    chatWindow.style.backgroundColor = "#1e1e1e";
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
  let morespace_icon = document.createElement("i");
  let cachedCodeEditor = null;
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
    const oldButton = document.getElementById("project-fullscreen");
    if (oldButton) {
      oldButton.remove();
    }
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
  const injectRequiredStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
    .projectoption select {
      color: rgba(0,0,0, .8)
    }
    .projectheader #project-morespace {
      margin: 0 10px 0 0 ;
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
  const initializeAppExtension = () => {
    removeElements();
    elm = document.getElementById("project-morespace");
    if (!elm) {
      morespace_icon.setAttribute("class", "fas fa-expand-arrows-alt");
      morespace_icon.setAttribute("id", "project-morespace");
      morespace_icon.setAttribute("title", "Toggle More Space");
      morespace_icon.onclick = () => {
        toggle_morespace();
      };
      elm = document.getElementById("project-icon");
      if (elm && elm instanceof HTMLElement) {
        elm.after(morespace_icon);
      }
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
    setupAgentChatWindow();
    overrideProjectLoaded();
  };
  const PROXY_PORT = 8080;
  exports.bridgeReady = false;
  const cleanupInjectedScript = () => {
    hideAllErrors();
    if (window.microZoukei) {
      delete window.microZoukei;
    }
  };
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
  const waitForMicroStudioLoad = () => {
    const isLoaded = window.app && window.app.appui;
    if (isLoaded) {
      console.log("🎯 I have confirmed that microStudio has started. I will now begin extending the UI.");
      setTimeout(() => {
        initializeAppExtension();
      }, 100);
      return;
    }
    requestAnimationFrame(waitForMicroStudioLoad);
  };
  if (typeof window !== "undefined") {
    console.log("[MicroZoukei] Injected script loaded and executing");
    cleanupInjectedScript();
    window.PROXY_PORT = PROXY_PORT;
    void checkBridgeHealth().then((ready) => {
      exports.bridgeReady = ready;
      if (exports.bridgeReady) {
        window.microZoukei = rpcBridge;
        rpcBridge.logMessage("[MicroZoukei] RPC Bridge initialized and ready");
        waitForMicroStudioLoad();
      } else {
        showError({
          message: "Tauri API not available. Please ensure the app is running."
        });
        console.warn("[MicroZoukei] Tauri API not yet available. Will initialize when injected.");
      }
    });
  }
  exports.cleanupInjectedScript = cleanupInjectedScript;
  exports.withLoading = withLoading;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
