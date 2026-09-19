# microStudio AI Agent Extension System — Architecture Design & Implementation Specification v1.3.0

## 1. System Overview

This system is a **Tauri-based desktop application** that adds an autonomous AI coding agent capability (Agent UI) to the web UI of the lightweight game development environment **"microStudio"** via DOM injection.

Tauri (Rust) serves as the host process, receiving requests from the **Web UI** and using a **RAG (Retrieval-Augmented Generation) type search/inference engine implemented entirely in Rust** to gather context. It then sends prompts to an LLM and parses/executes file operation commands via **rig** (Function Calling).

Rather than modifying the original source code directly, the system performs temporary state changes on the backend **Workspace ($HOME/.micro-zoukei/workspace)**, and the frontend retrieves and displays the resulting diff (unified diff + diff2html). It then provides a secure workflow that persists and syncs changes to both the web files and local files only after explicit user approval.

---

## 2. Overall System Architecture (Block Diagram)

```julia
┌─────────────────────────────────────────────────────────────────┐
│ [ LAYER 1: Frontend (microStudio UI + JS Injection) ]           │
│  ├─ DOM Injection: Adds an "Agent" tab and dedicated pane to    │
│  │    the existing menu                                         │
│  │    └─ Chat UI / Diff Viewer (unified diff + diff2html)       │
│  │                                                              │
│  ├─ Tauri IPC (fetch) ──► Proxies requests to backend via       │
│  │    reverse proxy                                             │
│  └─ Tauri Event (listen) ──► Real-time reception                │
│        └─ Streams LLM responses, displaying text as it flows    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ [ LAYER 2: Backend (Tauri / Rust) ]                             │
│  ├─ IPC Handler: Routes commands from the frontend              │
│  ├─ Logger: configuration-targeted log/env_logger routing       │
│  ├─ Knowledge Sync: Copies bundled resources at startup         │
│  │   └─ Preserves relative paths and rejects path overlap       │
│  ├─ Workspace Management: $HOME/.micro-zoukei/workspace         │
│  │   └─ Creates per-project subdirectories                      │
│  │   └─ When all files arrive from frontend, writes to workspace│
│  │       └─ Preserves existing files, collects diffs            │
│  │       └─ Passes all diffs to frontend; waits for user        │
│  │           approval on which side to sync                     │
│  │                                                              │
│  ├─ Diff Management: Records diffs in SQLite                    │
│  │                                                              │
│  └─ Rig Function Executor                                       │
│     ├─ LLM API calls (streaming support)                        │
│     ├─ Function Calling (tool definition, parsing, execution)   │
│     ├─ ReAct Loop control (sends tool results to LLM,           │
│     │    determines completion)                                 │
│     └─ Emits streaming data incrementally via app_handle.emit() │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ [ LAYER 3: RAG / Data Management Layer ]                        │
│  ├─ Document loading → chunking → embedding API                 │
│  ├─ LanceDB (local vector DB)                                   │
│  ├─ Project monitoring: detects file changes, re-indexes        │
│  └─ Per-provider API endpoint configuration                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│ [ LAYER 4: LLM Provider ]                                       │
│  ├─ If the model supports Tool Calling, it is supported         │
│  │   (gpt-4o, claude-3.5-sonnet, llama3.1, qwen2.5-coder, etc.) │
│  └─ Streaming output → received by Rust side, forwarded via     │
│     app_handle.emit() to frontend                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Detailed Specifications & Technology Stack

### LAYER 1: Frontend (JS Injection & Dedicated UI)

- **Technical Requirements**:
  - DOM injection script (TypeScript → transpiled to JavaScript)
  - Monitors microStudio's DOM structure, inserts additional tab into menu bar
  - Chat panel, diff display (**unified diff + diff2html** for visual rendering)
- **Key Responsibilities**:
  - Send user natural language prompts to backend
  - Display returned code diffs (before/after) visually using **diff2html**
  - **Initial sync processing**: If workspace already exists, compare which is newer — microStudio buffer or workspace — and prompt user to choose
  **Agent post-execution sync**: After coding agent makes changes, update microStudio editor buffers and persist to local files
  - **Streaming support**: Receive LLM responses in streaming fashion, displaying text as it flows
  - **Communication method**:
    - Request sending: Use Tauri `fetch` via **reverse proxy server** (cannot use `invoke` due to security restrictions)
    - Real-time reception: Tauri Event (`listen`)

### LAYER 2: Backend (Tauri / Rust)

- **Technical Requirements**: Tauri v2, `tokio` (async runtime), `rig` (Function Calling support)
- **Key Responsibilities**:
  - Load application startup configuration (`config.yml`)
  - Initialize the standard `log`/`env_logger` router after the configuration state is committed
  - Synchronize bundled knowledge resources before serving requests
  - Route IPC requests from frontend
  - **Workspace Management**:
    - Physical location: `$HOME/.micro-zoukei/workspace`
    - **Creates per-project subdirectories** (e.g., `$HOME/.micro-zoukei/workspace/{project_name}`)
    - When all files arrive from frontend, writes them to workspace
    - Preserves existing files, collects change diffs
    - Passes all diffs to frontend; waits for user approval on which side to sync
    - Workspace is persisted; cleanup is not performed (assumes user manages via git, etc.)
  - **Diff Management (using rusqlite)**:
    - Records file change diffs in a SQLite database managed by **rusqlite**
    - Provides functions to save, retrieve, and delete diff data
    - After user approval, executes sync to local files based on diff data
  - **Rig Function Executor**:
    - Sends LLM API requests (streaming mode supported)
    - **Enables Function Calling only if the model supports it**
    - Tool definition, parsing, execution
    - ReAct loop control (sends tool execution results to LLM, determines completion)
    - Forwards streaming data to frontend in real time via `app_handle.emit()`

#### Configuration State and Ownership

`ConfigState` is the only application configuration aggregate. It directly
contains the `rag`, `chat`, `projects`, `lancedb`, `knowledge`, and `logger`
fields, preserving the existing top-level YAML schema without a nested `Config`
wrapper. The state is loaded and path-normalized once at application startup,
then shared as an immutable `Arc<ConfigState>` with Tauri commands and
background workers. This keeps configuration reads lock-free while allowing the
knowledge watcher to clone the lightweight `Arc` for each re-indexing task. New
configurations omit the `knowledge` and `logger` sections and automatically
receive the default `<workspace>/knowledge_base` path and `info` logger
thresholds. Custom destinations and log levels can be configured with
`knowledge.path` and `logger.<module>` when required.

#### Knowledge Resource Synchronization

During Tauri setup, Rust resolves the packaged `resources/knowledge_base`
directory through `BaseDirectory::Resource` and reads the destination from
`config.knowledge.path`. Before the reverse proxy starts, it recursively copies
regular files while preserving their relative paths. Source files overwrite
matching destination files, destination-only files remain untouched, and source
symlinks are not followed.

Both paths are canonicalized before copying. Equal paths and overlap in either
direction are rejected. A missing resource, inaccessible destination, or copy
failure is returned from application initialization, so the proxy and UI are not
started with an incomplete knowledge base. Tauri packages the recursive
`resources/knowledge_base/**/*` resource glob to retain nested documentation.

### Rig Function Executor (Detailed)

- **Technical Requirements**: `rig`, `reqwest` (HTTP communication), `serde_json` (JSON parsing)
- **Key Responsibilities**:
  - **LLM API calls**:
    - Uses provider, model name, and API key defined in `config.yml`
    - Sends requests to LLM in streaming mode
    - Forwards received streaming data to frontend in real time via `app_handle.emit()`
  - **Function Calling**:
    - Defines 3 tools: `view_file_structure`, `read_file`, `write_file`
    - Parses tool calls from LLM according to JSON schema
    - Executes parsed commands on the Workspace
  - **ReAct Loop Control**:
    - Sends tool execution results to LLM, requests additional processing
    - Continues loop until LLM determines completion
    - Sends final answer to frontend

### LAYER 3: RAG / Data Management Layer (Rust)

- **Technical Requirements**: `lancedb`, `reqwest` (embedding API calls), `walkdir`/`ignore` (directory traversal), `notify` (file monitoring)
- **Key Responsibilities**:
  - Recursively traverses source code under specified path when project is loaded
  - Chunking → vectorization via embedding API → storage in LanceDB
  - Vectorizes user queries → similarity search in LanceDB → extracts relevant context
  - Project monitoring: detects file changes via `notify`, automatically re-indexes
  - **Per-provider API endpoint configuration**: Endpoints for each provider are explicitly written in `config.yml`

#### Index Identity Persistence

Each index record in LanceDB is accompanied by persistent metadata storing the `embedding_provider` and `embedding_model` that were used to generate the embeddings. This identity is stored alongside the index (e.g., as a dedicated table or metadata columns in `my_documents`) and is the basis for all validation and rebuild decisions.

#### Index Validation on Load

When the application starts or a project is loaded, the stored `embedding_provider` and `embedding_model` values are compared against the current `rag.provider` and `rag.model` settings from `config.yml`. This identity check determines whether the existing index is still valid.

#### Staleness Detection Conditions

An index is considered **stale** (and requires rebuild) if any of the following conditions are detected:

- **Column deficiency**: The stored index lacks the `embedding_provider` or `embedding_model` metadata columns (e.g., from an older version that did not persist identity)
- **Dimension mismatch**: The vector dimensions stored in the index do not match the output dimension of the current embedding model
- **Provider/model mismatch**: The stored `embedding_provider` or `embedding_model` differs from the current `rag.provider` or `rag.model` in `config.yml`

#### Automatic Rebuild on Staleness

When staleness is detected, the index is automatically rebuilt:
- All existing entries in the LanceDB index for that project are cleared
- The document loading → chunking → embedding → storage flow is re-executed using the current embedding configuration
- The new identity metadata (`embedding_provider`, `embedding_model`) is persisted with the rebuilt index

#### Configuration Independence

RAG index rebuilds are triggered **only** by changes to `rag.provider` or `rag.model`. Changes to `chat.provider` or `chat.model` do **not** trigger index rebuilds, as the chat configuration affects only LLM inference and has no impact on embedding generation or index structure.

### LAYER 4: LLM Provider

- **Requirements**: **Only supported if the model supports Tool Calling (Tool Definition / Tool Choice)** (e.g., `gpt-4o`, `claude-3.5-sonnet`, `llama3.1`, `qwen2.5-coder`)
- **Key Responsibilities**:
  - Receives system prompt, RAG-retrieved context, current editor code, and user instructions as input; outputs appropriate file operation commands as tool calls conforming to JSON schema
  - Outputs in streaming mode; Rust side receives and forwards to frontend incrementally via `app_handle.emit()`

---

## 4. The Three Tools (How the Agent Manipulates Files)

| Tool Name | Role | Details |
|---|---|---|
| `view_file_structure` | Retrieves the project's directory tree | Grasping structure (structural understanding) |
| `read_file` | Reads file contents | Reviewing existing code and configurations |
| `write_file` | Writes/overwrites file contents | Reflecting generated code |

---

## 5. Data Communication Sequence (Implementation Flow)

1. **Initialization**: Tauri app starts → resolves the packaged `resources/knowledge_base` → reads `config.yml` → normalizes `config.knowledge.path` → recursively copies bundled knowledge files → rejects copy/overlap errors → commits `ConfigState` → initializes the `log`/`env_logger` router from `config.logger` → starts the reverse proxy
2. **Project Loading**: User selects project → writes all files to `$HOME/.micro-zoukei/workspace/{project_name}` → preserves existing files while collecting diffs
3. **Index Construction**: Document loading → chunking → embedding API → storage in LanceDB
4. **Prompt Sending**: Enter instruction in chat → sends to backend via reverse proxy using Tauri `fetch`
5. **RAG Search**: Vectorize question → LanceDB similarity search → extract relevant context
6. **LLM Inference (rig)**:
   - rig sends streaming request to LLM API
   - Forwards received streaming data to frontend in real time via `app_handle.emit()`
   - Includes Function Calling tool definitions (only if model supports them)
7. **Function Calling (rig)**:
   - Receives tool calls from LLM → rig parses according to JSON schema
   - Executes parsed commands on Workspace
   - Sends execution results back to LLM (ReAct Loop)
   - Continues loop until LLM determines completion
8. **Diff Generation**: Generates diff data before/after changes (records in rusqlite) → responds to frontend
9. **Diff Review & Approval**: Frontend displays **unified diff + diff2html** → user approves
10. **Sync Completion**: After approval, force-updates microStudio editor buffers and persists to local files
11. **Frontend Diagnostics**: Explicit frontend records use `rpcBridge.logMessage(level, message)` → `/api/command` → `mzd_log_message` → Rust emits them with the explicit target `frontend`

---

## 6. Required Crates & Libraries

### Rust Crates

- `tokio` (async runtime)
- `log` (standard logging facade)
- `env_logger` (configuration-driven console logger)
- `reqwest` (HTTP communication: embedding API & LLM API calls)
- `serde` / `serde_json` / `noyalib` (JSON/YAML parsing)
- `lancedb` (local vector DB)
- `walkdir` / `ignore` (directory traversal)
- `notify` (file monitoring)
- `rig` (Function Calling / tool call support, streaming processing)
- `rusqlite` (SQLite Rust binding: diff recording management)

### JavaScript Libraries

- `diff2html` (visual diff display)

---

## 7. Configuration File (config.yml)

```yaml
# $HOME/.micro-zoukei/config.yml

# RAG settings (for embedding model)
rag:
  provider: "openai"  # or "ollama", etc.
  model: "text-embedding-3-small"
  api_key_env: "OPENAI_API_KEY"
  endpoint: "https://api.openai.com/v1/embeddings"  # Per-provider endpoint

# Chat settings (for LLM)
chat:
  provider: "openai"
  model: "gpt-4o"
  api_key_env: "OPENAI_API_KEY"
  endpoint: "https://api.openai.com/v1/chat/completions"  # Per-provider endpoint

# Projects settings
projects:
  path: "$HOME/.micro-zoukei/projects"

# LanceDB settings
lancedb:
  path: "$HOME/.micro-zoukei/lancedb"

# Runtime log thresholds
logger:
  frontend: info
  tauri: info
  proxy: info
  agent: info
  commands: info
  diff: info
```

Each logger module accepts `off`, `error`, `warn`, `info`, `debug`, or `trace`.
The severity order is `trace < debug < info < warn < error`; a module emits
records at or above its configured threshold, while `off` suppresses all records.
Omitting `logger` or individual module fields defaults each module to `info`.

`config.yml` is the sole filter source. The logger uses `env_logger::Builder::new()`
and does not read or merge `RUST_LOG`. It retains `env_logger`'s standard console
formatter rather than the former custom `[MODULE] [LEVEL] message` format.

The injected frontend sends explicit records through `rpcBridge.logMessage`.
Rust accepts only lowercase `info`, `warn`, and `error`, emits them with the
explicit target `frontend`, rejects invalid levels as IPC errors, and returns
success for suppressed records. Browser console output is not intercepted
automatically.

Only `error` records are routed to stderr. `warn`, `info`, `debug`, and `trace`
records are routed to stdout.

Omit the `knowledge` section to use the default `<workspace>/knowledge_base`
path. Specify `knowledge.path` only when a custom destination is required:

```yaml
knowledge:
  path: "/custom/knowledge_base"
```

The `api_key_env` field can be omitted when not required by the LLM provider
(e.g., for local Ollama instances).

---

### Logger Design

The logger is initialized after `AppState` commits the loaded `ConfigState`,
ensuring that startup diagnostics use the configured thresholds. The public
entry point is `config::init_logger(LoggerConfig)`. Repeated initialization is
idempotent: an already-installed process-global logger is left unchanged.

`init_logger` converts the typed `LoggerConfig` thresholds into target directives
and builds two `env_logger::Logger` instances with identical filters. One targets
stdout and the other stderr. `env_logger::Builder::new()` is used deliberately,
so `RUST_LOG` is neither read nor merged with application configuration.

Target mapping uses the actual library crate name from `env!("CARGO_CRATE_NAME")`.
The `frontend` target is literal; `tauri` maps to the crate root; `proxy`, `agent`,
and `diff` map to their crate-qualified module prefixes; and both `commands` and
`handlers` share the `commands` threshold. This preserves module ownership without
a custom caller-classification macro.

A private `SplitLogger` implements the `log::Log` facade over both child loggers.
Its `enabled`, `log`, and `flush` methods delegate consistently. It selects the
stderr child only for `log::Level::Error`; every other level uses stdout. The
global maximum level is the most verbose non-`Off` configured threshold.

Rust call sites use the standard `log::trace!`, `log::debug!`, `log::info!`,
`log::warn!`, and `log::error!` macros. Frontend IPC records use an explicit
`target: "frontend"`. Diff persistence failures remain emitted from `diff.rs`,
so they use the `diff` target rather than the wrapping command handler's target.

---

## 8. Version History

| Version | Date | Changes |
|---|---|---|
| v1.0.0 | 2026-09-12 | Initial design (Tauri + Python sidecar + ChromaDB) |
| v1.0.1 | 2026-09-12 | Changed Monaco Editor → unified diff + diff2html; renamed shadow workspace → workspace |
| v1.1.0 | 2026-09-12 | Removed Python sidecar, unified to Rust-only, adopted LanceDB |
| v1.1.1 | 2026-09-12 | Removed TLS description, corrected Python 3.11+ notation, introduced rig-core |
| v1.2.0 | 2026-09-13 | Workspace physical location specification, sqlite3 diff recording, forced sync workflow, streaming support, config.yml specification, terminology unification |
| v1.2.1 | 2026-09-13 | Reviewed rig-core design/specifications overall, added Function Executor details |
| v1.2.2 | 2026-09-13 | Changed streaming data transfer method to `app_handle.emit()` and Tauri Event, corrected Layer 1–4, other minor fixes |
| v1.2.3 | 2026-09-13 | Specified crate for diff recording (rusqlite), added detailed Diff Management functionality description |
| v1.2.4 | 2026-09-13 | Specified IPC communication method (fetch via reverse proxy), added `notify`, removed LanceDB memory usage descriptions, clarified Function Calling support conditions, added per-project workspace subdirectories, added per-provider API endpoint configuration in config.yml, unified notation (sqlite3 → SQLite), specified streaming performance considerations |
| v1.2.5 | 2026-09-13 | Implemented all discrepancies between specification and Rust/Tauri implementation: `rig-core` → `rig` notation, `serde_yaml` → `noyalib`, `api_key` → `api_key_env`, real rusqlite diff recording, RAG integration in executor, per-provider endpoint support, project file monitoring with `notify`, diff recording in handlers |
| v1.2.6 | 2026-09-17 | Added startup synchronization of packaged knowledge resources, recursive resource packaging, configurable knowledge paths, workspace-scoped configuration defaults, and bidirectional path-overlap protection |
| v1.2.7 | 2026-09-17 | Added per-module log-level configuration, lazy severity filtering, frontend log IPC classification, stream routing, and logger regression tests |
| v1.2.8 | 2026-09-17 | Reworked logging to infer Rust modules from `module_path!()`, added frontend-specific logging, and moved diff failure logging into `diff.rs` |
| v1.2.9 | 2026-09-18 | Replaced the custom logger with `log`/`env_logger`, retained typed module filters, and routed only errors to stderr |
| v1.3.0 | 2026-09-19 | Added index identity persistence (`embedding_provider`/`embedding_model`), index validation on load, staleness detection (column deficiency, dimension mismatch, provider/model mismatch), automatic rebuild on staleness, and documented RAG index rebuild trigger scope (rag.provider/rag.model only, not chat settings) |

---

### Summary of Changes (v1.2.9 → v1.3.0)

| Item | Change Description |
|---|---|
| **Index Identity** | Added persistent `embedding_provider` and `embedding_model` metadata to index records |
| **Index Validation** | Added identity check on load comparing stored values against `rag.provider`/`rag.model` |
| **Staleness Detection** | Defined 3 staleness conditions: column deficiency, dimension mismatch, provider/model mismatch |
| **Auto-Rebuild** | Automatic index rebuild on staleness (clear → re-index → persist new identity) |
| **Config Independence** | Documented that index rebuilds are triggered only by `rag.provider`/`rag.model` changes, not `chat` settings |

---

### Summary of Changes (v1.2.8 → v1.2.9)

| Item | Change Description |
|---|---|
| **Logging API** | Replaced the custom logger and macros with the standard `log` facade and `env_logger` |
| **Filtering** | Retained typed per-module thresholds and mapped them to actual crate-qualified targets |
| **Stream Routing** | Routed only `error` records to stderr and all other levels to stdout |
| **Frontend and Diff Targets** | Emitted frontend IPC explicitly and preserved diff-owned error logging |

---

### Summary of Changes (v1.2.5 → v1.2.6)

| Item | Change Description |
|---|---|
| **Configuration** | Added top-level `knowledge.path` with workspace-scoped YAML defaults |
| **Startup Sync** | Copy packaged knowledge resources before proxy initialization |
| **Packaging** | Bundle nested knowledge files with `resources/knowledge_base/**/*` |
| **Safety** | Reject source/destination overlap in either direction and skip symlinks |
| **Compatibility** | Preserve empty `ConfigState::default()` while defaulting deserialized knowledge paths |

---

### Summary of Changes (v1.2.4 → v1.2.5)

| Item | Change Description |
|---|---|
| **Notation** | `rig-core` → `rig` (crate name) throughout all sections |
| **Notation** | `serde_yaml` → `noyalib` (YAML parsing crate) |
| **Notation** | `api_key` → `api_key_env` (environment variable name field) |
| **Diff Recording** | Replaced stub with real rusqlite implementation (`init_db`, `save_diff`, `get_all_diffs`, `get_diffs_for_file`, `delete_diffs_for_file`, `delete_all_diffs`, `compute_diff`) |
| **RAG Integration** | Added `rag::rag_query_answer()` call before sending prompt to LLM in executor |
| **Endpoints** | Added per-provider endpoint support for OpenAI and OpenRouter via `Client::builder().base_url()` |
| **File Monitoring** | Added `spawn_knowledge_watcher()` in `rag.rs` using `notify` to detect `.txt`/`.md` changes and re-index LanceDB |
| **Diff Recording in Handlers** | `handle_write_file()` and `handle_sync_files()` now compute and save diffs before writing |
