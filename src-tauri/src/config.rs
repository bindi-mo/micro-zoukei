use noyalib;
use serde::{Deserialize, Serialize};
use std::fs;

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
pub fn load_config() -> Result<Config, String> {
    let workspace = crate::WORKSPACE_PATH
        .get()
        .ok_or_else(|| "The workspace path has not been initialized.".to_string())?;

    // Try config.yml first, then fall back to config.yaml for backward compatibility.
    let path = workspace.join("config.yml");
    let path = if path.exists() {
        path
    } else {
        workspace.join("config.yaml")
    };

    let config_str = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config at {}: {}", path.display(), e))?;
    noyalib::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))
}
