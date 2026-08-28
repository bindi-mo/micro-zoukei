/**
 * Error Handler Module
 * Handles error display and logging in the WebView environment
 */

import { rpcBridge } from './rpc-bridge';

export interface ErrorOptions {
    container?: HTMLElement;
    message: string;
    showDetails?: boolean;
}

const DEFAULT_CONTAINER = 'body';
const ERROR_CLASS = 'micro-zoukei-error';
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

/**
 * Show error message.
 */
export function showError(options: ErrorOptions): void {
    const container = options?.container || document.querySelector(DEFAULT_CONTAINER);

    // Inject styles if not present
    const existingStyle = document.getElementById('micro-zoukei-error-style');
    if (!existingStyle) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'micro-zoukei-error-style';
        styleSheet.textContent = ERROR_STYLE;
        document.head.appendChild(styleSheet);
    }

    // Create error container
    const errorDiv = document.createElement('div');
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

    // Log to backend asynchronously
    (async () => {
        await rpcBridge.logMessage(`[MicroZoukei] Error: ${options.message}`);
    })();
}

/**
 * Hide all error messages.
 */
export function hideAllErrors(): void {
    const errorElements = document.querySelectorAll(`.${ERROR_CLASS}`);
    errorElements.forEach(el => el.remove());
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
