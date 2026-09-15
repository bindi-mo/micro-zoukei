use noyalib;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Config {
    pub rag: RagConfig,
    pub chat: ChatConfig,
    pub workspace: WorkspaceConfig,
    pub lancedb: LanceConfig,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct RagConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: String,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: String,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct WorkspaceConfig {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct LanceConfig {
    pub path: String,
}

/// Load the application configuration from config.yaml or config.yml.
/// 1. Functions for the default workspace that do not require arguments
pub fn load_default_config() -> Result<Config, String> {
    let default_path = crate::WORKSPACE_PATH
        .get()
        .ok_or_else(|| "The workspace path has not been initialized.".to_string())?
        .clone();

    load_config(default_path)
}

/// 2. Specific processing functions that require a pass
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
