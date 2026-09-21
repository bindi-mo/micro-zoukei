import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { NOOP_CLEANUP, type Cleanup } from '../types/cleanup';
import { setupAgentChatWindow } from './agent-window';
import {
    cleanupInitialIndexLifecycle,
    requestInitialIndexForProjectsRoute,
    startInitialIndexEventListening,
} from './initial-index';
import { overrideProjectLoaded } from './project-files';
import { rpcBridge } from './rpc-bridge';

interface ElementRegistration {
    id: string;
    cleanup: Cleanup;
}

const UI_STYLE_ID = 'micro-zoukei-uiex-styles';
const FULLSCREEN_CLONE_ATTRIBUTE = 'data-micro-zoukei-fullscreen-clone';

const registrations = new Map<string, ElementRegistration>();

let flag_morespace = false;
let morespace_icon: HTMLElement | null = null;
let cachedCodeEditor: HTMLElement | null = null;
let createdMoreSpaceIcon = false;
let initializeAppExtensionCleanup: Cleanup | null = null;
let initializationGeneration = 0;

const runCleanup = (id: string): void => {
    const registration = registrations.get(id);
    if (!registration) return;

    registrations.delete(id);
    try {
        registration.cleanup();
    } catch (error) {
        rpcBridge.log.error(`Failed to clean up ${id}:`, error);
    }
};

const registerElement = (id: string, cleanup: Cleanup): void => {
    runCleanup(id);
    registrations.set(id, { id, cleanup });
};

const cleanupRegistrations = (): void => {
    for (const registration of [...registrations.values()].reverse()) {
        runCleanup(registration.id);
    }
};

// ---------------------------------------------------
// function
// ---------------------------------------------------
const visible_header = (visible: boolean): void => {
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

const visible_sidemenu = (visible: boolean): void => {
    const sidemenu = document.getElementsByClassName("sidemenu")[0];
    if (sidemenu instanceof HTMLElement) {
        sidemenu.style.left = visible ? "0" : "-60px";
    }

    const container = document.getElementsByClassName("section-container")[0];
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
};

const visible_runbar = (visible: boolean): void => {
    const runbar = document.getElementById('runbar');
    if (!runbar) return;

    const firstRunbar = runbar.children[0];
    if (firstRunbar instanceof HTMLElement) {
        firstRunbar.style.display = visible ? 'inline-block' : 'none';
    }

    const secondRunbar = runbar.children[1];
    if (secondRunbar instanceof HTMLElement) {
        secondRunbar.style.marginLeft = visible ? '20px' : '0';
    }
};

const visible_terminal_toolbar = (visible: boolean): void => {
    const terminalToolbar = document.getElementById('terminal-toolbar');
    if (!terminalToolbar) return;

    const firstChild = terminalToolbar.children[0];
    if (firstChild instanceof HTMLElement) {
        firstChild.style.display = visible ? 'inline-block' : 'none';
    }

    const secondChild = terminalToolbar.children[1];
    if (secondChild instanceof HTMLElement) {
        secondChild.style.marginLeft = visible ? '20px' : '0';
    }
};

const hide_morespace = (): void => {
    visible_header(false);
    visible_sidemenu(false);
    visible_runbar(false);
    visible_terminal_toolbar(false);
}

const expose_morespace = (): void => {
    visible_header(true);
    visible_sidemenu(true);
    visible_runbar(true);
    visible_terminal_toolbar(true);
}

const toggle_morespace = (): void => {
    if (!morespace_icon) return;

    if (flag_morespace) {
        expose_morespace();
        morespace_icon.setAttribute('class', 'fas fa-expand-arrows-alt');
    } else {
        hide_morespace();
        morespace_icon.setAttribute('class', 'fas fa-compress-arrows-alt');
    }

    // If the current value is true, it flips to false;
    // if it is false, it flips to true.
    flag_morespace = !flag_morespace;
}

const injectAgentMenuItem = (appui: any): Cleanup => {
    const ulElement = document.querySelector<HTMLUListElement>('#sidemenu ul');
    if (!ulElement) {
        rpcBridge.log.error('The specified `ul` element was not found.');
        return NOOP_CLEANUP;
    }

    const existingMenuItem = document.getElementById('menuitem-agent');
    if (existingMenuItem) {
        return NOOP_CLEANUP;
    }

    const htmlString = `
      <li id="menuitem-agent">
        <i class="fas fa-robot"></i><br> Agent</li>
    `.trim();

    ulElement.insertAdjacentHTML('afterbegin', htmlString);
    const agentMenu = document.getElementById('menuitem-agent');
    if (!agentMenu) {
        throw new Error('Failed to insert the Agent menu item.');
    }

    const handleAgentMenuClick = (): void => {
        if (appui && typeof appui.setSection === 'function') {
            // The value "true" for the second argument indicates that
            // the switch was initiated by the user.
            appui.setSection('agent', true);
        }
    };

    agentMenu.addEventListener('click', handleAgentMenuClick);
    return () => {
        agentMenu.removeEventListener('click', handleAgentMenuClick);
        if (agentMenu.isConnected) {
            agentMenu.remove();
        }
    };
};

// --------------------------------------------------------------------
// Deleting (or Hiding) Unnecessary Existing Elements
// --------------------------------------------------------------------
const removeElement = (selector: string): void => {
    document.querySelector(selector)?.remove();
};

const removeElements = (): void => {
    removeElement('a[href="https://discord.com/invite/BDMqjxd"][target="_blank"]');
    removeElement('a[href="/community/"][target="_blank"]');
    removeElement('div[id="qrcode-button"]');
    removeElement('a[id="run-link"]');
};

const overrideCreateFullscreenFeatures = (appui: any): Cleanup => {
    if (!appui || typeof appui.createFullscreenFeatures !== 'function') {
        rpcBridge.log.error('Not found appui.createFullscreenFeatures function');
        return NOOP_CLEANUP;
    }

    const appWindow = getCurrentWebviewWindow();
    const originalCreateFullscreenFeatures = appui.createFullscreenFeatures;
    let clone: HTMLElement | null = null;

    const clickHandler = async (): Promise<void> => {
        const activeClone = clone;
        if (!activeClone) return;

        try {
            const isFullscreen = await appWindow.isFullscreen();
            if (isFullscreen) {
                await appWindow.setFullscreen(false);
                try {
                    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
                } catch {
                    // Some webviews expose a non-configurable fullscreenElement.
                }
                window.dispatchEvent(new Event('fullscreenchange'));
            } else {
                await appWindow.setFullscreen(true);
                try {
                    Object.defineProperty(document, 'fullscreenElement', {
                        value: document.getElementById("projectview"),
                        configurable: true
                    });
                } catch {
                    // Some webviews expose a non-configurable fullscreenElement.
                }
                window.dispatchEvent(new Event('fullscreenchange'));
            }
        } catch (err) {
            rpcBridge.log.error("Tauri Fullscreen Error:", err);
        }
    };

    const changeListener = (): void => {
        const activeClone = clone;
        const projectview = document.getElementById("projectview");
        if (!activeClone || !projectview) return;

        if (document.fullscreenElement) {
            activeClone.classList.remove("fa-expand");
            activeClone.classList.add("fa-compress");
            projectview.style.background = "hsl(200,20%,15%)";
        } else {
            activeClone.classList.add("fa-expand");
            activeClone.classList.remove("fa-compress");
            projectview.style.background = "none";
        }
    };

    const setupTauriFullscreen = (): void => {
        const button = document.getElementById("project-fullscreen");

        if (!button || button.hasAttribute(FULLSCREEN_CLONE_ATTRIBUTE)) {
            return;
        }

        // Clone the button so the existing microStudio listener is removed and
        // replaced with a listener that uses the Tauri fullscreen API.
        const newButton = button.cloneNode(true) as HTMLElement;
        newButton.setAttribute(FULLSCREEN_CLONE_ATTRIBUTE, 'true');
        button.parentNode?.replaceChild(newButton, button);
        clone = newButton;

        newButton.addEventListener('click', clickHandler);
        window.addEventListener('fullscreenchange', changeListener);
    };

    // Override the instance method itself directly so that it will work properly when called in the future.
    const wrappedCreateFullscreenFeatures = (): void => {
        setupTauriFullscreen();
    };
    appui.createFullscreenFeatures = wrappedCreateFullscreenFeatures;

    // Since it has already been executed on the microStudio side, it will be applied immediately.
    setupTauriFullscreen();

    return () => {
        const activeClone = clone;
        if (activeClone) {
            activeClone.removeEventListener('click', clickHandler);
            window.removeEventListener('fullscreenchange', changeListener);
            activeClone.removeAttribute(FULLSCREEN_CLONE_ATTRIBUTE);
        }

        // Only restore the method if it is still our wrapper.
        if (appui.createFullscreenFeatures === wrappedCreateFullscreenFeatures) {
            appui.createFullscreenFeatures = originalCreateFullscreenFeatures;
        }

        clone = null;
    };
};

const overrideSetSection = (appui: any): Cleanup => {
    if (!appui || typeof appui.setSection !== 'function') {
        rpcBridge.log.error('Not found appui.setSection function');
        return NOOP_CLEANUP;
    }

    const originalSetSectionRef = appui.setSection;
    const wrappedSetSectionRef = function (this: any, section: string, useraction: boolean) {
        let targetSection = section;

        // ----------------------------------------------------
        // [Interrupt Handling] If "agent" is selected
        // ----------------------------------------------------
        if (section === 'agent') {
            // Fake the original function into thinking "code" was selected and
            // execute it. This causes the #code-section to appear, and all of
            // microStudio's complex resizing processes will run normally.
            targetSection = 'code';
        }

        // Execute the original function that was set aside
        const result = originalSetSectionRef.apply(this, [targetSection, useraction]);

        const codeSection = document.getElementById('code-section');
        const codeEditor = document.getElementById('code-editor');
        const chatWindow = document.getElementById('agent-chat-window');
        const agentMenu = document.getElementById('menuitem-agent');
        const codeMenu = document.getElementById('menuitem-code');

        if (section === 'agent') {
            if (chatWindow) {
                window.dispatchEvent(new Event('resize'));
                chatWindow.style.display = 'block';
            }

            if (codeEditor && codeSection) {
                cachedCodeEditor = codeEditor;
                codeEditor.remove();
                rpcBridge.log.debug('Moved the editor off the screen.');
            }

            // Adjusting the Appearance of the Menu Button
            // (Delete the code and activate the Agent)
            codeMenu?.classList.remove('selected');
            agentMenu?.classList.add('selected');

            // Replace the URL with /agent/ (following the example of
            // the last step in the original code)
            if (useraction && this.app?.project) {
                this.app.app_state.pushState(
                    `project.${this.app.project.slug}.agent`,
                    `/projects/${this.app.project.slug}/agent/`
                );
            }
        } else {
            // If you move to a section other than agent (such as sprites),
            // make sure to hide the chat screen.
            if (chatWindow) chatWindow.style.display = 'none';
            agentMenu?.classList.remove('selected');

            if (cachedCodeEditor && codeSection) {
                // Revert to the original editor before the chat window.
                codeSection.insertBefore(cachedCodeEditor, chatWindow);
                cachedCodeEditor = null;
                rpcBridge.log.info('The editor has been restored to the screen.');
            }
        }

        rpcBridge.log.info('Successfully hijacked and extended setSection.');
        return result;
    };

    appui.setSection = wrappedSetSectionRef;

    return () => {
        const codeSection = document.getElementById('code-section');
        const chatWindow = document.getElementById('agent-chat-window');
        if (cachedCodeEditor && codeSection) {
            codeSection.insertBefore(cachedCodeEditor, chatWindow);
        }
        cachedCodeEditor = null;

        if (appui.setSection === wrappedSetSectionRef) {
            appui.setSection = originalSetSectionRef;
        }
    };
};

const overrideSetMainSection = (appui: any): Cleanup => {
    if (!appui || typeof appui.setMainSection !== 'function') {
        rpcBridge.log.error('Not found appui.setMainSection function');
        return NOOP_CLEANUP;
    }

    const originalSetMainSectionRef = appui.setMainSection;
    const wrappedSetMainSectionRef = function (this: any, section: string, ...args: any[]) {
        const result = originalSetMainSectionRef.apply(this, [section, ...args]);

        if (section === 'projects') {
            void requestInitialIndexForProjectsRoute();
        }

        return result;
    };

    appui.setMainSection = wrappedSetMainSectionRef;

    return () => {
        if (appui.setMainSection === wrappedSetMainSectionRef) {
            appui.setMainSection = originalSetMainSectionRef;
        }
    };
};

const injectRequiredStyles = (): Cleanup => {
    const style = document.createElement('style');
    style.id = UI_STYLE_ID;
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
    return () => style.remove();
}

const normalizePathname = (pathname: string): string => {
    const normalized = pathname.trim();
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const isProjectsRoute = (): boolean => normalizePathname(window.location.pathname) === '/projects/';

/**
 * Key under which the active logical section is stashed on `window` between
 * injected-script re-injections. Module scope is reset by `eval`, so the value
 * must be persisted on the global object.
 */
const RESTORE_SECTION_KEY = '__microZoukeiRestoreSection';

/**
 * Snapshot the currently active logical section before teardown.
 *
 * microStudio's `AppUI.setSection` is wrapped so that selecting the agent
 * section fakes `'code'` internally; `appui.current_section` therefore cannot
 * be used for detection. Instead, the inline display state of
 * `#agent-chat-window` is used as a proxy: it is set to `'block'` only while
 * the agent section is active.
 */
const captureActiveSectionForReinjection = (): void => {
    const chatWindow = document.getElementById('agent-chat-window');
    const section =
        chatWindow instanceof HTMLElement && chatWindow.style.display !== 'none'
            ? 'agent'
            : null;

    (window as unknown as Record<string, string | null>)[RESTORE_SECTION_KEY] = section;
};

/**
 * Install the header resize animation and return a cleanup that restores it.
 */
const setupHeaderResizeAnimation = (): Cleanup => {
    const header = document.getElementsByTagName('header')[0];
    if (!(header instanceof HTMLElement)) {
        return NOOP_CLEANUP;
    }

    const originalTransitionProperty = header.style.transitionProperty;
    const originalTransitionDuration = header.style.transitionDuration;
    const transitionProperty = originalTransitionProperty
        ? `${originalTransitionProperty}, top`
        : 'top';
    const transitionDuration = originalTransitionDuration
        ? `${originalTransitionDuration}, 0.5s`
        : '0.5s';

    const transitionEndHandler = (event: TransitionEvent): void => {
        if (event.propertyName === 'top') {
            window.dispatchEvent(new Event('resize'));
        }
    };
    const transitionStartHandler = (event: TransitionEvent): void => {
        if (event.propertyName === 'top') {
            window.dispatchEvent(new Event('resize'));
        }
    };

    header.style.transitionProperty = transitionProperty;
    header.style.transitionDuration = transitionDuration;
    header.addEventListener('transitionend', transitionEndHandler);
    header.addEventListener('transitionstart', transitionStartHandler);

    return () => {
        header.removeEventListener('transitionend', transitionEndHandler);
        header.removeEventListener('transitionstart', transitionStartHandler);
        header.style.transitionProperty = originalTransitionProperty;
        header.style.transitionDuration = originalTransitionDuration;
    };
};

/**
 * Remove UI state owned by the initializer without changing More Space state.
 */
const resetModuleState = (): void => {
    const moreSpaceIcon = document.getElementById('project-morespace');
    if (moreSpaceIcon?.isConnected) {
        moreSpaceIcon.remove();
    }
    if (morespace_icon) {
        morespace_icon.onclick = null;
    }
    createdMoreSpaceIcon = false;
    morespace_icon = null;
    cachedCodeEditor = null;
};

/**
 * Initialize the injected UI extensions and the initial-index lifecycle.
 */
export const initializeAppExtension = async (): Promise<Cleanup> => {
    initializeAppExtensionCleanup?.();
    const generation = ++initializationGeneration;

    try {
        // Install lifecycle events before any navigation hook can trigger a request.
        await startInitialIndexEventListening();
        if (generation !== initializationGeneration) {
            return NOOP_CLEANUP;
        }

        // -------------------------------------------
        // step 1: remove
        // -------------------------------------------
        removeElements();

        // -------------------------------------------
        // step 2: add
        // -------------------------------------------
        // more space icon
        const projectIcon = document.getElementById('project-icon');
        if (!document.getElementById('project-morespace') && projectIcon instanceof HTMLElement) {
            const icon = document.createElement("i");
            icon.setAttribute('class', 'fas fa-expand-arrows-alt');
            icon.setAttribute('id', 'project-morespace');
            icon.setAttribute('title', 'Toggle More Space');
            icon.onclick = () => {
                toggle_morespace();
            }

            projectIcon.after(icon);
            morespace_icon = icon;
            createdMoreSpaceIcon = true;
        }

        // -------------------------------------------
        // step 3: insert
        // -------------------------------------------
        // resize animation on header
        registerElement('header-resize', setupHeaderResizeAnimation());

        // --------------------------------------------------------------------
        // step 4: agent window and process
        // --------------------------------------------------------------------
        registerElement('uiex-styles', injectRequiredStyles());

        const targetAppUi = (window as any).app?.appui;
        registerElement('agent-menu-item', injectAgentMenuItem(targetAppUi));
        registerElement('set-section-override', overrideSetSection(targetAppUi));
        registerElement(
            'fullscreen-override',
            overrideCreateFullscreenFeatures(targetAppUi)
        );
        registerElement('agent-chat-window', setupAgentChatWindow());
        registerElement('project-loaded-override', overrideProjectLoaded());

        if (targetAppUi && typeof targetAppUi.setMainSection === 'function') {
            registerElement(
                'set-main-section-override',
                overrideSetMainSection(targetAppUi)
            );
        }

        if (isProjectsRoute()) {
            void requestInitialIndexForProjectsRoute();
        }

        // -------------------------------------------------------------
        // step 5: restore the previously active section (re-injection only)
        // -------------------------------------------------------------
        // Read and consume the stashed section BEFORE the new script's
        // overrides replace the old ones. Single attempt: no polling.
        const restoreSection = (
            window as unknown as Record<string, string | null>
        )[RESTORE_SECTION_KEY] as string | null;
        delete (window as unknown as Record<string, unknown>)[RESTORE_SECTION_KEY];

        if (
            restoreSection === 'agent' &&
            targetAppUi &&
            typeof targetAppUi.setSection === 'function'
        ) {
            try {
                targetAppUi.setSection('agent', false);
            } catch (error) {
                rpcBridge.log.error(
                    'Failed to restore the agent section after re-injection:',
                    error
                );
            }
        }
    } catch (error) {
        // Drain any partial registrations so a failed init leaves no stale state.
        if (generation === initializationGeneration) {
            cleanupRegistrations();
            cleanupInitialIndexLifecycle();
            resetModuleState();
        }
        throw error;
    }

    const cleanup = (): void => {
        if (generation !== initializationGeneration) {
            return;
        }

        // Stash the active section before teardown: `agent-chat-window` is
        // removed by `cleanupRegistrations()` (reverse order), so capture it
        // here while it is still present.
        captureActiveSectionForReinjection();

        // Restore overrides and remove injected elements in reverse order.
        cleanupRegistrations();
        cleanupInitialIndexLifecycle();
        resetModuleState();
        initializeAppExtensionCleanup = null;
    };

    if (generation === initializationGeneration) {
        initializeAppExtensionCleanup = cleanup;
    }
    return cleanup;
};
