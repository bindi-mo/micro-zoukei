# Plan: UI Element Removal & Re-registration

## TL;DR
Combine the strategy-level plan (remove → rebuild ordering) with the design-level plan
(typed Element Registry, state snapshots, phased dependencies) into one implementation plan
for `uiex-initializer.ts`. Also fix the pre-existing compile errors (`createdMoreSpaceIcon`,
`elm` undeclared) discovered during discovery.

## Discovery findings
- `uiex-initializer.ts` already has: `removeElements()`, `injectAgentMenuItem()`,
  `overrideSetSection()`, `overrideCreateFullscreenFeatures()`, `overrideSetMainSection()`,
  `injectRequiredStyles()`, `initializeAppExtension()` returning a `Cleanup`.
- Module state: `flag_morespace`, `morespace_icon`, `cachedCodeEditor`,
  `initializeAppExtensionCleanup`, `initializationGeneration`.
- `injectRequiredStyles()` creates a `<style>` but does NOT set `UI_STYLE_ID` (unused const).
- `injectAgentMenuItem()` returns a Cleanup but `initializeAppExtension()` ignores it.
- `overrideSetSection()` returns void (no cleanup) — leaks the override.
- `setupAgentChatWindow()` returns a Cleanup but `initializeAppExtension()` ignores it.
- `overrideProjectLoaded()` has no cleanup path.
- COMPILE ERRORS: `createdMoreSpaceIcon` (lines 485,538,544,547) and `elm` (492-503) are
  used but never declared. `UI_STYLE_ID` and `FULLSCREEN_CLONE_ATTRIBUTE` partly unused.

## Steps

### Phase 0: Fix existing compile errors (blocking)
1. Declare `let createdMoreSpaceIcon = false;` in module scope.
2. Replace bare `elm` with a local `const headerEl = document.getElementsByTagName('header')[0]`
   and guard for null before touching style/transition handlers.
3. Run `cargo check` not needed; run `npx tsc --noEmit` / `npm run build` to confirm clean.

### Phase 1: Element Registry (depends on Phase 0)
4. Add a typed registry in `uiex-initializer.ts`:
   - `interface ElementRegistration { id: string; selector: string; cleanup: Cleanup; }`
   - module-level `const registrations = new Map<string, ElementRegistration>()`
   - helpers `registerElement(id, selector, cleanup)` and `runCleanup(id)`.
5. Use `UI_STYLE_ID` on the injected `<style>` element and register its removal.

### Phase 2: Removal functions (depends on Phase 1)
6. Extend `removeElements()` to be registry-aware: record removed nodes (selector + parent +
   nextSibling) so they can be restored if needed.
7. Add `restoreRemovedElements()` for state restoration (snapshot attributes/computed styles
   before removal).

### Phase 3: Re-registration functions (depends on Phase 1)
8. Make every override return a `Cleanup` and register it:
   - `overrideSetSection()` → return restore function (restore `appui.setSection`).
   - `injectAgentMenuItem()` → already returns Cleanup; register it.
   - `setupAgentChatWindow()` → already returns Cleanup; register it.
   - `overrideProjectLoaded()` → add restore function (restore `app.openProject`, clear flag).
   - `overrideCreateFullscreenFeatures()` → already returns Cleanup; register it.
9. `initializeAppExtension()` collects all cleanups into the registry and its returned
   `cleanup()` runs them in reverse order (LIFO) then clears the registry.

### Phase 4: Lifecycle integration (depends on Phases 2-3)
10. `initializeAppExtension()` calls `initializeAppExtensionCleanup?.()` first (already does),
    then rebuilds registry from scratch — guaranteeing no stale closures.
11. Reset `flag_morespace`, `morespace_icon`, `cachedCodeEditor` in cleanup.
12. Wrap re-registration in try/catch and surface failures via `showError()`.

### Phase 5: Injection timing (depends on Phase 4)
13. Verify `injected.ts` `cleanupInjectedScript()` calls `activeCleanup()` before replacement
    (already does) — confirm registry is fully drained.
14. Confirm hot-reload path: `microZoukeiInjectedState.cleanup` exposed before init.

## Relevant files
- `src/components/uiex-initializer.ts` — main changes (registry, cleanups, compile fixes)
- `src/components/agent-window.ts` — `setupAgentChatWindow` already returns Cleanup; register it
- `src/components/project-files.ts` — `overrideProjectLoaded` needs a restore function
- `src/injected.ts` — verify cleanup ordering (likely no change)
- `src/components/error-handler.ts` — reuse `showError` for try/catch reporting

## Verification
1. `npx tsc --noEmit` — zero errors (currently 10 errors).
2. `npm run build` — produces `src/assets/injected.js`.
3. Runtime: toggle Agent section repeatedly; confirm no duplicate `#agent-chat-window`,
   no duplicate `#menuitem-agent`, editor moves/restores correctly.
4. Hot reload: trigger watcher reload; confirm single set of listeners (no double-firing).
5. Memory: `gc()` before/after repeated init/cleanup; heap stabilizes.

## Decisions
- Registry pattern (Map keyed by id) over ad-hoc cleanup variables.
- LIFO cleanup order to respect dependency (styles removed last, overrides restored first).
- Removal order: remove UI elements → reset state → re-register (from strategy plan).
- Re-registration uses fresh closures; `insertAdjacentHTML` for menu, `createElement` for style.
- Scope: only `uiex-initializer.ts` + minimal touch to `project-files.ts`; no proxy.rs changes.

### DECIDED (user confirmed)
1. **Restore all overrides on cleanup** — fix the inconsistency. `overrideSetSection` and
   `overrideProjectLoaded` MUST return a `Cleanup` that restores the original function,
   matching the existing `overrideSetMainSection` / `overrideCreateFullscreenFeatures` pattern.
   - `overrideSetSection` cleanup: if `cachedCodeEditor` is still detached, re-insert it into
     `#code-section` before restoring `appui.setSection`; guard with
     `appui.setSection === wrappedSetSection` before restoring.
   - `overrideProjectLoaded` cleanup: restore `app.openProject` and clear `__isOverridden`.
2. **Permanent removal for Discord/Community links** — no restore logic. Record them in the
   registry as "removed" only, to avoid double-removal on re-init. The generic snapshot/
   restore mechanism is still implemented in Phase 2, but used ONLY for the fullscreen
   clone replacement (`#project-fullscreen`), not for the removed links.

## Further Considerations
1. Cross-browser: WebView is WebKitGTK on Linux (WebKit), WebView2 on Windows (Chromium).
   **DECIDED: standard APIs only, no engine branching, no polyfills.**
   - New APIs used (`Map`, `WeakMap`, `insertAdjacentHTML`, `cloneNode`, `replaceWith`,
     `Element.remove`) are all supported in WebKitGTK — no polyfill needed.
   - The existing `Object.defineProperty(document, 'fullscreenElement', ...)` pattern
     overrides a read-only accessor and may throw on WebKitGTK. Wrap it in try/catch so
     fullscreen still works if the override fails.
   - `transitionend` handler that dispatches `resize` should check
     `event.propertyName === 'top'` to avoid multi-firing across engines.