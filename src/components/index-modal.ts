/**
 * Blocking modal for the initial knowledge-base index lifecycle.
 */

export enum IndexModalState {
    Idle,
    InProgress,
    Completed,
    Failed,
}

export interface IndexModalOptions {
    message?: string;
}

interface InertElementState {
    element: HTMLElement;
    wasInert: boolean;
}

export class IndexModal {
    private overlay: HTMLDivElement;
    private modal: HTMLDivElement;
    private statusElement: HTMLParagraphElement;
    private progressBar: HTMLDivElement;
    private state: IndexModalState = IndexModalState.Idle;
    private active = false;
    private originalScrollY = 0;
    private originalFocusElement: HTMLElement | null = null;
    private inertElements: InertElementState[] = [];

    constructor() {
        this.overlay = document.createElement('div');
        this.modal = document.createElement('div');
        this.statusElement = document.createElement('p');
        this.progressBar = document.createElement('div');

        this.initializeOverlay();
        this.initializeModal();
        this.attachEventListeners();
    }

    private initializeOverlay(): void {
        this.overlay.id = 'micro-zoukei-index-overlay';
        this.overlay.setAttribute('role', 'presentation');
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
        document.body.appendChild(this.overlay);
    }

    private initializeModal(): void {
        this.modal.id = 'micro-zoukei-index-modal';
        this.modal.setAttribute('role', 'alertdialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', 'micro-zoukei-index-title');
        this.modal.setAttribute('aria-describedby', 'micro-zoukei-index-status');
        this.modal.setAttribute('aria-busy', 'true');
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

        const title = document.createElement('h2');
        title.id = 'micro-zoukei-index-title';
        title.style.cssText = 'font-size: 24px; font-weight: 600; margin: 0 0 8px;';
        title.textContent = 'Initializing Knowledge Base';

        this.statusElement.id = 'micro-zoukei-index-status';
        this.statusElement.style.cssText = 'font-size: 16px; color: #94a3b8; margin: 0 0 24px;';
        this.statusElement.setAttribute('aria-live', 'polite');
        this.statusElement.textContent = 'Starting index validation...';

        const progressContainer = document.createElement('div');
        progressContainer.id = 'micro-zoukei-index-progress';
        progressContainer.style.cssText = 'width: 100%; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;';
        progressContainer.setAttribute('role', 'progressbar');
        progressContainer.setAttribute('aria-label', 'Initial index progress');
        progressContainer.setAttribute('aria-valuemin', '0');
        progressContainer.setAttribute('aria-valuemax', '100');
        progressContainer.setAttribute('aria-valuenow', '0');

        this.progressBar.id = 'micro-zoukei-index-progress-bar';
        this.progressBar.style.cssText = 'width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s ease;';

        progressContainer.appendChild(this.progressBar);
        this.modal.append(title, this.statusElement, progressContainer);
        this.overlay.appendChild(this.modal);
    }

    private attachEventListeners(): void {
        this.overlay.addEventListener('click', event => {
            if (event.target === this.overlay && this.state !== IndexModalState.InProgress) {
                this.hide();
            }
        });

        this.overlay.addEventListener('wheel', event => {
            if (this.active) event.preventDefault();
        }, { passive: false });

        this.overlay.addEventListener('touchmove', event => {
            if (this.active) event.preventDefault();
        }, { passive: false });

        document.addEventListener('keydown', event => {
            if (!this.active) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                return;
            }
            if (event.key !== 'Tab') return;

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
        }, { capture: true });
    }

    private getFocusableElements(): HTMLElement[] {
        return Array.from(
            this.modal.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
    }

    public show(state: IndexModalState, options: IndexModalOptions = {}): void {
        this.state = state;

        if (state !== IndexModalState.InProgress) {
            this.hide();
            return;
        }

        if (!this.active) {
            this.active = true;
            this.originalScrollY = window.scrollY;
            this.originalFocusElement = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            this.inertElements = Array.from(document.body.children)
                .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.overlay)
                .map(element => ({ element, wasInert: element.inert }));
            this.inertElements.forEach(({ element }) => {
                element.inert = true;
            });
            document.body.style.overflow = 'hidden';
            this.overlay.style.display = 'flex';
            requestAnimationFrame(() => this.modal.focus());
        }

        this.modal.setAttribute('aria-busy', 'true');
        this.statusElement.textContent = options.message || 'Indexing knowledge base...';
    }

    public hide(): void {
        if (!this.active) {
            this.overlay.style.display = 'none';
            return;
        }

        this.overlay.style.display = 'none';
        this.active = false;
        this.modal.setAttribute('aria-busy', 'false');
        document.body.style.overflow = '';
        this.inertElements.forEach(({ element, wasInert }) => {
            element.inert = wasInert;
        });
        this.inertElements = [];

        try {
            window.scrollTo(0, this.originalScrollY);
        } catch {
            // Some embedded webviews expose a non-functional scrollTo implementation.
        }

        if (this.originalFocusElement?.isConnected) {
            this.originalFocusElement.focus();
        } else {
            this.modal.blur();
        }
        this.originalFocusElement = null;
    }

    public updateProgress(percentage: number): void {
        const value = Math.max(0, Math.min(100, percentage));
        this.progressBar.style.width = `${value}%`;
        this.progressBar.parentElement?.setAttribute('aria-valuenow', String(value));
    }
}

export const indexModal = new IndexModal();

export function showIndexModal(state: IndexModalState, options?: IndexModalOptions): void {
    indexModal.show(state, options ?? {});
}

export function hideIndexModal(): void {
    indexModal.hide();
}

export function updateIndexProgress(percentage: number): void {
    indexModal.updateProgress(percentage);
}
