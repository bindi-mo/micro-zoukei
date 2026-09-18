# Plan: Fix injected.js Initialization on First App Startup

## Problem
The injected script fails on first app startup via `initialization_script` because `index-modal.ts` creates an `IndexModal` instance at module evaluation time, which immediately calls `document.body.appendChild(this.overlay)` in its constructor. Since Tauri's `initialization_script` runs before HTML parsing (when `document.body` is null), this throws an exception and stops the entire bundle evaluation. The watcher reload works because it executes later via `window.eval()` after the DOM is ready.

## Root Cause
- `index-modal.ts` has `export const indexModal = new IndexModal()` at top level
- `IndexModal` constructor calls `document.body.appendChild(this.overlay)`
- `initialization_script` executes before `document.body` exists
- Module evaluation stops at the first exception

## Solution Overview
Four files need modification to separate module evaluation from DOM operations, and to add proper cleanup for watcher reloads.

### 1. `index-modal.ts` - Lazy Initialization & DOM Mounting
- Remove `export const indexModal = new IndexModal()` from top level
- Add `let indexModal: IndexModal | undefined` and `const getIndexModal = (): IndexModal => { indexModal ??= new IndexModal(); return indexModal; }`
- Export `showIndexModal()`, `hideIndexModal()`, `updateIndexProgress()`, `disposeIndexModal()` instead
- Remove `document.body.appendChild(this.overlay)` from constructor
- Add `mount()` method called from `show()` that checks `document.body` exists before adding overlay
- Add `dispose()` method that removes overlay from DOM, cleans up listeners, and resets state
- Add `mounted` flag to prevent double-mounting

### 2. `injected.ts` - Execution Order Restructuring
- Add `waitForDomReady()` function at top of file:
  ```typescript
  const waitForDomReady = async (): Promise<void> => {
      if (document.body) return;
      await new Promise<void>(resolve => {
          document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
  };
  ```
- Call `await waitForDomReady()` at the very beginning of `initializeInjectedScript()`, before `checkBridgeHealth()`
- This ensures DOM is available before any DOM-dependent modules are imported/evaluated
- `checkBridgeHealth()` remains after DOM ready, as intended

### 3. `uiex-initializer.ts` - DOM-Ready Operations
- In `initializeAppExtension()`, wrap `morespace_icon` creation and `injectAgentMenuItem()` in a `document.body` check
- Only generate the icon and inject the menu item when `document.body` exists
- This prevents errors during early initialization

### 4. Cleanup for Watcher Reload
- `cleanupInitialIndexLifecycle()` in `initial-index.ts` should call `disposeIndexModal()` instead of (or in addition to) `hideIndexModal()`
- This ensures overlay is removed from DOM, event listeners are cleaned up, and state is reset before watcher reloads new `injected.js`
- Prevents duplicate overlays, duplicated listeners, and stale state

## Detailed Changes

### `index-modal.ts` Key Modifications
```typescript
// Remove top-level:
// export const indexModal = new IndexModal();

// Add:
// let indexModal: IndexModal | undefined;

// Helper:
// const getIndexModal = (): IndexModal => {
//     indexModal ??= new IndexModal();
//     return indexModal;
// };

// Export functions instead:
// export function showIndexModal(state: IndexModalState, options?: IndexModalOptions): void {
//     getIndexModal().show(state, options ?? {});
// }

// In IndexModal class:
// Remove document.body.appendChild from constructor
// Add mount() method:
// private mount(): void {
//     if (this.mounted) return;
//     const body = document.body;
//     if (!body) throw new Error('Cannot mount IndexModal before document.body exists');
//     body.appendChild(this.overlay);
//     this.mounted = true;
// }

// Add dispose() method:
// dispose(): void {
//     if (!this.mounted) return;
//     const overlay = document.getElementById('micro-zoukei-index-overlay');
//     if (overlay && overlay.parentNode) {
//         overlay.parentNode.removeChild(overlay);
//     }
//     // cleanup listeners, reset state
//     this.mounted = false;
//     this.active = false;
//     this.inertElements = [];
//     document.body.style.overflow = '';
// }
```

### `injected.ts` Key Modification
Add before `initializeInjectedScript` definition:
```typescript
const waitForDomReady = async (): Promise<void> => {
    if (document.body) return;
    await new Promise<void>(resolve => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
};
```

And at the start of `initializeInjectedScript`:
```typescript
try {
    await waitForDomReady();  // NEW: ensure DOM before proceeding
    const token = ++initializationToken;
    // ... rest of existing code
    const ready = await checkBridgeHealth();
    // ...
}
```

### `uiex-initializer.ts` Key Modification
In `initializeAppExtension()`, wrap the icon creation section:
```typescript
// Only create icon when body exists
if (document.body) {
    elm = document.getElementById('project-morespace');
    if (!elm) {
        morespace_icon.setAttribute('class', 'fas fa-expand-arrows-alt');
        morespace_icon.setAttribute('id', 'project-morespace');
        morespace_icon.setAttribute('title', 'Toggle More Space');
        morespace_icon.onclick = () => { toggle_morespace(); };

        elm = document.getElementById('project-icon');
        if (elm && elm instanceof HTMLElement) {
            elm.after(morespace_icon);
            createdMoreSpaceIcon = true;
        }
    }
}
```

### `initial-index.ts` Cleanup Update
In `cleanupInitialIndexLifecycle()`, add:
```typescript
// After hideIndexModal() call:
disposeIndexModal();
```
(Import `disposeIndexModal` from `./index-modal`)

## Verification Steps
1. Run `npm run build` - ensure `src/assets/injected.js` updates correctly
2. Run `npm test` - all Vitest tests should pass
3. Test initial app startup - no console exceptions about `document.body`
4. Test watcher reload - overlay removed, no duplicate elements
5. Test `/projects()` route - initial index lifecycle starts correctly
6. Verify `window.microZoukei` is available after initialization

## Priority
- High: Fix initial startup crash (DOM ready check + lazy IndexModal)
- High: Ensure watcher reload works cleanly (dispose + cleanup)
- Medium: Preserve existing functionality for manual re-index

## Rationale
The core issue is that module evaluation happens before DOM is available. By:
1. Deferring IndexModal creation until `show()` is called
2. Ensuring DOM is ready before any DOM-dependent code runs
3. Properly cleaning up state between reloads

We fix the root cause while maintaining backward compatibility with the watcher reload mechanism and user-initiated re-index operations.