# Plan: uiex-initializer Cleanup Hardening (Review Fixes)

## Goal
Fix all issues raised in the staged-changes review of `src/components/uiex-initializer.ts`,
`src/components/agent-window.ts`, and `src/components/project-files.ts`.
All code comments and docs in English. No behavior regressions on the happy path.

## User decisions (confirmed)
1. `flag_morespace`: do NOT touch it in cleanup — delete only the `flag_morespace = false;` line.
2. Cleanup closures must capture ONLY their own locally-created values (no module-level mutable vars).
3. Guard the `initializeAppExtensionCleanup` assignment with the generation check.
4. `injectAgentMenuItem`: revert ONLY the first throw to `console.error` + `NOOP_CLEANUP`.
5. Move `await startInitialIndexEventListening()` inside `try`; catch resets ALL module state.
6. Remove dead code: `headerElement`, `inlineStyleText`, `computedStyleText`,
   `ElementRegistration.selector`, `removeElement` NOOP registrations.
7. `appui` never gets replaced — capture the `appui` passed into `overrideSetSection` in a closure.
8. Fullscreen: do NOT restore the original button (it crashes the app). Keep the clone in the DOM,
   remove only the listeners. Delete the whole snapshot/restore machinery.
9. `overrideSetMainSection` must return `NOOP_CLEANUP` (not `() => undefined`).
10. Move `Cleanup` + `NOOP_CLEANUP` into a new shared module `src/types/cleanup.ts`.

## Phases

### Phase 0 — Shared cleanup module (blocks all others)
- Create `src/types/cleanup.ts` exporting `export type Cleanup = () => void;`
  and `export const NOOP_CLEANUP: Cleanup = () => undefined;`
- `src/components/agent-window.ts`: delete local `type Cleanup`, import from `../types/cleanup`.
- `src/components/project-files.ts`: delete local `type Cleanup` + `NOOP_CLEANUP`, import both.
- `src/components/uiex-initializer.ts`: delete local `type Cleanup` + `NOOP_CLEANUP`, import both.
- Verify: `npx tsc --noEmit`.

### Phase 1 — Delete dead code (depends on 0)
- Delete `RemovedElementSnapshot` interface, `removedElementSnapshots` map,
  `captureElementSnapshot()`, `restoreRemovedElement()`.
- Delete `headerElement` module var (assigned, never read).
- Delete `ElementRegistration.selector` field; change `registerElement(id, selector, cleanup)`
  → `registerElement(id, cleanup)`; update all call sites.
- Simplify `removeElement(id, selector)` → plain removal helper (no registry entry);
  `removeElements()` no longer registers NOOP entries for discord/community links.
- Verify: `npx tsc --noEmit`.

### Phase 2 — Local capture refactor (depends on 1)
Remove module-level mutable state; each override owns its own closure state.
- Delete module vars: `fullscreenClone`, `fullscreenClickHandler`, `fullscreenChangeListener`,
  `wrappedCreateFullscreenFeatures`, `originalSetSection`, `wrappedSetSection`,
  `originalSetMainSection`, `wrappedSetMainSection`, `headerTransitionProperty`,
  `headerTransitionDuration`, `headerTransitionEndHandler`, `headerTransitionStartHandler`.
- `overrideCreateFullscreenFeatures`: local `let clone: HTMLElement | null = null;`,
  local handlers closing over `clone`, local `wrappedCreateFullscreenFeatures`.
- `overrideSetSection`: local `originalSetSectionRef` / `wrappedSetSectionRef`;
  convert `restoreSetSectionOverride` into a closure inside the function that captures
  the passed-in `appui` (decision 7) and the local refs.
- `overrideSetMainSection`: same local-capture treatment.
- `setupHeaderResizeAnimation`: local `header`, local transition values, local handlers.
- Verify: `npx tsc --noEmit`.

### Phase 3 — Fullscreen cleanup behavior (depends on 2)
- Cleanup: remove `click` listener from clone, remove `fullscreenchange` listener from window,
  `clone.removeAttribute(FULLSCREEN_CLONE_ATTRIBUTE)` so a later re-init can re-attach,
  and leave the clone in the DOM (decision 8).
- Do NOT call `restoreRemovedElement` (deleted in Phase 1).
- Restore `appui.createFullscreenFeatures` only if it is still our wrapper.
- Verify: `npx tsc --noEmit`.

### Phase 4 — Graceful degradation (depends on 0)
- `injectAgentMenuItem`: replace ONLY the first throw
  (`throw new Error('The specified \`ul\` element was not found.')`)
  with `console.error(...)` + `return NOOP_CLEANUP;` (decision 4).
- KEEP the second throw (`Failed to insert the Agent menu item.`) — it signals a
  logically impossible DOM state (a real bug), so fail loudly. (DECIDED)
- Verify: `npx tsc --noEmit`.

### Phase 5 — Lifecycle hardening (depends on 2,3,4)
- Move `await startInitialIndexEventListening()` inside the `try` block (decision 5).
- Immediately after the await, bail out if `generation !== initializationGeneration`
  (return `NOOP_CLEANUP` without touching the shared registry).
- Extract `resetModuleState()`: removes `#project-morespace` if connected, clears
  `morespace_icon.onclick`, sets `createdMoreSpaceIcon = false`, `morespace_icon = null`,
  `cachedCodeEditor = null`. **Does NOT touch `flag_morespace`** (decision 1).
- `catch`: only if `generation === initializationGeneration`, run `cleanupRegistrations()`,
  `cleanupInitialIndexLifecycle()`, `resetModuleState()`; then rethrow.
- `cleanup()`: generation guard, `cleanupRegistrations()`, `cleanupInitialIndexLifecycle()`,
  `resetModuleState()`, `initializeAppExtensionCleanup = null`.
- Guard the assignment: `if (generation === initializationGeneration) initializeAppExtensionCleanup = cleanup;`
  (decision 3).
- Verify: `npx tsc --noEmit`.

### Phase 6 — Minor consistency (depends on 5)
- `overrideSetMainSection` early return → `NOOP_CLEANUP` (decision 9).
- `project-files.ts`: add trailing newline at EOF.
- `setupHeaderResizeAnimation`: capture/restore the ORIGINAL INLINE values
  (`header.style.transitionProperty` / `transitionDuration`) instead of computed values,
  so cleanup restores the exact prior inline state.
- `overrideSetSection` wrapped function: move `return result;` OUTSIDE the if/else so the
  wrapper always transparently returns the original `setSection` result (DECIDED).
- Verify: `npx tsc --noEmit`.

### Phase 7 — Tests + verification (depends on all)
- Update `src/components/uiex-initializer.test.ts`:
  - `drains partial registrations when initialization fails` currently relies on
    `injectAgentMenuItem` throwing — that trigger disappears in Phase 4.
    Replace with a failure injected via the mocked `getCurrentWebviewWindow`
    (`mockImplementationOnce(() => { throw new Error(...) })`).
  - Add a test asserting the fullscreen clone REMAINS in the DOM after cleanup
    and that `data-micro-zoukei-fullscreen-clone` is cleared.
  - Add a test asserting `flag_morespace` is not reset (header stays hidden after cleanup).
  - Add a test asserting re-init after cleanup re-attaches the fullscreen click listener.
- Run `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

## Relevant files
- `src/types/cleanup.ts` — NEW: `Cleanup` type + `NOOP_CLEANUP` constant.
- `src/components/uiex-initializer.ts` — main changes (Phases 1-6).
- `src/components/agent-window.ts` — import shared `Cleanup`.
- `src/components/project-files.ts` — import shared `Cleanup`/`NOOP_CLEANUP`, EOF newline.
- `src/components/uiex-initializer.test.ts` — test updates (Phase 7).
- `src/injected.ts` — no change expected; verify cleanup ordering only.

## Verification
1. `npx tsc --noEmit` → zero errors.
2. `npx vitest run` → all tests pass.
3. `npm run build` → regenerates `src/assets/injected.js`.
4. Manual: toggle Agent section repeatedly → no duplicate `#agent-chat-window` /
   `#menuitem-agent` / `#micro-zoukei-uiex-styles` / `#project-morespace`.
5. Manual: fullscreen button works after init → cleanup → re-init.
6. Manual: hide header via morespace, trigger cleanup, re-init, click icon → header restores.

## Decisions
- Registry stays module-global (single injected script instance); concurrency handled by
  generation guard + early bail after await.
- Fullscreen clone is intentionally left in the DOM; the crash-prone original button is never restored.
- `flag_morespace` is intentionally not reset; the next init's icon click self-heals the state.
- `injectAgentMenuItem`'s first throw is degraded; the second throw is kept to surface real bugs.
- `overrideSetSection` always transparently returns the original `setSection` result.

## Further Considerations
(None — all items resolved. Source control / staging is handled by the user and is out of scope.)
