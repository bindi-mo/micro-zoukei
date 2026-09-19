# RAG Embedding Model Change Reindexing Plan

## Goal

Ensure that the LanceDB RAG index is rebuilt whenever the configured embedding provider or embedding model changes. A chat-model-only change must not trigger RAG reindexing.

## Scope

- Persist the embedding provider and embedding model used to build each `my_documents` row.
- Validate the existing table against the current embedding identity before reuse.
- Rebuild the index when the table is absent, invalid, missing metadata, has incompatible dimensions, or was built with a different provider or model.
- Keep manual reindexing and knowledge-file watcher reindexing on the same validation and rebuild path.
- Keep the existing initial-index lifecycle and concurrency behavior.

## Data Model

Add these UTF-8 string columns to `my_documents`:

- `embedding_provider`
- `embedding_model`

Store the provider and model for every document record. The model value must include its tag, so `nomic-embed-text` and `nomic-embed-text:latest` are distinct identities.

Use a normalized provider value for comparison, such as lowercase ASCII, while preserving the configured model string exactly.

## Validation Rules

`validate_my_documents_table` must require:

- `id`
- `relative_path`
- `text`
- `embedding`
- `embedding_provider`
- `embedding_model`

The existing checks must remain:

- Required fields are present.
- String fields contain UTF-8 strings.
- `embedding` is a non-null fixed-size list.
- The embedding inner type is `Float64`.
- The embedding width equals the current provider/model dimension.
- The table contains at least one row.

Add identity validation:

- The stored provider equals the current embedding provider.
- The stored model equals the current embedding model.
- Missing or empty identity values make the table invalid.

## Rebuild Decision

Treat the index as valid only when all schema, dimension, row-count, and embedding-identity checks pass.

Rebuild when:

- The table does not exist.
- The table is empty or has an incompatible schema.
- The table was created before identity columns existed.
- The configured embedding provider changed.
- The configured embedding model changed.
- The model tag or provider/model combination changed.
- The embedding dimension changed.

Do not rebuild when only the chat/completion model changes.

## Implementation Flow

1. Add `embedding_provider` and `embedding_model` to `DocumentRecord`.
2. Populate both columns for every row in `as_record_batch`.
3. Pass the current provider and model into the batch builder.
4. Update required-field validation to include both identity columns.
5. Compare stored identity values with the current provider and model.
6. Make `ensure_initial_index` rebuild automatically when validation reports an identity mismatch.
7. Keep `rag_inject_documents` as the explicit rebuild path used by manual and watcher-triggered reindexing.
8. Ensure the rebuild happens only after embeddings have been generated successfully.
9. Emit the existing `rag-reindexed` event after a successful manual/watcher rebuild.
10. Continue using `initial-index-status` for initial-index lifecycle events.

## Migration Behavior

The current index has no embedding identity columns. After the schema changes are deployed:

1. Validation detects the missing columns.
2. `ensure_initial_index` treats the table as invalid.
3. The existing source documents are embedded with the current provider/model.
4. `my_documents` is replaced with the new schema.
5. The completed index reports the rebuilt document count.

No manual deletion of the existing LanceDB directory should be required.

## Concurrency and UI

- Keep the existing `InitialIndexManager` guard to prevent concurrent indexing jobs.
- A model mismatch should use the normal `started` / `completed` lifecycle.
- A model mismatch should not be reported as a failed index.
- The frontend should not need a separate model-change command if `ensure_initial_index` always validates identity.
- If configuration can change while the application is running, ensure the next `ensure_initial_index` call uses the updated config values.

## Tests

Add or update tests for:

- Valid table with matching provider and model.
- Missing `embedding_provider` or `embedding_model`.
- Provider mismatch.
- Model mismatch, including model tags.
- Empty identity values.
- Dimension mismatch.
- Invalid embedding list type.
- Empty table.
- Successful rebuild after an identity mismatch.
- No rebuild when only the chat model changes.
- Existing manual and watcher reindex paths.
- Existing record-batch and knowledge discovery tests.

## Validation

After implementing the Rust changes:

- Run `cargo check` from `src-tauri/`.
- Run the relevant Rust tests.
- Run the frontend tests if lifecycle or type changes are required.
- Update `README.md` to document the model-change reindex behavior.

## Out of Scope

This plan detects changes to the configured provider/model identity. It does not detect an underlying local model file being replaced while the configured model name and tag remain unchanged; detecting that would require storing a model hash or fingerprint.
