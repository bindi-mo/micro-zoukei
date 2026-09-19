use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::fs;

use crate::agent::rag::ensure_initial_index;
use crate::initial_index::{EnsureInitialIndexResponse, InitialIndexStatusEvent};

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
    let _ = crate::diff::save_diff_with_log(&diff_db_path(), &path, &diff_text);

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
    println!("{}", message);
    match level.as_str() {
        "debug" => log::debug!(target: "frontend", "{}", message),
        "info" => log::info!(target: "frontend", "{}", message),
        "warn" => log::warn!(target: "frontend", "{}", message),
        "error" => log::error!(target: "frontend", "{}", message),
        _ => return Err(format!("Invalid log level: {}", level)),
    };

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
    log::info!("Sync destination: {}", save_path.display());

    if files.is_empty() {
        log::info!("There are no files to sync");
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
                log::warn!("Invalid or missing 'file' key");
                continue;
            }
        };

        // 2. Retrieving Content (String)
        let content_str = match file_obj.get("content").and_then(|v| v.as_str()) {
            Some(c) => c,
            None => {
                log::warn!("No content found for file: {}", file_path);
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
                    log::warn!("Failed to decode base64 for {}: {}", file_path, e);
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
            let _ = crate::diff::save_diff_with_log(&diff_db_path(), file_path, &diff_text);
        }

        // 5. Creating and Writing to Directories (I/O Processing)
        if let Some(parent) = full_path.parent() {
            if let Err(e) = fs::create_dir_all(parent).await {
                log::error!("Failed to create parent directory for {}: {}", file_path, e);
                continue;
            }
        }

        match fs::write(&full_path, &bytes).await {
            Ok(_) => {
                files_processed += 1;
                log::info!("Wrote file: {}", full_path.display());
            }
            Err(e) => log::error!("Failed to write file {}: {}", file_path, e),
        }
    }

    Ok(json!({
        "status": "success",
        "files_processed": files_processed
    }))
}

pub async fn handle_ensure_initial_index(
    app_handle: Option<tauri::AppHandle>,
) -> Result<EnsureInitialIndexResponse, String> {
    let (config_state, initial_index_manager) = {
        let state = crate::APP_STATE.lock().unwrap();
        (
            state.config_state.clone(),
            state.initial_index_manager.clone(),
        )
    };

    // Check current status
    let current_status = initial_index_manager.get_status();
    let document_count = initial_index_manager.get_document_count();

    match current_status {
        crate::initial_index::InitialIndexStatus::Complete => {
            return Ok(EnsureInitialIndexResponse {
                status: "already_valid".to_string(),
                valid: true,
                document_count,
            });
        }
        crate::initial_index::InitialIndexStatus::InProgress => {
            return Ok(EnsureInitialIndexResponse {
                status: "in_progress".to_string(),
                valid: false,
                document_count,
            });
        }
        crate::initial_index::InitialIndexStatus::Failed => {
            // Allow retry on failure
            initial_index_manager.reset();
        }
        crate::initial_index::InitialIndexStatus::Idle => {
            // Continue to start indexing
        }
    }

    // Start indexing. The atomic state transition prevents concurrent jobs.
    if !initial_index_manager.try_start_indexing() {
        return Ok(EnsureInitialIndexResponse {
            status: "in_progress".to_string(),
            valid: false,
            document_count,
        });
    }

    // Emit started event if we have an app handle
    if let Some(ref app) = app_handle {
        initial_index_manager.emit_status_event(
            app,
            InitialIndexStatusEvent {
                status: "started".to_string(),
                document_count: None,
                error: None,
            },
        );
    }

    // Spawn the indexing task
    let provider = config_state.rag.provider.clone();
    let model = config_state.rag.model.clone();
    let knowledge_path = config_state.knowledge.path.clone();
    let db_path = config_state.lancedb.path.clone();
    let manager = initial_index_manager.clone();
    let app_handle_clone = app_handle.clone();

    tokio::spawn(async move {
        match ensure_initial_index(&provider, &model, &knowledge_path, &db_path).await {
            Ok(result) => {
                if result.valid {
                    manager.complete_indexing(result.document_count);
                    #[cfg(debug_assertions)]
                    if manager.mark_watcher_started() {
                        if let Some(ref app) = app_handle_clone {
                            crate::agent::rag::spawn_knowledge_watcher(
                                app.clone(),
                                config_state.knowledge.path.clone().into(),
                                config_state.clone(),
                            );
                        }
                    }
                    if let Some(ref app) = app_handle_clone {
                        manager.emit_status_event(
                            app,
                            InitialIndexStatusEvent {
                                status: "completed".to_string(),
                                document_count: Some(result.document_count),
                                error: None,
                            },
                        );
                    }
                } else {
                    let error_msg = result
                        .error
                        .unwrap_or_else(|| "Unknown validation error".to_string());
                    manager.fail_indexing(error_msg.clone());
                    if let Some(ref app) = app_handle_clone {
                        manager.emit_status_event(
                            app,
                            InitialIndexStatusEvent {
                                status: "failed".to_string(),
                                document_count: None,
                                error: Some(error_msg),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                manager.fail_indexing(error_msg.clone());
                if let Some(ref app) = app_handle_clone {
                    manager.emit_status_event(
                        app,
                        InitialIndexStatusEvent {
                            status: "failed".to_string(),
                            document_count: None,
                            error: Some(error_msg),
                        },
                    );
                }
            }
        }
    });

    Ok(EnsureInitialIndexResponse {
        status: "started".to_string(),
        valid: false,
        document_count: 0,
    })
}
