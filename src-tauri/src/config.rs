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
    pub api_key_env: Option<String>,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: Option<String>,
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
    load_config_with_path(path, None)
}

/// Load the application configuration from a specific config file path.
///
/// If `config_path` is provided, uses that path directly. Otherwise, tries
/// `config.yml` first, then falls back to `config.yaml` for backward compatibility.
/// Returns `Err` if the file cannot be read or parsed.
pub fn load_config_with_path(path: PathBuf, config_path: Option<PathBuf>) -> Result<Config, String> {
    let actual_config_path = if let Some(p) = config_path {
        p
    } else {
        // Try config.yml first, then fall back to config.yaml for backward compatibility.
        if path.join("config.yml").exists() {
            path.join("config.yml")
        } else {
            path.join("config.yaml")
        }
    };

    let config_str = fs::read_to_string(&actual_config_path)
        .map_err(|e| format!("Failed to read config at {}: {}", actual_config_path.display(), e))?;

    noyalib::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))
}

// Ensure config.yml exists by copying from template.config.yml if needed
pub fn ensure_config_exists(workspace_path: PathBuf, template_path: PathBuf) -> Result<PathBuf, String> {
    let config_yml_path = workspace_path.join("config.yml");

    if !config_yml_path.exists() {
        if !template_path.exists() {
            return Err(format!("Template config not found at: {}", template_path.display()));
        }

        // Copy template to config.yml
        fs::copy(&template_path, &config_yml_path)
            .map_err(|e| format!("Failed to copy template config to {}: {}", config_yml_path.display(), e))?;

        println!("Created config.yml from template at: {}", config_yml_path.display());
    }

    Ok(config_yml_path)
}
