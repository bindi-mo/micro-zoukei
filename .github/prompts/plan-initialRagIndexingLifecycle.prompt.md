## Plan: Initial RAG Indexing Lifecycle

Build an idempotent initial LanceDB index that starts when microStudio navigates to `/projects/`, exposes progress through Tauri events, blocks the WebView UI with a dedicated modal, and starts the debug knowledge watcher only after a valid index exists.

### TL;DR

Wrap microStudio's real `window.app.appui.setMainSection` function and trigger a new `mzd_ensure_initial_index` RPC only for `section === "projects"`. Rust will validate `my_documents` by table existence, required schema, embedding dimensions, and non-zero row count; it will reuse a valid table and rebuild only an absent or invalid one. The command will return immediately with a lifecycle status while indexing runs in the background. Rust will emit `initial-index-status` events, and the injected TypeScript will show an inaccessible, full-viewport modal until a terminal event or command response arrives.

**Steps**

### Phase 1: Backend lifecycle and index validation

1. Add an initial-index lifecycle type and short-lived state manager, preferably in a new `src-tauri/src/initial_index.rs`, with `Idle`, `InProgress`, `Complete`, and retryable `Failed` states. Store it in `AppState` without holding its mutex across an `await`.
2. Add `mzd_ensure_initial_index` to the proxy command path. Propagate `tauri::AppHandle` from `proxy.rs` into the dispatcher/handler so the handler can emit application events with `app_handle.emit`.
3. Define a typed `EnsureInitialIndexResponse` with:
   - `status: "already_valid" | "in_progress" | "started"`
   - `valid: boolean`
   - `document_count: number`
4. Implement asynchronous validation in `agent/rag.rs` for the `my_documents` table:
   - Table exists.
   - Required columns are `id`, `relative_path`, `text`, and `embedding`.
   - `id`, `relative_path`, and `text` are UTF-8 string fields.
   - `embedding` is a fixed-size list of Float64 values.
   - The list width matches the configured embedding model's `ndims()`.
   - `count_rows(None)` is greater than zero.
   - Extra columns remain allowed for forward compatibility.
5. Refactor the existing ingestion code into reusable helpers for recursive source discovery, embedding creation, record-batch construction, and table writing. Keep `.md` and `.txt` as the supported recursive source formats, using case-insensitive extension checks.
6. Make initial indexing non-destructive when validation succeeds. When validation reports absent or invalid, replace only `my_documents`; if no supported source documents exist, return a clear failure and do not create an empty table.
7. On a successful initial build, revalidate the written table, transition the lifecycle to `Complete`, emit the terminal event, and start the existing debug knowledge watcher exactly once. On failure, emit a terminal failure, transition to `Failed`, and do not start the watcher.
8. Keep manual/debug reindexing as a separate explicit rebuild path. Do not add or require a physical LanceDB ANN index for this feature.

### Phase 2: Command routing and event contract

1. Use the event name `initial-index-status` with a serializable payload containing:
   - `status: "started" | "completed" | "failed"`
   - optional `document_count`
   - optional sanitized `error`
2. Emit `started` after entering `InProgress`, `completed` after a successful non-empty valid table is confirmed, and `failed` after an initial-index attempt cannot complete.
3. Keep the existing `rag-reindexed` event for manual and watcher-driven rebuilds. Initial-index UI must not depend on that event.
4. Preserve the existing `core:default` capability. Generated Tauri ACL schemas already include the event-listening permission required by the injected frontend.
5. Keep the proxy command non-blocking: embedding may take longer than five seconds, but `mzd_ensure_initial_index` only validates/transitions state and returns a lifecycle response. Therefore the existing five-second RPC timeout does not need to be increased.
6. Preserve the existing `tauri_entrypoint` path for backward compatibility. The proxy-specific dispatcher should receive `AppHandle`; direct entry-point calls that cannot supply one should return a clear unsupported-context error for this command rather than attempting event emission without a handle.

### Phase 3: Frontend trigger, modal, and cleanup

1. Add `src/components/index-modal.ts` with a dedicated modal implementation:
   - Fixed full-viewport overlay and very high `z-index`.
   - Dimmed background and visible indexing status.
   - `role="alertdialog"` and `aria-modal="true"`.
   - No dismiss control while indexing is active.
   - Pointer coverage for clicks, wheel, and touch interactions.
   - Document-level keyboard capture and focus trapping.
   - Saved and restored scroll, focus, and `inert` state for underlying content.
2. In `uiex-initializer.ts`, wrap `window.app.appui.setMainSection` rather than `setSection`. Preserve `this`, arguments, return value, and the original function descriptor. Trigger only when `section === "projects"`, call the original navigation function first, and then request initial-index status.
3. Install the Tauri event listener before installing the navigation wrapper. After microStudio is available, also check whether the current normalized pathname is already `/projects/`; this covers startup history restoration that may have called `setMainSection` before injection.
4. Track frontend request state as `idle`, `in_progress`, `completed`, or `failed`. Repeated project navigation while indexing is active must not issue duplicate RPCs. A failed state may retry on a later project navigation, while a completed state is a no-op.
5. Show the modal for `started` events and `in_progress`/`started` command responses. Hide it for `completed` and `failed` events; render failures through the existing error toast after the modal is removed.
6. Make cleanup idempotent in `injected.ts`: unlisten Tauri events, hide the modal, cancel pending initialization, restore `setMainSection` only if it still points to the wrapper, and restore UI state. Ensure debug hot reload cannot leave duplicate listeners, wrappers, or a stale overlay.
7. Add `ensureInitialIndex` to `rpc-bridge.ts` and matching response/event types to `src/types/injected.d.ts`. Keep all filesystem and indexing work behind the Rust RPC boundary.

### Phase 4: Tests and documentation

1. Add Rust tests for supported-file discovery and schema validation, including valid tables, missing columns, wrong embedding element type, wrong embedding width, and zero-row tables. Use temporary LanceDB databases and avoid external embedding-service calls in validation tests.
2. Add frontend tests for exact `projects` triggering, preservation of the original navigation call, idempotent requests, failed-state retry behavior, event-to-modal transitions, and cleanup restoration. Add Vitest with a DOM environment and a focused test script if the repository has no existing frontend test harness.
3. Run `npm run build` so `src/assets/injected.js` is regenerated from the TypeScript entry point.
4. Update `README.md` and increment/update the architecture specification to document the `/projects/` trigger, validity definition, event contract, blocking modal behavior, and watcher startup condition. Keep all new technical documentation and comments in English.

**Relevant files**

- `/home/bindi/work/micro-zoukei/src-tauri/src/lib.rs` — extend `AppState` and application setup with initial-index lifecycle state.
- `/home/bindi/work/micro-zoukei/src-tauri/src/initial_index.rs` — new lifecycle types, transitions, and concurrency guard.
- `/home/bindi/work/micro-zoukei/src-tauri/src/agent/rag.rs` — add schema validation and non-destructive initial ingestion helpers around `rag_inject_documents`.
- `/home/bindi/work/micro-zoukei/src-tauri/src/handlers.rs` — add the initial-index handler and typed response.
- `/home/bindi/work/micro-zoukei/src-tauri/src/commands.rs` — route `mzd_ensure_initial_index` and preserve direct-entry compatibility.
- `/home/bindi/work/micro-zoukei/src-tauri/src/proxy.rs` — pass `AppHandle` into the `/api/command` dispatcher.
- `/home/bindi/work/micro-zoukei/src/injected.ts` — own event subscriptions, initialization, and idempotent hot-reload cleanup.
- `/home/bindi/work/micro-zoukei/src/components/uiex-initializer.ts` — wrap `setMainSection` and expose cleanup for the wrapper.
- `/home/bindi/work/micro-zoukei/src/components/index-modal.ts` — new blocking indexing modal.
- `/home/bindi/work/micro-zoukei/src/components/rpc-bridge.ts` — add the initial-index RPC method.
- `/home/bindi/work/micro-zoukei/src/types/injected.d.ts` — add command and event contracts.
- `/home/bindi/work/micro-zoukei/package.json` — add frontend test tooling if required.
- `/home/bindi/work/micro-zoukei/README.md` — synchronize architecture and usage documentation.
- `/home/bindi/work/micro-zoukei/doc/dev/AI-Agent-Extension-System-Architecture-Design-and-Implementation-Specification.md` — update the indexing sequence and lifecycle design.
- `/home/bindi/work/micro-zoukei/src-tauri/tests/` — add integration coverage for index lifecycle behavior where helpers need public access.

**Verification**

1. After Rust changes, run `cargo fmt --all -- --check` and then `cargo check` from `/home/bindi/work/micro-zoukei/src-tauri`, as required by the repository instructions.
2. Run the Rust test suite from `src-tauri`, including the new schema/lifecycle tests.
3. Run `npm run build` from the workspace root and confirm `src/assets/injected.js` contains the new frontend lifecycle code.
4. Run the new frontend test command and confirm navigation, event, modal, retry, and cleanup cases pass.
5. Manually launch the application, navigate to `/projects/`, and verify the modal appears while indexing is active and disappears on success or failure.
6. Verify a valid non-empty table is reused without dropping or rebuilding, an absent/invalid table is rebuilt once, and repeated navigation cannot create concurrent jobs.
7. Verify an empty knowledge directory produces a terminal failure without an empty `my_documents` table.
8. In debug builds, modify a supported knowledge file after successful initialization and verify the existing watcher triggers exactly one reindex.
9. Trigger injected-script hot reload during indexing and verify the replacement script reconnects to the existing backend job without duplicate listeners or a stale modal.

**Decisions**

- The trigger is the actual upstream `AppUI.setMainSection("projects", ...)` function, not `setSection`, a DOM selector, or a generic route override.
- The source directory is `config.knowledge.path`; only recursively discovered `.md` and `.txt` files are indexed.
- Validity means a non-empty table with the expected schema and embedding dimensions. Physical LanceDB ANN-index readiness is explicitly excluded.
- The backend owns concurrency and idempotency. The frontend may retry after a terminal failure but must not fan out concurrent requests.
- The initial-index command returns lifecycle status immediately and does not make the frontend wait for embedding completion.
- The modal is dedicated and inert to underlying UI; the existing generic loading component is not reused as the blocking mechanism.
- The watcher starts only after successful initial validation/build and remains debug-only, matching the existing `spawn_knowledge_watcher` configuration.

**Further Considerations**

1. If the project later needs a persisted schema version, add a metadata column or sidecar record in a separate follow-up; it is not required for the current validity definition.
2. If physical vector-index readiness becomes a requirement, add an explicit LanceDB index check/build step and a separate readiness state rather than conflating it with table validity.
3. If the existing fullscreen wrapper also needs hot-reload cleanup, extend the initializer cleanup registry in the same change; the initial-index wrapper must be restored regardless.
