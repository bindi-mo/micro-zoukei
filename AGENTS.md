# MicroZoukei Agent Instructions

## Project Overview
MicroZoukei is a tool that bridges the workspace with `microstudio.dev` through a Rust-centric RPC model and a custom proxy server. The goal is to provide a seamless experience where frontend components (JS) never directly access the filesystem or make direct network calls; instead, they communicate via Tauri commands handled by Rust.

## Architecture Design: Rust-Centric RPC Model
### 1. Proxy Server (`proxy.rs`)
- **Role**: Acts as the gateway for all web requests.
- **Asset Priority**: Requests for static assets (`.html`, `.js`, `.css`, etc.) are served directly from the local cache directory (`_data` or `cache_dir`).
- **Proxy & Injection**:
    - Requests to `microstudio.dev` are proxied through this server.
    - The proxy automatically injects `injected.js` into HTML responses from remote sites, enabling the RPC bridge in the WebView's environment.

### 2. Tauri Commands (`commands.rs`)
- **Naming Convention**: All system-level actions use the `mzd_` prefix (e.g., `mzd_sync_files`, `mzd_read_file`).
- **Encapsulation**: Rust handles all file I/O, path resolution, and project state logic.
- **State Management**: Uses `AppState` to track proxy ports and navigation states.

### 3. Frontend Strategy
- **Minimal React App**: The local frontend is minimized or removed in favor of direct proxy access.
- **Injected Script**: The primary interaction point for the user's environment is a dynamically injected script that interfaces with the Tauri backend.

## Rules & Conventions
- **No direct fetch/FS in JS**: Always use Tauri `invoke` or RPC bridge for system actions.
- **Workspace Pathing**: Use the centralized path resolution logic in Rust.
- **Build Stability**: Ensure `lib.rs` remains clean by avoiding redundant command definitions and using module imports (`use commands::*;`).
- **Documentation Sync**: Whenever technical architecture (system design, RPC model, proxy logic) is changed or updated, ensure that the `README.md` file is also updated to reflect these changes accurately for project overview purposes.
- **Code Style**: All code comments and technical documentation MUST be in English.
- **Version Control**: Commit at logical intervals (one feature/fix per commit). The agent will suggest when a good point to commit is reached.
- **Error Handling Strategy**: After modifying Rust files, always immediately run `cargo check` or the associated build command to identify and resolve compiler errors before proceeding to the next stage of development. When running 'cargo check', navigate to the src-tauri/ directory and execute it there.
