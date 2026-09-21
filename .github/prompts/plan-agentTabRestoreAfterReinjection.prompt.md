# Plan: Restore the agent tab after injected.js re-injection (section-based)

Detection is based on the **section value** rather than the URL. Investigation showed that `appui.current_section` cannot be used, because the wrapper fakes `'code'` when the agent section is selected. Instead, the display state of `#agent-chat-window` is used as a proxy for the logical section; that value is stashed on `window` and restored on re-initialization.

## Steps

1. `src/components/uiex-initializer.ts`
   - Add `const RESTORE_SECTION_KEY = '__microZoukeiRestoreSection';`
   - Add `captureActiveSectionForReinjection()`: read `#agent-chat-window`; store `'agent'` when it is an `HTMLElement` whose inline `display !== 'none'`, otherwise store `null`
   - Call it inside the `cleanup` closure returned by `initializeAppExtension`, **after** the generation guard and **before** `cleanupRegistrations()` (covers both the `cleanupInjectedScript` path and the repeated-init path)
   - At the end of the registration `try` block (after `setupAgentChatWindow` and `overrideSetSection` are registered), read and `delete` the stored value; if it is `'agent'` and `targetAppUi.setSection` is a function, call `targetAppUi.setSection('agent', false)` inside its own `try/catch` (single attempt, no polling)
2. `src/vite-env.d.ts` — declare `__microZoukeiRestoreSection?: string | null` on `Window`
3. `src/components/uiex-initializer.test.ts` — add tests (see Verification) and clear the key in `afterEach`
4. `README.md` — add one sentence to the hot-reload paragraph in section 4 describing the agent-section restore (AGENTS.md doc-sync rule)

## Relevant files

- `src-tauri/src/lib.rs` — `inject_updated_script` (re-injection wrapper; no change needed)
- `src/injected.ts` — `cleanupInjectedScript` (calls `activeCleanup()`; no change needed)
- `src/components/uiex-initializer.ts` — `initializeAppExtension`, `overrideSetSection`, `restoreSetSectionOverride`, `cleanupRegistrations`
- `src/components/agent-window.ts` — `setupAgentChatWindow` (creates `#agent-chat-window`)
- `src/vite-env.d.ts`, `src/types/injected.d.ts`
- `src/assets/injected.js` — Vite build output watched by the Rust watcher

## Verification

1. `npm test` — new cases:
   - re-injection while the agent tab is active: first init -> set `#agent-chat-window` `display = 'block'` -> cleanup -> re-init -> the original `setSection` mock is called with `('code', false)` (the wrapper translates `agent` -> `code`)
   - re-injection while another tab is active: the chat window stays at `'none'` -> cleanup -> re-init -> `setSection` is not called
   - first initialization (before any cleanup) -> `setSection` is not called
   - the `__microZoukeiRestoreSection` key is deleted after initialization
2. `npm run build` — regenerate `src/assets/injected.js` (**required**; the watcher watches the built file, not the TS source)
3. `npm run tauri dev` — open the Agent tab, rebuild to trigger the watcher, and confirm the Agent tab (chat window visible, editor hidden) is restored
4. `cargo check` in `src-tauri/` — only if Rust files are touched (not planned)

## Decisions

- Detection uses the **`#agent-chat-window` display state** (a proxy for the logical section), not the URL
- The logical section value is stashed on `window` (module scope is reset by `eval`)
- The restore applies **only on re-injection** (not on the initial page load)
- If `window.app.project` is not loaded yet, make a **single attempt** (no polling)
- Pass `useraction: false` to avoid a duplicate `pushState`
- Scope: agent-section restore, value plumbing, tests, README note. Excluded: URL-based detection, generalizing to other sections, waiting for project load, Rust changes

## Further Considerations

1. Generalize the stored value to any logical section (the key already holds a section name). Recommended: keep `'agent'` only for now
2. `useraction` should be `false` (avoids a duplicate `pushState`)
