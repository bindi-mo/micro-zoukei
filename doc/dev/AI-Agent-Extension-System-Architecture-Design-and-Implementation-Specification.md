# microStudio AI Agent Extension System — Architecture Design & Implementation Specification v1.2.5

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
contains the `rag`, `chat`, `projects`, and `lancedb` fields, preserving the
existing top-level YAML schema without a nested `Config` wrapper. The state is
loaded and path-normalized once at application startup, then shared as an
immutable `Arc<ConfigState>` with Tauri commands and background workers. This
keeps configuration reads lock-free while allowing the knowledge watcher to
clone the lightweight `Arc` for each re-indexing task.

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

1. **Initialization**: Tauri app starts → reads `config.yml` → initializes LanceDB
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

---

## 6. Required Crates & Libraries

### Rust Crates

- `tokio` (async runtime)
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

# Workspace settings
workspace:
  path: "$HOME/.micro-zoukei/workspace"

# LanceDB settings
lancedb:
  path: "$HOME/.micro-zoukei/lancedb"
```

Note: The `api_key_env` field can be omitted when not required by the LLM provider (e.g., for local Ollama instances).

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
