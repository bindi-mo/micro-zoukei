use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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

use crate::config::LogLevel;
use crate::logger::LogModule;

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

// Helper: get the diff database path from the workspace
fn diff_db_path() -> PathBuf {
    crate::WORKSPACE_PATH
        .get()
        .map(|p| p.join("diffs.db"))
        .unwrap_or_else(|| PathBuf::from("diffs.db"))
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

    // Compute diff before writing
    let old_content = if full_path.exists() {
        fs::read_to_string(&full_path).await.unwrap_or_default()
    } else {
        String::new()
    };

    // Save diff to rusqlite
    let diff_text = crate::diff::compute_diff(&old_content, &content);
    if let Err(e) = crate::diff::save_diff(&diff_db_path(), &path, &diff_text) {
        crate::log!(
            LogModule::Diff,
            LogLevel::Error,
            "Failed to save diff for {}: {}",
            path,
            e
        );
    }

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

pub async fn handle_log_message(level: String, message: String) -> Result<(), String> {
    let level = match level.as_str() {
        "info" => LogLevel::Info,
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        _ => return Err(format!("Invalid log level: {}", level)),
    };

    crate::log!(LogModule::Frontend, level, "{}", message);
    Ok(())
}

pub async fn handle_run_agent(prompt: String) -> Result<String, String> {
    let config_state = {
        let state = crate::APP_STATE.lock().unwrap();
        state.config_state.clone()
    };
    crate::agent::executor::run_agent(prompt, config_state.as_ref()).await
}

pub async fn handle_health() -> Result<serde_json::Value, String> {
    Ok(json!({
        "status": "ok",
        "ready": true
    }))
}

pub async fn handle_sync_files(
    title: String,
    files: Vec<Value>,
) -> Result<serde_json::Value, String> {
    let project_path = {
        let state = crate::APP_STATE.lock().unwrap();
        state.config_state.projects.path.clone()
    };
    let save_path = std::path::PathBuf::from(&project_path).join(&title);
    crate::log!(
        LogModule::Commands,
        LogLevel::Info,
        "Sync destination: {}",
        save_path.display()
    );

    if files.is_empty() {
        crate::log!(
            LogModule::Commands,
            LogLevel::Info,
            "There are no files to sync"
        );
        return Ok(json!({
            "status": "error",
            "files_processed": 0
        }));
    }

    if !save_path.exists() {
        if let Err(error) = fs::create_dir_all(&save_path).await {
            return Err(format!(
                "Failed to create save directory {}: {}",
                save_path.display(),
                error
            ));
        }
    }

    let mut files_processed = 0;

    for file_obj in &files {
        // 1. Getting the File Path
        let file_path = match file_obj.get("file").and_then(|v| v.as_str()) {
            Some(path) if !path.is_empty() => path,
            _ => {
                crate::log!(
                    LogModule::Commands,
                    LogLevel::Warn,
                    "Invalid or missing 'file' key"
                );
                continue;
            }
        };

        // 2. Retrieving Content (String)
        let content_str = match file_obj.get("content").and_then(|v| v.as_str()) {
            Some(c) => c,
            None => {
                crate::log!(
                    LogModule::Commands,
                    LogLevel::Warn,
                    "No content found for file: {}",
                    file_path
                );
                continue;
            }
        };

        // 3. Check the isBinaryBase64 flag and prepare the data (byte sequence) to be written
        let is_binary = file_obj
            .get("isBinaryBase64")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let bytes: Vec<u8> = if is_binary {
            // For binary (Base64) data: Decoding process
            match base64::engine::general_purpose::STANDARD.decode(content_str) {
                Ok(decoded) => decoded,
                Err(e) => {
                    crate::log!(
                        LogModule::Commands,
                        LogLevel::Warn,
                        "Failed to decode base64 for {}: {}",
                        file_path,
                        e
                    );
                    continue; // If the Base64 is invalid, skip it at this point (without triggering any I/O).
                }
            }
        } else {
            // For ASCII/text: Convert directly to a byte array
            content_str.as_bytes().to_vec()
        };

        // 4. File Path Resolution and Duplicate Checks (I/O Processing)
        let full_path = save_path.join(file_path);

        // 4a. Compute diff before writing (if file already exists)
        if full_path.exists() {
            let old_content = fs::read_to_string(&full_path).await.unwrap_or_default();
            let new_content = String::from_utf8_lossy(&bytes).to_string();
            let diff_text = crate::diff::compute_diff(&old_content, &new_content);
            if let Err(e) = crate::diff::save_diff(&diff_db_path(), file_path, &diff_text) {
                crate::log!(
                    LogModule::Diff,
                    LogLevel::Error,
                    "Failed to save diff for {}: {}",
                    file_path,
                    e
                );
            }
        }

        // 5. Creating and Writing to Directories (I/O Processing)
        if let Some(parent) = full_path.parent() {
            if let Err(e) = fs::create_dir_all(parent).await {
                crate::log!(
                    LogModule::Commands,
                    LogLevel::Error,
                    "Failed to create parent directory for {}: {}",
                    file_path,
                    e
                );
                continue;
            }
        }

        match fs::write(&full_path, &bytes).await {
            Ok(_) => {
                files_processed += 1;
                crate::log!(
                    LogModule::Commands,
                    LogLevel::Info,
                    "Wrote file: {}",
                    full_path.display()
                );
            }
            Err(e) => crate::log!(
                LogModule::Commands,
                LogLevel::Error,
                "Failed to write file {}: {}",
                file_path,
                e
            ),
        }
    }

    Ok(json!({
        "status": "success",
        "files_processed": files_processed
    }))
}
