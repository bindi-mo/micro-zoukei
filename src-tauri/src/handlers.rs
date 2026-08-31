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

pub async fn handle_sync_files(
    title: String,
    files: Vec<Value>,
) -> Result<serde_json::Value, String> {
    // Get or create workspace based on title (simplified - in real implementation would use a manager)
    let save_path = crate::WORKSPACE_PATH.get()
        .map(|path| path.join(title))
        .ok_or_else(|| "The workspace path has not been initialized.".to_string())?;

    let mut files_processed = 0;

    if files.is_empty() {
        print!("There are no files to sync. handle_sync_files");
        return Ok(json!({
            "status": "error",
            "files_processed": files_processed
        }));
    }

    for file_obj in &files {
        if let Some(file_path) = file_obj.get("file").and_then(|v| v.as_str()) {
            let full_path = save_path.join(file_path);

            if fs::metadata(&full_path).await.is_ok() {
                println!("[sync] File already exists, skipping: {}", file_path);
                continue;
            } else {
                if let Some(parent) = full_path.parent() {
                    fs::create_dir_all(parent)
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }

            // Read content from the file object itself (content is provided in the frontend)
            if let Some(content_str) = file_obj.get("content").and_then(|v| v.as_str()) {
                match fs::write(&full_path, content_str).await {
                    Ok(_) => {
                        files_processed += 1;
                        println!("file: {}", full_path.display());
                    }
                    Err(e) => println!("[sync] Failed to write file {}: {}", file_path, e),
                }
            } else if let Some(file_content) = file_obj.get("content").and_then(|v| v.as_str()) {
                // Alternative: content might be at root level
                match fs::write(&full_path, file_content).await {
                    Ok(_) => files_processed += 1,
                    Err(e) => println!("[sync] Failed to write file {}: {}", file_path, e),
                }
            } else {
                println!("[sync] No content found for file: {}", file_path);
            }
        } else if let Some(file_content) = file_obj.get("content").and_then(|v| v.as_str()) {
            // If no "file" key but has content, use the "file" field from object as path
            let file_path = file_obj.get("file").and_then(|v| v.as_str()).unwrap_or("");

            if !file_path.is_empty() {
                match fs::write(resolve_path(file_path)?, file_content).await {
                    Ok(_) => files_processed += 1,
                    Err(e) => println!("[sync] Failed to write file {}: {}", file_path, e),
                }
            }
        } else {
            println!("[sync] Invalid file object structure");
        }
    }

    Ok(json!({
        "status": "success",
        "files_processed": files_processed
    }))
}
