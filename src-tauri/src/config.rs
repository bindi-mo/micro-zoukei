use serde::{Deserialize, Serialize};

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
    pub api_key: String,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub api_key: String,
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
