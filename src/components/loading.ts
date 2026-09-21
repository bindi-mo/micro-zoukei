/**
 * Loading Component Module
 * Handles display of loading indicators in the WebView environment
 */

import { rpcBridge } from './rpc-bridge';

export interface LoadingOptions {
    container?: HTMLElement;
    message?: string;
    showSpinner?: boolean;
}

const DEFAULT_CONTAINER = 'body';
const LOADING_CLASS = 'micro-zoukei-loading';
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

/**
 * Show loading indicator.
 */
export function showLoading(options?: LoadingOptions): void {
    const container = options?.container || document.querySelector(DEFAULT_CONTAINER);
    if (!container) return;

    // Check if already showing
    if (document.body.classList.contains(LOADING_CLASS)) {
        rpcBridge.log.debug('Loading already visible');
        return;
    }

    // Inject styles if not present
    const existingStyle = document.getElementById('micro-zoukei-loading-style');
    if (!existingStyle) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'micro-zoukei-loading-style';
        styleSheet.textContent = SPINNER_STYLE + CUSTOM_STYLE;
        document.head.appendChild(styleSheet);
    }

    // Create loading container
    const loadingDiv = document.createElement('div');
    loadingDiv.className = LOADING_CLASS;

    if (options?.message) {
        loadingDiv.innerHTML = `
            <div>
                ${options.showSpinner !== false ? '<span class="spinner"></span>' : ''}
                <p>${options.message || 'Loading...'}</p>
            </div>
        `;
    } else if (options?.showSpinner === false) {
        loadingDiv.innerHTML = `<p>Loading...</p>`;
    }

    container.appendChild(loadingDiv);

    rpcBridge.log.debug('Loading indicator shown');
}

/**
 * Hide loading indicator.
 */
export function hideLoading(): void {
    const loadingElement = document.querySelector(`.${LOADING_CLASS}`);
    if (loadingElement) {
        loadingElement.remove();
        rpcBridge.log.debug('Loading indicator hidden');
    }
}

/**
 * Check if loading is currently displayed.
 */
export function isLoadingDisplayed(): boolean {
    return document.body.classList.contains(LOADING_CLASS);
}
