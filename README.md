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
`chat`, `projects`, `lancedb`, and `knowledge` sections from the YAML schema,
without a nested `Config` wrapper. Tauri stores an immutable `Arc<ConfigState>`
at startup and shares it with commands and background workers; path
normalization is applied once during loading. Existing configuration files that
omit the `knowledge` section, declare `knowledge: {}`, or set an empty
`knowledge.path` automatically use the default `<workspace>/knowledge_base` path.

### Knowledge Resource Synchronization

At startup, Tauri resolves the bundled `resources/knowledge_base` directory and
recursively copies its regular files to `config.knowledge.path`, preserving the
relative directory structure. Files already present at the destination are
overwritten, while destination-only files are retained. Symlinks are not
followed, and overlapping source and destination paths are rejected to prevent
recursive or destructive copies. A missing source or copy failure prevents the
application from starting, ensuring the RAG knowledge base is never used in an
unexpected partial state.

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
