# MicroZoukei

MicroZoukei is a tool that bridges the workspace with `microstudio.dev` through a Rust-centric RPC model and a custom proxy server. The goal is to provide a seamless experience where frontend components (JS) never directly access the filesystem or make direct network calls; instead, they communicate via Tauri commands handled by Rust.

## Architecture Overview

- **Config**: `ConfigState` loads `template.config.yml` → `$HOME/.micro-zoukei/config.[yml|yaml]`
- **Knowledge Sync**: Bundled knowledge resources are copied to the configured knowledge path at startup
- **Agent**: `src-tauri/src/agent/` (rag, executor, tools)
- **Diff**: `src-tauri/src/diff.rs` + SQLite (`rusqlite`)
- **Tests**: `src-tauri/tests/`
- **Frontend**: `diff2html` for visual diff

### Configuration State

`ConfigState` is the sole configuration aggregate. It directly owns the `rag`,
`chat`, `projects`, `lancedb`, `knowledge`, and `logger` sections from the YAML
schema, without a nested `Config` wrapper. Tauri stores an immutable
`Arc<ConfigState>` at startup and shares it with commands and background
workers; path normalization is applied once during loading. New configurations
may omit the `knowledge` and `logger` sections. Knowledge paths default to
`<workspace>/knowledge_base`, while every logger module defaults to `info`.
Custom destinations and log thresholds can be configured with `knowledge.path`
and `logger.<module>` when required.

### Knowledge Resource Synchronization

At startup, Tauri resolves the bundled `resources/knowledge_base` directory and
recursively copies its regular files to `config.knowledge.path`, preserving the
relative directory structure. Files already present at the destination are
overwritten, while destination-only files are retained. Symlinks are not
followed, and overlapping source and destination paths are rejected to prevent
recursive or destructive copies. A missing source or copy failure prevents the
application from starting, ensuring the RAG knowledge base is never used in an
unexpected partial state.

### Logger Configuration

Runtime logs use the standard `log` facade with `env_logger` and per-category
severity thresholds loaded from `config.yml`. The built-in categories are
`frontend`, `tauri`, `proxy`, `agent`, `commands`, and `diff`. Each category
accepts `off`, `error`, `warn`, `info`, `debug`, or `trace`; omitted categories
default to `info`.

```yaml
logger:
  frontend: info
  tauri: info
  proxy: info
  agent: info
  commands: info
  diff: info
```

A category emits records at or above its configured threshold. `off` suppresses
all records for that category. `config.yml` is the only filter source: the logger
does not read or merge `RUST_LOG`.

#### Additional Categories

Extra categories can be added with `logger.<top_level_module>: <level>`. The name
must match a Rust top-level module exactly, for example `logger.network: debug`
applies to `micro_studio_agent_lib::network::*`.

```yaml
logger:
  network: debug
  initial_index: warn
```

A category that does not match a Rust module is accepted but produces no logs,
because Rust modules cannot be enumerated at runtime. Do not configure the
internal crate prefix (`micro_studio_agent_lib`) or crate-qualified names; use
only the short logical names.

#### Category Mapping

Normal Rust logs omit `target:` and are classified automatically from the
record's module path:

- `frontend` is the literal target used only by frontend IPC records.
- `tauri` is the crate root and the fallback for any unconfigured crate module
  (for example `initial_index` and `network`).
- `proxy`, `agent`, and `diff` map to their crate-qualified module prefixes.
- `commands` is canonical; `handlers` is an alias and always shares the
  `commands` threshold. A dynamic `handlers` entry is ignored.

#### Output Format

After `ConfigState` is committed at startup, `config::init_logger` builds two
`env_logger` instances with identical category filters. One writes to stdout and
the other to stderr. A custom formatter prints the timestamp, level, and short
category:

```
2026-09-19 12:34:56 [INFO] [proxy] Started on http://127.0.0.1:8080
```

Rust modules emit through `log::trace!`, `log::debug!`, `log::info!`,
`log::warn!`, and `log::error!`. Diff persistence failures are emitted from
`diff.rs`, so they display as `diff`.

Frontend records arrive through `rpcBridge.logMessage(level, message)`. Rust
accepts only lowercase `info`, `warn`, and `error`, emits them with the explicit
target `frontend`, rejects invalid levels as IPC errors, and returns success for
suppressed records. Browser console output is not intercepted automatically.

Only `error` records are routed to stderr. `warn`, `info`, `debug`, and `trace`
records are routed to stdout.

### 1. Proxy Server (`proxy.rs`)
The proxy acts as the central gateway for all web requests:
- **Local Assets**: Static files like `.html`, `.js`, and `.css` are served directly from the local cache directory to ensure high performance and offline accessibility.
- **Remote Proxying**: Requests meant for `microstudio.dev` are proxied through this server.
- **Script Injection**: The proxy automatically injects a bridge script (`injected.js`) into HTML responses from remote sites, enabling seamless communication between the browser's environment and our Rust backend.

### 2. Rust RPC Model (`commands.rs`)
All interactions with your local filesystem or project state are encapsulated in Rust commands prefixed with `mzd_` (e.g., `mzd_read_file`, `mzd_sync_files`). This ensures that:
- File path resolution is handled consistently by the core logic.
- Project states remain synchronized between the UI and the background backend.

### 3. Frontend Integration
The frontend component is minimized. Primary interaction occurs through the injected bridge, allowing for a smooth experience that feels like it's running natively on `microstudio.dev` while maintaining deep integration with your local workspace.

### 4. Initial RAG Index Lifecycle
When the user navigates to `/projects/`, the frontend requests an idempotent initial index through the `mzd_ensure_initial_index` RPC command. The Rust backend validates the existing `my_documents` LanceDB table (schema, UTF-8 text fields, fixed-size embedding list, and nonzero row count) and rebuilds it only when it is missing or invalid. Lifecycle state is tracked by `InitialIndexManager` (`idle`, `in_progress`, `complete`, `failed`) and surfaced through typed `initial-index-status` Tauri events (`started`, `in_progress`, `completed`, `failed`). A blocking, accessible modal (`role="alertdialog"`, `aria-modal`, focus trap, Escape/wheel/touch blocking) covers the WebView while indexing. After a successful index, the debug knowledge watcher starts exactly once and reacts to supported-file deletion even when the path no longer exists. Hot reload calls `window.microZoukeiInjectedState.cleanup()` to tear down the lifecycle, restore navigation hooks, and hide the modal.

Embedding dimensions are resolved from the configured embedding model before LanceDB schema construction. For Ollama, Rust sends a small probe request through Rig's existing Ollama client and derives the dimension from the length of the returned embedding vector. The complete configured model identifier is preserved, including tags such as `:latest`, and custom models are accepted when Ollama returns a valid vector. Empty, invalid, zero, or oversized dimensions are rejected before Arrow record-batch construction. OpenAI and OpenRouter continue to use provider metadata when available. This prevents fixed-size-list construction panics caused by incompatible or zero-width dimensions.

The frontend applies a separate three-second timeout to the immediate `mzd_ensure_initial_index` response. A timely `already_valid`, `started`, or `in_progress` response cancels the timeout; later lifecycle events still control the visible indexing state. If no immediate response arrives, the frontend reports a clear error, closes the modal, and leaves its request state as `failed` without cancelling an indexing task that the backend has already started. The existing five-second timeout in `rpc-bridge.ts` remains a separate transport safeguard.

The `my_documents` table persists `embedding_provider` and `embedding_model` for every document row. The initial index validates the existing table against the current embedding identity before reuse. A completed index is revalidated on the next `mzd_ensure_initial_index` call; if the embedding provider or model has changed, the index is treated as invalid and rebuilt through the normal `started` lifecycle. Changing only the chat/completion model does not invalidate the RAG index because RAG uses the independent `rag.provider` and `rag.model` configuration. Legacy tables without identity columns are treated as stale and rebuilt automatically.

## Getting Started

To build and run the project:

1.  **Install Dependencies**: Ensure you have Rust, Node.js, and the necessary build tools installed.
2.  **Build & Run**:
    ```bash
    npm install
    npm run tauri dev
    ```
3.  **Usage**: Access your project through the proxy which provides a unified view of your local workspace and remote environment.

## Development Guidelines
Whenever technical architecture (system design, RPC model, or proxy logic) is updated, please ensure that this `README.md` reflects those changes to keep our documentation in sync with our implementation.
