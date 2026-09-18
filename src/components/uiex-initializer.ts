import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { setupAgentChatWindow } from './agent-window';
import {
    cleanupInitialIndexLifecycle,
    requestInitialIndexForProjectsRoute,
    startInitialIndexEventListening,
} from './initial-index';
import { overrideProjectLoaded } from './project-files';

let flag_morespace = false;
let elm = null;
let morespace_icon: HTMLElement | null = null;
let cachedCodeEditor: HTMLElement | null = null;
let createdMoreSpaceIcon = false;
let initializeAppExtensionCleanup: (() => void) | null = null;
let initializationGeneration = 0;

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
}

const visible_sidemenu = (visible: boolean): void => {
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
}

// runbar
const visible_runbar = (visible: boolean): void => {
    elm = document.getElementById('runbar');
    if (elm) {
        const firstRunbar = elm.children[0];
        if (firstRunbar instanceof HTMLElement) {
            if (visible) {
                firstRunbar.style.display = 'inline-block';
            } else {
                firstRunbar.style.display = 'none';
            }
        }

        const secondRunbar = elm.children[1];
        if (secondRunbar instanceof HTMLElement) {
            if (visible) {
                secondRunbar.style.marginLeft = '20px';
            } else {
                secondRunbar.style.marginLeft = '0';
            }
        }
    }
}

// terminal
const visible_terminal_toolbar = (visible: boolean): void => {
    elm = document.getElementById('terminal-toolbar');
    if (elm) {
        const firstChild = elm.children[0];
        if (firstChild instanceof HTMLElement) {
            if (visible) {
                firstChild.style.display = 'inline-block';
            } else {
                firstChild.style.display = 'none';
            }
        }

        const secondChild = elm.children[1];
        if (secondChild instanceof HTMLElement) {
            if (visible) {
                secondChild.style.marginLeft = '20px';
            } else {
                secondChild.style.marginLeft = '0';
            }
        }
    }
}

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

const injectAgentMenuItem = (appui: any): void => {
    const ulElement = document.querySelector<HTMLUListElement>('#sidemenu ul');
    if (ulElement && document.getElementById('menuitem-agent') === null) {
        const htmlString = `
          <li id="menuitem-agent">
            <i class="fas fa-robot"></i><br> Agent</li>
        `.trim();

        ulElement.insertAdjacentHTML('afterbegin', htmlString);
        const agentMenu = document.getElementById('menuitem-agent');
        agentMenu?.addEventListener('click', (event: MouseEvent) => {
            const targetAppUi = appui;
            if (targetAppUi && typeof targetAppUi.setSection === 'function') {
                // The value "true" for the second argument indicates that
                // the switch was initiated by the user.
                targetAppUi.setSection("agent", true);
            }
        });
    } else if (!ulElement) {
        console.error('The specified `ul` element was not found.');
    }
};

// --------------------------------------------------------------------
// Deleting (or Hiding) Unnecessary Existing Elements
// --------------------------------------------------------------------
const removeElements = (): void => {
    const discordLink = document.querySelector<HTMLAnchorElement>(
        'a[href="https://discord.com/invite/BDMqjxd"][target="_blank"]'
    );
    if (discordLink) {
        discordLink.remove();
    }

    const communityLink = document.querySelector<HTMLAnchorElement>(
        'a[href="/community/"][target="_blank"]'
    );
    if (communityLink) {
        communityLink.remove();
    }
}

const overrideCreateFullscreenFeatures = (appui: any): void => {
    if (!appui || typeof appui.createFullscreenFeatures !== 'function') {
        console.error('Not found appui.createFullscreenFeatures function');
        return;
    }

    const appWindow = getCurrentWebviewWindow();
    const setupTauriFullscreen = () => {
        const button = document.getElementById("project-fullscreen");

        if (button) {
            // [Most Important] By cloning and replacing the original Listener
            // element that causes crashes—which has already been registered—you
            // can completely remove it (force a reset).
            const newButton = button.cloneNode(true) as HTMLElement;
            button.parentNode?.replaceChild(newButton, button);

            // Register a secure Tauri listener for the new button
            newButton.addEventListener("click", async (e) => {
                try {
                    const isFullscreen = await appWindow.isFullscreen();
                    if (isFullscreen) {
                        await appWindow.setFullscreen(false);
                        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
                        window.dispatchEvent(new Event('fullscreenchange'));
                    } else {
                        await appWindow.setFullscreen(true);
                        Object.defineProperty(document, 'fullscreenElement', {
                            value: document.getElementById("projectview"),
                            configurable: true
                        });
                        window.dispatchEvent(new Event('fullscreenchange'));
                    }
                } catch (err) {
                    console.error("Tauri Fullscreen Error:", err);
                }
            });

            // Logic for switching icons and background colors
            // (inherits the display logic from the original code)
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

    // 1. Override the instance method itself directly so that it will work properly when called in the future.
    appui.createFullscreenFeatures = function () {
        setupTauriFullscreen();
    };

    // 2. Since it has already been executed on the microStudio side, it will be applied immediately.
    setupTauriFullscreen();
};

const overrideSetSection = (appui: any): void => {

    if (!appui || typeof appui.setSection !== 'function') {
        console.error('Not found appui.setSection function');
        return;
    }

    // Copy the original function and save it
    const originalSetSection = appui.setSection;

    // Override a function
    appui.setSection = function (section: string, useraction: boolean) {
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
        const result = originalSetSection.apply(this, [targetSection, useraction]);

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
            if (chatWindow) chatWindow.style.display = 'block';

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

const injectRequiredStyles = (): void => {
    const style = document.createElement('style');
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
}

const normalizePathname = (pathname: string): string => {
    const normalized = pathname.trim();
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const isProjectsRoute = (): boolean => normalizePathname(window.location.pathname) === '/projects/';

/**
 * Initialize the injected UI extensions and the initial-index lifecycle.
 */
export const initializeAppExtension = async (): Promise<() => void> => {
    initializeAppExtensionCleanup?.();
    const generation = ++initializationGeneration;

    // Install lifecycle events before any navigation hook can trigger a request.
    await startInitialIndexEventListening();

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
    // step 3: inseart
    // -------------------------------------------
    // risize animation on header
    elm = document.getElementsByTagName('header')[0];
    const style = window.getComputedStyle(elm);
    let prop = style.getPropertyValue('transition-property');
    elm.style.transitionProperty = prop + ', top';
    prop = style.getPropertyValue('transition-duration');
    elm.style.transitionDuration = prop + ', 0.5s';

    // resize runtime vertical split
    elm.ontransitionend = () => {
        window.dispatchEvent(new Event('resize'));
    }
    elm.ontransitionstart = () => {
        window.dispatchEvent(new Event('resize'));
    }

    // --------------------------------------------------------------------
    // step 4: agent window and process
    // --------------------------------------------------------------------
    injectRequiredStyles();

    const targetAppUi = (window as any).app?.appui;
    injectAgentMenuItem(targetAppUi);
    overrideSetSection(targetAppUi);
    overrideCreateFullscreenFeatures(targetAppUi);

    setupAgentChatWindow();

    overrideProjectLoaded();

    let restoreSetMainSection: (() => void) | null = null;
    if (targetAppUi && typeof targetAppUi.setMainSection === 'function') {
        restoreSetMainSection = overrideSetMainSection(targetAppUi);
    }

    if (isProjectsRoute()) {
        void requestInitialIndexForProjectsRoute();
    }

    const cleanup = (): void => {
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
}