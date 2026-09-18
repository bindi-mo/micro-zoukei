use crate::handlers::{map_error, CommandPayload, CommandResponse};
use crate::initial_index::EnsureInitialIndexResponse;
use serde_json::Value;

use crate::LogLevel;

pub async fn mzd_list_files(path: String) -> Result<serde_json::Value, String> {
    crate::handlers::handle_list_files(path).await
}

#[tauri::command]
pub async fn mzd_read_file(path: String) -> Result<String, String> {
    crate::handlers::handle_read_file(path).await
}

#[tauri::command]
pub async fn mzd_write_file(path: String, content: String) -> Result<bool, String> {
    crate::handlers::handle_write_file(path, content).await
}

#[tauri::command]
pub async fn mzd_delete_file(path: String) -> Result<bool, String> {
    crate::handlers::handle_delete_file(path).await
}

#[tauri::command]
pub async fn mzd_sync_files(
    title: String,
    filelist: Vec<Value>,
) -> Result<serde_json::Value, String> {
    crate::handlers::handle_sync_files(title, filelist).await
}

#[tauri::command]
pub async fn mzd_log_message(level: String, message: String) -> Result<(), String> {
    crate::handlers::handle_log_message(level, message).await
}

#[tauri::command]
pub async fn mzd_health() -> Result<serde_json::Value, String> {
    crate::handlers::handle_health().await
}

#[tauri::command]
pub async fn mzd_run_agent(prompt: String) -> Result<String, String> {
    crate::handlers::handle_run_agent(prompt).await
}

#[tauri::command]
pub async fn mzd_ensure_initial_index() -> Result<EnsureInitialIndexResponse, String> {
    // This command requires proxy context; callers should use the proxy-wrapped variant
    Err("mzd_ensure_initial_index requires proxy context with an AppHandle".to_string())
}

// Dispatcher function - handles incoming HTTP requests from the frontend (without AppHandle)
pub async fn dispatch_command(payload: CommandPayload) -> CommandResponse {
    dispatch_command_with_handle(payload, None).await
}

// Dispatcher function with optional AppHandle for event emission
pub async fn dispatch_command_with_handle(
    payload: CommandPayload,
    app_handle: Option<tauri::AppHandle>,
) -> CommandResponse {
    let request_id = uuid::Uuid::new_v4().to_string();
    crate::log!(
        LogLevel::Debug,
        "Request ID: {}, Command: {}",
        request_id,
        payload.command
    );

    match payload.command.as_str() {
        "mzd_list_files" => map_error(
            crate::handlers::handle_list_files(
                payload
                    .args
                    .get("path")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
            )
            .await,
        ),
        "mzd_read_file" => map_error(
            crate::handlers::handle_read_file(
                payload
                    .args
                    .get("path")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
            )
            .await,
        ),
        "mzd_write_file" => map_error(
            crate::handlers::handle_write_file(
                payload
                    .args
                    .get("path")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
                payload
                    .args
                    .get("content")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
            )
            .await,
        ),
        "mzd_delete_file" => map_error(
            crate::handlers::handle_delete_file(
                payload
                    .args
                    .get("path")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
            )
            .await,
        ),
        "mzd_sync_files" => map_error(
            crate::handlers::handle_sync_files(
                payload
                    .args
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                match payload.args.get("files") {
                    Some(val) => val.as_array().cloned().unwrap_or_else(Vec::new),
                    None => Vec::new(),
                },
            )
            .await,
        ),
        "mzd_log_message" => {
            let level = payload
                .args
                .get("level")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();
            let message = payload
                .args
                .get("message")
                .cloned()
                .unwrap_or_default()
                .to_string();

            match level.as_str() {
                "trace" | "debug" | "info" | "warn" | "error" | "critical" => {
                    map_error(crate::handlers::handle_log_message(level, message).await)
                }
                _ => CommandResponse::error(format!("Invalid log level: {}", level)),
            }
        }
        "mzd_health" => map_error(crate::handlers::handle_health().await),
        "mzd_run_agent" => map_error(
            crate::handlers::handle_run_agent(
                payload
                    .args
                    .get("prompt")
                    .cloned()
                    .unwrap_or_default()
                    .to_string(),
            )
            .await,
        ),
        "mzd_ensure_initial_index" => {
            map_error(crate::handlers::handle_ensure_initial_index(app_handle).await)
        }
        _ => CommandResponse::error(format!("Unknown command: {}", payload.command)),
    }
}

// Optional entry point for existing Tauri IPC calls (kept for backward compatibility)
#[tauri::command]
pub async fn tauri_entrypoint(command: String, payload: Value) -> Result<Value, String> {
    let response = dispatch_command(CommandPayload {
        command,
        args: payload,
    })
    .await;
    if response.success {
        Ok(response.data)
    } else {
        Err(response.error.unwrap_or_else(|| "Unknown error".into()))
    }
}

// Correlation ID header for request tracing
pub fn get_correlation_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
