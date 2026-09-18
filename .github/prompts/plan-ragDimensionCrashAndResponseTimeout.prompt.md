## Plan: RAG dimension crash and response timeout

Rig 0.42 treats the configured `nomic-embed-text:latest` as an unknown embedding model, so `ndims()` returns `0`. Arrow then receives 23 vectors of 768 values while being told that each fixed-size list has length zero, causing the panic `Length of the child array (17664) must be the multiple of the value length (0) and the array length (23)`. The fix is to resolve dimensions separately from the API model identifier, use explicit 768-dimensional model handles, validate vectors before Arrow construction, and add a frontend 3-second timeout for the initial RPC response.

**Steps**

### Phase 1: Fix backend dimension handling

1. **Add a provider/model dimension resolver**
   - Add a small resolver in `/home/bindi/work/micro-zoukei/src-tauri/src/agent/rag.rs`, near `SupportedClient`, for example `resolve_embedding_dimensions(provider, model_name)`.
   - Normalize tags only for lookup: `nomic-embed-text:latest` and `nomic-embed-text` both resolve to 768 for Ollama.
   - Preserve the original model string for provider API calls.
   - Return a normal error for unsupported providers or models whose dimensions cannot be determined.
   - Reject zero or invalid dimensions before any embedding request or Arrow construction.

2. **Use explicit dimensions in every RAG embedding path** *(depends on step 1)*
   - In `ensure_initial_index`, resolve dimensions once and use that value for `validate_my_documents_table` and `build_record_batch`.
   - In `rag_inject_documents`, construct the model with `embedding_model_with_ndims(original_model_name, resolved_dims)` instead of `embedding_model(...).ndims()`.
   - In `rag_query_answer`, construct the query embedding model with the same resolver and explicit dimensions before creating `LanceDbVectorIndex`.
   - Keep provider API requests using the configured identifier, including `nomic-embed-text:latest`.
   - Consolidate duplicated client matching enough to ensure all three paths follow the same dimension rule without changing unrelated provider behavior.

3. **Make Arrow construction panic-safe** *(depends on step 1)*
   - Validate `dims > 0` and, if needed, `dims <= i32::MAX` before calling `FixedSizeListArray::from_iter_primitive`.
   - Validate every `Embedding.vec.len()` against the expected dimension before constructing the batch.
   - Return a descriptive normal error containing provider, model, expected dimension, and actual length on mismatch.
   - Change `as_record_batch`/`build_record_batch` error handling to a local `RagIndexError` or an equivalent boxed-error boundary; do not rely on Arrow's panic path.
   - Do not use `catch_unwind`; the invalid inputs must be rejected before the unsafe construction point.

4. **Add Rust regression tests** *(depends on steps 1–3)*
   - Test `nomic-embed-text:latest` and untagged `nomic-embed-text` resolve to 768.
   - Test an unknown provider/model is rejected before embedding.
   - Test zero dimensions and vector-length mismatches return errors rather than panicking.
   - Test valid multiple vectors still produce the expected `RecordBatch`.
   - Retain and rerun the existing LanceDB schema validation tests in `rag.rs`.

### Phase 2: Add the frontend response timeout

5. **Add a 3-second initial-response timeout** *(parallel with Phase 1)*
   - Modify `/home/bindi/work/micro-zoukei/src/components/initial-index.ts`, not `index-modal.ts`; the lifecycle coordinator owns request state and error handling.
   - Add a named `INITIAL_INDEX_RESPONSE_TIMEOUT_MS` constant with value `3000`.
   - Start the timer when `requestInitialIndexStatus()` starts `rpcBridge.ensureInitialIndex()`.
   - Cancel the timer as soon as the RPC Promise resolves with `already_valid`, `started`, or `in_progress`, or rejects.
   - On timeout, settle the pending request Promise with the timeout error path, set frontend state to `failed`, clear the timer, call the existing `hideIndexModal()`, and call `showError()` with a clear message that the backend did not respond within 3 seconds.
   - Treat lifecycle events separately: receiving a backend `started` event must not cancel the response timer, because the requirement is specifically about the command response.
   - Ignore late RPC responses and lifecycle events after timeout so they cannot reopen the modal or replace the timeout error.
   - Add a request-generation/active-request guard and clear the timer in `cleanupInitialIndexLifecycle()` so hot reload cannot produce a stale error toast.
   - Keep `/home/bindi/work/micro-zoukei/src/components/rpc-bridge.ts` unchanged; its generic 5-second fetch timeout is a separate transport safeguard.

6. **Add frontend timeout tests** *(depends on step 5)*
   - Extend `/home/bindi/work/micro-zoukei/src/components/initial-index.test.ts` with Vitest fake timers.
   - Keep `rpcBridge.ensureInitialIndex()` pending, advance timers to 3000 ms, and assert `showError` is called, the index overlay is hidden, and `getFrontendRequestState()` is `failed`.
   - Resolve `started` or `already_valid` before 3000 ms and assert the timer is cancelled and no timeout error appears.
   - Reject the RPC before 3000 ms and assert the existing error path still works without a duplicate timeout.
   - Advance timers after cleanup and assert no stale timeout callback runs.
   - Resolve or emit a late `started`/`completed` event after timeout and assert the modal remains closed and state remains `failed`.

### Phase 3: Documentation and verification

7. **Update architecture documentation** *(depends on steps 1–6)*
   - Update `/home/bindi/work/micro-zoukei/README.md` in English.
   - Document tagged Ollama model-name handling, explicit dimension resolution, panic-free Arrow validation, and the 3-second initial-response timeout.
   - Keep `/home/bindi/work/micro-zoukei/src-tauri/resources/template.config.yml` set to `nomic-embed-text:latest`; the configuration value should continue to work unchanged.

8. **Run Rust verification** *(depends on steps 1–4 and 7)*
   - From `/home/bindi/work/micro-zoukei/src-tauri`, run `cargo fmt --check`, `cargo check`, and `cargo test`.
   - Investigate failures by distinguishing resolver errors, Arrow validation errors, and existing config/schema test regressions.

9. **Run frontend verification** *(depends on steps 5–6 and 7)*
   - Run `npm test -- --run src/components/initial-index.test.ts`.
   - Run `npm run build` to validate TypeScript and Vite output.

10. **Perform a real indexing smoke test** *(depends on steps 8–9)*
   - Confirm Ollama has `nomic-embed-text` available.
   - Restart the application and enter `/projects/` to trigger initial indexing.
   - Confirm the initial RPC response arrives within 3 seconds, the modal remains open while indexing continues, and no Arrow panic or `double free` occurs.
   - Confirm the generated `my_documents` table has a `FixedSizeList<Float64, 768>` embedding field and at least one row.
   - Confirm `initial-index-status` reaches `completed` and the debug knowledge watcher starts.
   - Confirm a delayed or absent initial RPC response triggers `showError`, closes the modal, and leaves frontend state `failed`.

**Relevant files**

- `/home/bindi/work/micro-zoukei/src-tauri/src/agent/rag.rs` — add dimension resolution; update `ensure_initial_index`, `rag_inject_documents`, `rag_query_answer`, `as_record_batch`, and `build_record_batch`; add Rust tests.
- `/home/bindi/work/micro-zoukei/src-tauri/src/handlers.rs` — preserve the immediate `started` response from `handle_ensure_initial_index` and the existing background failure-event path.
- `/home/bindi/work/micro-zoukei/src-tauri/src/initial_index.rs` — reuse existing lifecycle state and event types; no structural change is currently required.
- `/home/bindi/work/micro-zoukei/src-tauri/resources/template.config.yml` — retain `nomic-embed-text:latest` as the supported configured model name.
- `/home/bindi/work/micro-zoukei/src-tauri/tests/config_test.rs` — rerun existing configuration compatibility tests.
- `/home/bindi/work/micro-zoukei/src/components/initial-index.ts` — implement the 3-second response timer, timeout failure path, late-event guard, and cleanup behavior.
- `/home/bindi/work/micro-zoukei/src/components/initial-index.test.ts` — add fake-timer timeout and cancellation tests.
- `/home/bindi/work/micro-zoukei/src/components/index-modal.ts` — reuse existing `showIndexModal` and `hideIndexModal`; avoid modal implementation changes.
- `/home/bindi/work/micro-zoukei/src/components/error-handler.ts` — reuse existing `showError` behavior.
- `/home/bindi/work/micro-zoukei/src/components/rpc-bridge.ts` — leave the generic 5-second transport timeout unchanged.
- `/home/bindi/work/micro-zoukei/src/components/uiex-initializer.ts` — retain existing lifecycle cleanup integration.
- `/home/bindi/work/micro-zoukei/README.md` — document the backend dimension fix and frontend timeout semantics.

**Verification**

1. `cd /home/bindi/work/micro-zoukei/src-tauri && cargo fmt --check && cargo check && cargo test`
2. `npm test -- --run src/components/initial-index.test.ts`
3. `npm run build`
4. Rust tests cover tagged model resolution, unknown-model rejection, zero dimensions, vector-length mismatch, and valid batch construction.
5. Frontend tests cover timeout, successful response cancellation, RPC rejection, cleanup, and late-event handling.
6. Real Ollama indexing confirms a 768-dimensional non-empty table, completed lifecycle event, watcher startup, and no panic.
7. A simulated delayed initial RPC confirms `showError`, modal closure, and `failed` frontend state after exactly 3 seconds.

**Decisions**

- Keep `nomic-embed-text:latest` in configuration and API requests; strip the tag only for dimension lookup.
- Use explicit `embedding_model_with_ndims(..., 768)` for Ollama and the resolved dimension for all RAG paths.
- The 3-second timeout applies to the first `mzd_ensure_initial_index` response (`already_valid`, `started`, or `in_progress`), not to the later indexing `completed` event.
- The timeout is a frontend UI safeguard only; it does not cancel a backend indexing task that has already started.
- Reuse `showError`, `hideIndexModal`, and the existing modal accessibility/focus implementation.
- Do not change the generic RPC bridge's 5-second fetch timeout.
- Do not add runtime `catch_unwind` around Arrow; reject invalid dimensions and vector lengths before construction.
- Do not change the backend event protocol in this task. Events received after a timeout are ignored while frontend state is `failed`; strict isolation of old events after a retry would require a request ID and is out of scope.

**Further Considerations**

1. If additional Ollama embedding models are added, extend the resolver's dimension table and tests together.
2. If a corrupt or dimension-incompatible LanceDB table exists, the corrected validation should classify it invalid and allow a safe rebuild.
3. If late events must be distinguished after a user retries indexing, add a backend request ID to lifecycle events; the current event schema cannot identify which request produced an event.
