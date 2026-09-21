import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { setupAgentChatWindow } from './agent-window';
import {
    cleanupInitialIndexLifecycle,
    requestInitialIndexForProjectsRoute,
    startInitialIndexEventListening,
} from './initial-index';
import { overrideProjectLoaded } from './project-files';

type Cleanup = () => void;

interface ElementRegistration {
    id: string;
    selector: string;
    cleanup: Cleanup;
}

interface RemovedElementSnapshot {
    id: string;
    selector: string;
    element: Element;
    parent: Element;
    nextSibling: Node | null;
    attributes: Record<string, string>;
    inlineStyleText: string;
    computedStyleText: string;
}

const UI_STYLE_ID = 'micro-zoukei-uiex-styles';
const FULLSCREEN_CLONE_ATTRIBUTE = 'data-micro-zoukei-fullscreen-clone';
const NOOP_CLEANUP: Cleanup = () => undefined;

const registrations = new Map<string, ElementRegistration>();
const removedElementSnapshots = new Map<string, RemovedElementSnapshot>();

let flag_morespace = false;
let morespace_icon: HTMLElement | null = null;
let cachedCodeEditor: HTMLElement | null = null;
let createdMoreSpaceIcon = false;
let initializeAppExtensionCleanup: Cleanup | null = null;
let initializationGeneration = 0;
let fullscreenClone: HTMLElement | null = null;
let fullscreenClickHandler: ((event: MouseEvent) => void) | null = null;
let fullscreenChangeListener: (() => void) | null = null;
let wrappedCreateFullscreenFeatures: (() => void) | null = null;
let originalSetSection: ((section: string, useraction: boolean) => any) | null = null;
let wrappedSetSection: ((section: string, useraction: boolean) => any) | null = null;
let headerElement: HTMLElement | null = null;
let headerTransitionProperty = '';
let headerTransitionDuration = '';
let headerTransitionEndHandler: ((this: HTMLElement, event: TransitionEvent) => void) | null = null;
let headerTransitionStartHandler: ((this: HTMLElement, event: TransitionEvent) => void) | null = null;

const runCleanup = (id: string): void => {
    const registration = registrations.get(id);
    if (!registration) return;

    registrations.delete(id);
    try {
        registration.cleanup();
    } catch (error) {
        console.error(`[MicroZoukei] Failed to clean up ${id}:`, error);
    }
};

const registerElement = (id: string, selector: string, cleanup: Cleanup): void => {
    runCleanup(id);
    registrations.set(id, { id, selector, cleanup });
};

const cleanupRegistrations = (): void => {
    for (const registration of [...registrations.values()].reverse()) {
        runCleanup(registration.id);
    }
};

const captureElementSnapshot = (
    id: string,
    selector: string,
    element: Element
): RemovedElementSnapshot => {
    if (!(element.parentNode instanceof Element)) {
        throw new Error(`Cannot snapshot ${selector}: its parent is not an Element`);
    }

    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
        attributes[attribute.name] = attribute.value;
    }

    const snapshot: RemovedElementSnapshot = {
        id,
        selector,
        element,
        parent: element.parentNode,
        nextSibling: element.nextSibling,
        attributes,
        inlineStyleText: element.getAttribute('style') ?? '',
        computedStyleText: window.getComputedStyle(element).cssText,
    };
    removedElementSnapshots.set(id, snapshot);
    return snapshot;
};

const restoreRemovedElement = (id: string): void => {
    const snapshot = removedElementSnapshots.get(id);
    if (!snapshot) return;

    removedElementSnapshots.delete(id);
    const { element, parent, nextSibling, selector, attributes } = snapshot;

    const current = parent.querySelector(selector);
    if (current && current !== element) {
        current.remove();
    }

    for (const attribute of Array.from(element.attributes)) {
        if (!(attribute.name in attributes)) {
            element.removeAttribute(attribute.name);
        }
    }
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }

    if (!element.isConnected) {
        const reference = nextSibling?.parentNode === parent ? nextSibling : null;
        parent.insertBefore(element, reference);
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
        throw new Error('The specified `ul` element was not found.');
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
const removeElement = (id: string, selector: string): void => {
    const element = document.querySelector(selector);
    if (!element) {
        registerElement(id, selector, NOOP_CLEANUP);
        return;
    }

    registerElement(id, selector, NOOP_CLEANUP);
    element.remove();
};

const removeElements = (): void => {
    removeElement(
        'discord-link',
        'a[href="https://discord.com/invite/BDMqjxd"][target="_blank"]'
    );

    removeElement(
        'community-link',
        'a[href="/community/"][target="_blank"]'
    );
};

const overrideCreateFullscreenFeatures = (appui: any): Cleanup => {
    if (!appui || typeof appui.createFullscreenFeatures !== 'function') {
        console.error('Not found appui.createFullscreenFeatures function');
        return NOOP_CLEANUP;
    }

    const appWindow = getCurrentWebviewWindow();
    const originalCreateFullscreenFeatures = appui.createFullscreenFeatures;

    fullscreenClickHandler = async (): Promise<void> => {
        const activeClone = fullscreenClone;
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
            console.error("Tauri Fullscreen Error:", err);
        }
    };

    fullscreenChangeListener = (): void => {
        const activeClone = fullscreenClone;
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

        // Snapshot the original button so cleanup can restore it exactly.
        captureElementSnapshot('fullscreen-button', '#project-fullscreen', button);

        // Clone the button so the existing microStudio listener is removed and
        // replaced with a listener that uses the Tauri fullscreen API.
        const newButton = button.cloneNode(true) as HTMLElement;
        newButton.setAttribute(FULLSCREEN_CLONE_ATTRIBUTE, 'true');
        button.parentNode?.replaceChild(newButton, button);
        fullscreenClone = newButton;

        const clickHandler = fullscreenClickHandler;
        const changeListener = fullscreenChangeListener;
        if (!clickHandler || !changeListener) {
            return;
        }

        newButton.addEventListener('click', clickHandler);
        window.addEventListener('fullscreenchange', changeListener);
    };

    // Override the instance method itself directly so that it will work properly when called in the future.
    wrappedCreateFullscreenFeatures = function () {
        setupTauriFullscreen();
    };
    appui.createFullscreenFeatures = wrappedCreateFullscreenFeatures;

    // Since it has already been executed on the microStudio side, it will be applied immediately.
    setupTauriFullscreen();

    return () => {
        const clone = fullscreenClone;
        if (clone) {
            if (fullscreenClickHandler) {
                clone.removeEventListener('click', fullscreenClickHandler);
            }
            if (fullscreenChangeListener) {
                window.removeEventListener('fullscreenchange', fullscreenChangeListener);
            }
        }

        // Restore the original button (removes the clone via the snapshot selector).
        restoreRemovedElement('fullscreen-button');

        // Only restore the method if it is still our wrapper.
        if (appui.createFullscreenFeatures === wrappedCreateFullscreenFeatures) {
            appui.createFullscreenFeatures = originalCreateFullscreenFeatures;
        }

        fullscreenClone = null;
        fullscreenClickHandler = null;
        fullscreenChangeListener = null;
        wrappedCreateFullscreenFeatures = null;
    };
};

const restoreSetSectionOverride = (): void => {
    const appui = (window as any).app?.appui;

    // Re-insert the cached editor before restoring the original method.
    const codeSection = document.getElementById('code-section');
    const chatWindow = document.getElementById('agent-chat-window');
    if (cachedCodeEditor && codeSection) {
        codeSection.insertBefore(cachedCodeEditor, chatWindow);
    }
    cachedCodeEditor = null;

    if (appui?.setSection === wrappedSetSection && originalSetSection) {
        appui.setSection = originalSetSection;
    }

    originalSetSection = null;
    wrappedSetSection = null;
};

const overrideSetSection = (appui: any): Cleanup => {

    if (!appui || typeof appui.setSection !== 'function') {
        console.error('Not found appui.setSection function');
        return NOOP_CLEANUP;
    }

    if (appui.setSection === wrappedSetSection) {
        return restoreSetSectionOverride;
    }

    // Copy the original function and save it
    const originalSetSectionRef = appui.setSection;

    // Override a function
    const wrappedSetSectionRef = function (this: any, section: string, useraction: boolean) {
        // Declare a variable (the section name to be passed to
        // the original function)
        let targetSection = section;

        // ----------------------------------------------------
        // [Interrupt Handling] If "agent" is selected
        // ----------------------------------------------------
        if (section === "agent") {
            // Fake the original function into thinking "code" was selected and
            // execute it. This causes the #code-section to appear, and all of
            // microStudio's complex resizing processes will run normally.
            targetSection = "code";
        }

        // Execute the original function that was set aside
        const result = originalSetSectionRef.apply(this, [targetSection, useraction]);

        // ----------------------------------------------------
        // [Interrupt Handling] Fine-Tuning (Balancing the Books)
        // after the Original Code Runs
        // ----------------------------------------------------
        const codeSection = document.getElementById('code-section');
        const codeEditor = document.getElementById('code-editor');
        const chatWindow = document.getElementById('agent-chat-window');
        const agentMenu = document.getElementById('menuitem-agent');
        const codeMenu = document.getElementById('menuitem-code');

        if (section === "agent") {
            if (chatWindow) {
                window.dispatchEvent(new Event('resize'));
                chatWindow.style.display = 'block';
            }

            if (codeEditor && codeSection) {
                cachedCodeEditor = codeEditor;
                codeEditor.remove();
                console.log("Moved the editor off the screen.");
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
                console.log("The editor has been restored to the screen.");
            }

            return result;
        };

        console.log('Successfully hijacked and extended setSection.');
    };

    originalSetSection = originalSetSectionRef;
    wrappedSetSection = wrappedSetSectionRef;
    appui.setSection = wrappedSetSectionRef;

    return restoreSetSectionOverride;
}

let originalSetMainSection: ((section: string, ...args: any[]) => any) | null = null;
let wrappedSetMainSection: ((section: string, ...args: any[]) => any) | null = null;

const restoreSetMainSectionOverride = (): void => {
    const appui = (window as any).app?.appui;
    if (
        appui?.setMainSection === wrappedSetMainSection &&
        originalSetMainSection
    ) {
        appui.setMainSection = originalSetMainSection;
    }

    originalSetMainSection = null;
    wrappedSetMainSection = null;
};

const overrideSetMainSection = (appui: any): (() => void) => {
    if (!appui || typeof appui.setMainSection !== 'function') {
        console.error('Not found appui.setMainSection function');
        return () => undefined;
    }

    if (appui.setMainSection === wrappedSetMainSection) {
        return restoreSetMainSectionOverride;
    }

    const originalSetMainSectionRef = appui.setMainSection;
    const wrappedSetMainSectionRef = function (this: any, section: string, ...args: any[]) {
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
}

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

    headerElement = header;
    const style = window.getComputedStyle(header);
    headerTransitionProperty = style.getPropertyValue('transition-property');
    headerTransitionDuration = style.getPropertyValue('transition-duration');

    header.style.transitionProperty = `${headerTransitionProperty}, top`;
    header.style.transitionDuration = `${headerTransitionDuration}, 0.5s`;

    headerTransitionEndHandler = (event: TransitionEvent): void => {
        if (event.propertyName === 'top') {
            window.dispatchEvent(new Event('resize'));
        }
    };
    headerTransitionStartHandler = (event: TransitionEvent): void => {
        if (event.propertyName === 'top') {
            window.dispatchEvent(new Event('resize'));
        }
    };

    header.addEventListener('transitionend', headerTransitionEndHandler);
    header.addEventListener('transitionstart', headerTransitionStartHandler);

    return () => {
        if (headerTransitionEndHandler) {
            header.removeEventListener('transitionend', headerTransitionEndHandler);
        }
        if (headerTransitionStartHandler) {
            header.removeEventListener('transitionstart', headerTransitionStartHandler);
        }

        header.style.transitionProperty = headerTransitionProperty;
        header.style.transitionDuration = headerTransitionDuration;

        headerElement = null;
        headerTransitionProperty = '';
        headerTransitionDuration = '';
        headerTransitionEndHandler = null;
        headerTransitionStartHandler = null;
    };
};

/**
 * Initialize the injected UI extensions and the initial-index lifecycle.
 */
export const initializeAppExtension = async (): Promise<() => void> => {
    initializeAppExtensionCleanup?.();
    const generation = ++initializationGeneration;

    // Install lifecycle events before any navigation hook can trigger a request.
    await startInitialIndexEventListening();

    try {
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
        registerElement('header-resize', 'header', setupHeaderResizeAnimation());

        // --------------------------------------------------------------------
        // step 4: agent window and process
        // --------------------------------------------------------------------
        registerElement('uiex-styles', `#${UI_STYLE_ID}`, injectRequiredStyles());

        const targetAppUi = (window as any).app?.appui;
        registerElement('agent-menu-item', '#menuitem-agent', injectAgentMenuItem(targetAppUi));
        registerElement('set-section-override', 'appui.setSection', overrideSetSection(targetAppUi));
        registerElement(
            'fullscreen-override',
            '#project-fullscreen',
            overrideCreateFullscreenFeatures(targetAppUi)
        );
        registerElement('agent-chat-window', '#agent-chat-window', setupAgentChatWindow());
        registerElement('project-loaded-override', 'app.openProject', overrideProjectLoaded());

        if (targetAppUi && typeof targetAppUi.setMainSection === 'function') {
            registerElement(
                'set-main-section-override',
                'appui.setMainSection',
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
                console.error(
                    '[MicroZoukei] Failed to restore the agent section after re-injection:',
                    error
                );
            }
        }
    } catch (error) {
        // Drain any partial registrations so a failed init leaves no stale state.
        cleanupRegistrations();
        cleanupInitialIndexLifecycle();
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

        if (createdMoreSpaceIcon && morespace_icon?.isConnected) {
            morespace_icon.remove();
        }
        if (morespace_icon) {
            morespace_icon.onclick = null;
        }
        createdMoreSpaceIcon = false;
        morespace_icon = null;
        flag_morespace = false;
        cachedCodeEditor = null;
        initializeAppExtensionCleanup = null;
    };

    initializeAppExtensionCleanup = cleanup;
    return cleanup;
}