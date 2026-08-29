use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandPayload {
    pub command: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub error: Option<String>,
}

impl CommandResponse {
    pub fn success(data: serde_json::Value) -> Self {
        Self {
            success: true,
            data,
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: serde_json::Value::Null,
            error: Some(error),
        }
    }
}

// Error mapping utility - converts Rust errors to detailed JSON responses
pub fn map_error<T: serde::Serialize>(source: Result<T, String>) -> CommandResponse {
    match source {
        Ok(value) => CommandResponse::success(serde_json::to_value(&value).unwrap_or_default()),
        Err(e) => CommandResponse::error(e),
    }
}

// Helper to resolve paths
pub fn resolve_path(path: &str) -> Result<PathBuf, String> {
    let mut full_path = PathBuf::from("_data");
    full_path.push(path.strip_prefix('/').unwrap_or(path));

    if !full_path.is_absolute() {
        let mut root = std::env::current_dir().map_err(|e| e.to_string())?;
        root.push(full_path);
        full_path = root;
    }
    Ok(full_path)
}

pub async fn handle_list_files(path: String) -> Result<serde_json::Value, String> {
    let full_path = resolve_path(&path)?;
    let mut files = Vec::new();

    let mut entries = fs::read_dir(full_path).await.map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let p = entry.path();
        files.push(json!({
            "path": p.to_string_lossy().into_owned(),
            "contentType": mime_guess::from_path(&p).first_raw().map(|s| s.to_string()).unwrap_or_default()
        }));
    }
    Ok(json!({ "files": files }))
}

pub async fn handle_read_file(path: String) -> Result<String, String> {
    let full_path = resolve_path(&path)?;
    fs::read_to_string(full_path)
        .await
        .map_err(|e| e.to_string())
}

pub async fn handle_write_file(path: String, content: String) -> Result<bool, String> {
    let full_path = resolve_path(&path)?;
    fs::write(full_path, content)
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub async fn handle_delete_file(path: String) -> Result<bool, String> {
    let full_path = resolve_path(&path)?;
    fs::remove_file(full_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub async fn handle_log_message(message: String) -> Result<(), String> {
    println!("[LOG] {}", message);
    Ok(())
}

pub async fn handle_health() -> Result<serde_json::Value, String> {
    Ok(json!({
        "status": "ok",
        "ready": true
    }))
}

pub async fn handle_sync_files(path: String) -> Result<serde_json::Value, String> {
    let list = handle_list_files(path).await?;
    let files = list["files"].as_array().cloned().unwrap_or_default();

    for file_obj in &files {
        if let Some(f) = file_obj.get("path").and_then(|v| v.as_str()) {
            match handle_read_file(f.to_string()).await {
                Ok(content) => {
                    let _ = handle_write_file(f.to_string(), content).await;
                }
                Err(_) => println!("[sync] Failed to sync file: {}", f),
            }
        }
    }

    Ok(json!({
        "status": "success",
        "files_processed": files.len()
    }))
}
