import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Tauri webview window so the fullscreen override can be exercised.
const isFullscreen = vi.fn().mockResolvedValue(false);
const setFullscreen = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/webviewWindow', () => ({
    getCurrentWebviewWindow: () => ({ isFullscreen, setFullscreen }),
}));

// Keep the initial-index lifecycle out of these tests.
vi.mock('./initial-index', () => ({
    cleanupInitialIndexLifecycle: vi.fn(),
    requestInitialIndexForProjectsRoute: vi.fn().mockResolvedValue(undefined),
    startInitialIndexEventListening: vi.fn().mockResolvedValue(undefined),
}));

import { cleanupInitialIndexLifecycle } from './initial-index';
import { initializeAppExtension } from './uiex-initializer';

interface MockAppUi {
    setSection: (section: string, useraction?: boolean) => unknown;
    setMainSection: (section: string, ...args: unknown[]) => unknown;
    createFullscreenFeatures: () => void;
}

const RESTORE_SECTION_KEY = '__microZoukeiRestoreSection';

const buildDom = (): void => {
    document.body.innerHTML = `
        <header></header>
        <div class="main-container"></div>
        <div id="sidemenu"><ul></ul></div>
        <div id="code-section"></div>
        <div id="project-icon"></div>
        <div id="project-fullscreen" class="fa-expand"></div>
        <a href="https://discord.com/invite/BDMqjxd" target="_blank">Discord</a>
        <a href="/community/" target="_blank">Community</a>
    `;
};

const installAppUi = (): MockAppUi => {
    const appui: MockAppUi = {
        setSection: vi.fn(),
        setMainSection: vi.fn(),
        createFullscreenFeatures: vi.fn(),
    };
    (window as any).app = { appui, openProject: vi.fn() };
    return appui;
};

describe('uiex-initializer lifecycle', () => {
    beforeEach(() => {
        buildDom();
        installAppUi();
        isFullscreen.mockClear();
        setFullscreen.mockClear();
        vi.mocked(cleanupInitialIndexLifecycle).mockClear();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete (window as any).app;
        delete (window as any)[RESTORE_SECTION_KEY];
        vi.restoreAllMocks();
    });

    it('restores the agent section after a re-injection while the agent tab is active', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalSetSection = appui.setSection;

        // First initialization: the agent tab is not yet active.
        const firstCleanup = await initializeAppExtension();
        expect(originalSetSection).not.toHaveBeenCalled();

        // Simulate the agent tab being active: the chat window is visible.
        const chatWindow = document.getElementById('agent-chat-window') as HTMLElement;
        chatWindow.style.display = 'block';

        // Simulate a re-injection: the old script's cleanup stashes the active
        // section, then the new script initializes.
        firstCleanup();
        const secondCleanup = await initializeAppExtension();

        // The wrapper translates `agent` -> `code` for microStudio, so the
        // original setSection mock is called with ('code', false).
        expect(originalSetSection).toHaveBeenCalledTimes(1);
        expect(originalSetSection).toHaveBeenCalledWith('code', false);

        secondCleanup();
    });

    it('does not call setSection after a re-injection while another tab is active', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalSetSection = appui.setSection;

        // First initialization: the chat window is hidden by default.
        const firstCleanup = await initializeAppExtension();

        // Re-injection while a non-agent tab is active.
        firstCleanup();
        await initializeAppExtension();

        expect(originalSetSection).not.toHaveBeenCalled();
    });

    it('does not call setSection on the very first initialization', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalSetSection = appui.setSection;

        await initializeAppExtension();

        expect(originalSetSection).not.toHaveBeenCalled();
        expect((window as any)[RESTORE_SECTION_KEY]).toBeUndefined();
    });

    it('consumes (deletes) the stashed section key after initialization', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalSetSection = appui.setSection;

        const firstCleanup = await initializeAppExtension();
        const chatWindow = document.getElementById('agent-chat-window') as HTMLElement;
        chatWindow.style.display = 'block';
        firstCleanup();

        expect((window as any)[RESTORE_SECTION_KEY]).toBe('agent');
        await initializeAppExtension();

        expect((window as any)[RESTORE_SECTION_KEY]).toBeUndefined();
        expect(originalSetSection).toHaveBeenCalledTimes(1);
    });

    it('removes the Discord and Community links permanently', async () => {
        const cleanup = await initializeAppExtension();

        expect(document.querySelector('a[href="https://discord.com/invite/BDMqjxd"]')).toBeNull();
        expect(document.querySelector('a[href="/community/"]')).toBeNull();

        cleanup();

        // Permanent removal: cleanup must not restore them.
        expect(document.querySelector('a[href="https://discord.com/invite/BDMqjxd"]')).toBeNull();
        expect(document.querySelector('a[href="/community/"]')).toBeNull();
    });

    it('does not duplicate injected elements across repeated initialization', async () => {
        const first = await initializeAppExtension();
        const second = await initializeAppExtension();

        expect(document.querySelectorAll('#menuitem-agent')).toHaveLength(1);
        expect(document.querySelectorAll('#agent-chat-window')).toHaveLength(1);
        expect(document.querySelectorAll('#micro-zoukei-uiex-styles')).toHaveLength(1);
        expect(document.querySelectorAll('#project-morespace')).toHaveLength(1);

        first();
        second();
    });

    it('restores the header transition styles and handlers on cleanup', async () => {
        const header = document.getElementsByTagName('header')[0] as HTMLElement;
        const originalProperty = window.getComputedStyle(header).getPropertyValue('transition-property');
        const originalDuration = window.getComputedStyle(header).getPropertyValue('transition-duration');

        const cleanup = await initializeAppExtension();

        expect(header.style.transitionProperty).toContain('top');
        expect(header.style.transitionDuration).toContain('0.5s');

        cleanup();

        expect(header.style.transitionProperty).toBe(originalProperty);
        expect(header.style.transitionDuration).toBe(originalDuration);
    });

    it('restores the fullscreen button and method on cleanup', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalCreateFullscreenFeatures = appui.createFullscreenFeatures;

        const cleanup = await initializeAppExtension();

        const clone = document.querySelector('[data-micro-zoukei-fullscreen-clone]');
        expect(clone).not.toBeNull();
        expect(appui.createFullscreenFeatures).not.toBe(originalCreateFullscreenFeatures);

        cleanup();

        expect(document.querySelector('[data-micro-zoukei-fullscreen-clone]')).toBeNull();
        expect(document.getElementById('project-fullscreen')).not.toBeNull();
        expect(appui.createFullscreenFeatures).toBe(originalCreateFullscreenFeatures);
    });

    it('restores the setSection override on cleanup', async () => {
        const appui = (window as any).app.appui as MockAppUi;
        const originalSetSection = appui.setSection;

        const cleanup = await initializeAppExtension();
        expect(appui.setSection).not.toBe(originalSetSection);

        cleanup();
        expect(appui.setSection).toBe(originalSetSection);
    });

    it('drains partial registrations when initialization fails', async () => {
        // Remove the sidemenu list so injectAgentMenuItem throws after the
        // styles and header registrations have already been applied.
        document.querySelector('#sidemenu ul')?.remove();

        await expect(initializeAppExtension()).rejects.toThrow();

        expect(document.querySelectorAll('#micro-zoukei-uiex-styles')).toHaveLength(0);
        expect(vi.mocked(cleanupInitialIndexLifecycle)).toHaveBeenCalled();
    });
});