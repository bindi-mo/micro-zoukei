use noyalib;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Config {
    pub rag: RagConfig,
    pub chat: ChatConfig,
    pub workspace: WorkspaceConfig,
    pub lancedb: LanceConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RagConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: String,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: String,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WorkspaceConfig {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LanceConfig {
    pub path: String,
}

/// Wrapper around `Config` that is shared via `Arc<ConfigState>` across
/// Tauri commands and background threads (e.g. the knowledge watcher).
///
/// The config is loaded once at application startup and treated as
/// immutable thereafter, so no locking is required.
#[derive(Default)]
pub struct ConfigState {
    pub config: Config,
}

impl ConfigState {
    /// Load a `ConfigState` from the given workspace directory.
    pub fn load(path: PathBuf) -> Result<Self, String> {
        Ok(ConfigState {
            config: load_config(path)?,
        })
    }
}

/// Load the application configuration from `config.yml` or `config.yaml`.
///
/// Tries `config.yml` first, then falls back to `config.yaml` for backward
/// compatibility. Returns `Err` if the file cannot be read or parsed.
pub fn load_config(path: PathBuf) -> Result<Config, String> {
    // Try config.yml first, then fall back to config.yaml for backward compatibility.
    let config_path = if path.join("config.yml").exists() {
        path.join("config.yml")
    } else {
        path.join("config.yaml")
    };

    let config_str = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config at {}: {}", config_path.display(), e))?;

    noyalib::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))
}
