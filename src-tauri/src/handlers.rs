use crate::diff::save_diff_with_log;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;

use crate::agent::rag::ensure_initial_index;
use crate::initial_index::{EnsureInitialIndexResponse, InitialIndexStatusEvent};

// Define structs that correspond to TypeScript types for the front end
// see injected.d.ts
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileItem {
    pub file: String,
    pub content: String,
    pub is_binary_base64: bool,
}

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

pub async fn handle_write_file(title: String, file: ProjectFileItem) -> Result<bool, String> {
    let project_dir = get_project_path(&title).await?;
    let db_path = diff_db_path();
    write_project_file(&project_dir, file, &db_path, true).await
}

pub async fn handle_delete_file(path: String) -> Result<bool, String> {
    let full_path = resolve_path(&path)?;
    fs::remove_file(full_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub async fn handle_log_message(level: String, message: String) -> Result<(), String> {
    let message = if message.len() >= 2 && message.starts_with('"') && message.ends_with('"') {
        message[1..message.len() - 1].to_string()
    } else {
        message
    };
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
    files: Vec<ProjectFileItem>,
) -> Result<serde_json::Value, String> {
    let project_dir = get_project_path(&title).await?;
    let db_path = diff_db_path();
    sync_project_files(&project_dir, files, &db_path).await
}

async fn sync_project_files(
    project_dir: &Path,
    files: Vec<ProjectFileItem>,
    db_path: &Path,
) -> Result<serde_json::Value, String> {
    let mut files_processed = 0;
    let mut files_skipped = 0;
    let mut errors = Vec::new();

    for file in files {
        let file_path = file.file.clone();

        match write_project_file(project_dir, file, db_path, false).await {
            Ok(true) => files_processed += 1,
            Ok(false) => {
                files_skipped += 1;
                log::info!("Skipped existing file: {}", file_path);
            }
            Err(error) => {
                log::warn!("Failed to write {}: {}", file_path, error);
                errors.push(json!({
                    "path": file_path,
                    "error": error
                }));
            }
        }
    }

    Ok(json!({
        "success": errors.is_empty(),
        "errors": errors,
        "files_processed": files_processed,
        "files_skipped": files_skipped
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
            // A completed index is only valid against the current embedding identity.
            let provider = config_state.rag.provider.clone();
            let model = config_state.rag.model.clone();
            let db_path = config_state.lancedb.path.clone();
            let expected_dims = match crate::agent::rag::resolve_embedding_dimensions(
                &provider,
                &model,
                &crate::agent::rag::create_llm_client(&provider).map_err(|e| e.to_string())?,
            )
            .await
            {
                Ok(dims) => dims,
                Err(_) => {
                    initial_index_manager.reset();
                    return Ok(EnsureInitialIndexResponse {
                        status: "started".to_string(),
                        valid: false,
                        document_count,
                    });
                }
            };
            let validation = match crate::agent::rag::validate_my_documents_table(
                &db_path,
                expected_dims,
                &provider,
                &model,
            )
            .await
            {
                Ok(result) => result,
                Err(_) => {
                    initial_index_manager.reset();
                    return Ok(EnsureInitialIndexResponse {
                        status: "started".to_string(),
                        valid: false,
                        document_count,
                    });
                }
            };
            if validation.valid {
                return Ok(EnsureInitialIndexResponse {
                    status: "already_valid".to_string(),
                    valid: true,
                    document_count,
                });
            }
            initial_index_manager.reset();
            if !initial_index_manager.try_start_indexing() {
                return Ok(EnsureInitialIndexResponse {
                    status: "in_progress".to_string(),
                    valid: false,
                    document_count,
                });
            }
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

async fn write_project_file(
    project_dir: &Path,
    file: ProjectFileItem,
    db_path: &Path,
    overwrite: bool,
) -> Result<bool, String> {
    let file_path = Path::new(&file.file);
    ensure_safe_relative_path(file_path, "file")?;

    let bytes = if file.is_binary_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(&file.content)
            .map_err(|error| {
                format!(
                    "Failed to decode Base64 content for {}: {}",
                    file.file, error
                )
            })?
    } else {
        file.content.as_bytes().to_vec()
    };

    let full_path = build_project_file_path(project_dir, file_path)?;
    ensure_path_within_project(project_dir, &full_path).await?;

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).await.map_err(|error| {
            format!("Failed to create directory {}: {}", parent.display(), error)
        })?;
    }

    // Re-check after creating missing parents because a parent may have been
    // replaced by a symlink between the first check and directory creation.
    ensure_path_within_project(project_dir, &full_path).await?;

    if !overwrite {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        let mut output = match options.open(&full_path).await {
            Ok(output) => output,
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                log::info!("Skipped existing file: {}", file.file);
                return Ok(false);
            }
            Err(error) => {
                return Err(format!("Failed to create file {}: {}", file.file, error));
            }
        };

        output
            .write_all(&bytes)
            .await
            .map_err(|error| format!("Failed to write file {}: {}", file.file, error))?;
        output
            .shutdown()
            .await
            .map_err(|error| format!("Failed to finalize file {}: {}", file.file, error))?;

        if !file.is_binary_base64 && contains_ms_extension(file_path) {
            let new_content = String::from_utf8_lossy(&bytes);
            if let Some(diff_text) = crate::diff::compute_diff("", new_content.as_ref()) {
                if let Err(error) = save_diff_with_log(db_path, &file.file, &diff_text) {
                    log::warn!("Failed to save diff for {}: {}", file.file, error);
                }
            }
        }

        log::info!("Created file: {}", file.file);
        return Ok(true);
    }

    if !file.is_binary_base64 && contains_ms_extension(file_path) {
        match fs::read_to_string(&full_path).await {
            Ok(old_content) => {
                let new_content = String::from_utf8_lossy(&bytes);
                if let Some(diff_text) =
                    crate::diff::compute_diff(&old_content, new_content.as_ref())
                {
                    if let Err(error) = save_diff_with_log(db_path, &file.file, &diff_text) {
                        log::warn!("Failed to save diff for {}: {}", file.file, error);
                    }
                }
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Failed to read existing file {}: {}",
                    file.file, error
                ));
            }
        }
    }

    fs::write(&full_path, &bytes)
        .await
        .map_err(|error| format!("Failed to write file {}: {}", file.file, error))?;

    log::info!("Wrote file: {}", file.file);
    Ok(true)
}

fn build_project_file_path(project_dir: &Path, file_path: &Path) -> Result<PathBuf, String> {
    let mut full_path = project_dir.to_path_buf();
    for component in file_path.components() {
        if let Component::Normal(name) = component {
            full_path.push(name);
        }
    }
    Ok(full_path)
}

async fn ensure_path_within_project(project_dir: &Path, full_path: &Path) -> Result<(), String> {
    let canonical_project_dir = fs::canonicalize(project_dir).await.map_err(|error| {
        format!(
            "Failed to resolve project directory {}: {}",
            project_dir.display(),
            error
        )
    })?;

    let anchor = nearest_existing_ancestor(full_path)?;
    ensure_no_symlink_components(project_dir, &anchor).await?;

    let canonical_anchor = fs::canonicalize(&anchor)
        .await
        .map_err(|error| format!("Failed to resolve path {}: {}", anchor.display(), error))?;

    if !canonical_anchor.starts_with(&canonical_project_dir) {
        return Err(format!(
            "Path escapes project directory: {}",
            full_path.display()
        ));
    }

    Ok(())
}

fn nearest_existing_ancestor(path: &Path) -> Result<PathBuf, String> {
    let mut ancestor = path;
    loop {
        if ancestor.exists() {
            return Ok(ancestor.to_path_buf());
        }
        ancestor = ancestor
            .parent()
            .ok_or_else(|| format!("Failed to resolve parent for {}", path.display()))?;
    }
}

async fn ensure_no_symlink_components(project_dir: &Path, path: &Path) -> Result<(), String> {
    let relative_path = path
        .strip_prefix(project_dir)
        .map_err(|_| format!("Path is outside project directory: {}", path.display()))?;

    let mut current = project_dir.to_path_buf();
    for component in relative_path.components() {
        let Component::Normal(name) = component else {
            return Err(format!("Invalid project path: {}", path.display()));
        };
        current.push(name);

        match fs::symlink_metadata(&current).await {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(format!(
                    "Symbolic links are not allowed in project paths: {}",
                    current.display()
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => break,
            Err(error) => {
                return Err(format!(
                    "Failed to inspect path {}: {}",
                    current.display(),
                    error
                ));
            }
        }
    }

    Ok(())
}

fn ensure_safe_relative_path(path: &Path, description: &str) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err(format!("Invalid or missing '{}'", description));
    }

    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(format!("Invalid {} path: {}", description, path.display())),
        }
    }

    Ok(())
}

fn contains_ms_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ms"))
}

async fn get_project_path(title: &str) -> Result<PathBuf, String> {
    ensure_safe_relative_path(Path::new(title), "project title")?;

    let project_path = {
        let state = crate::APP_STATE.lock().unwrap();
        state.config_state.projects.path.clone()
    };

    if project_path.is_empty() {
        return Err("Projects path is not configured".to_string());
    }

    let project_dir = PathBuf::from(project_path).join(Path::new(title));
    log::info!("Sync destination: {}", project_dir.display());

    fs::create_dir_all(&project_dir).await.map_err(|error| {
        format!(
            "Failed to create save directory {}: {}",
            project_dir.display(),
            error
        )
    })?;

    Ok(project_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::get_all_diffs;
    use serde_json::Value;
    use tempfile::TempDir;

    fn project_file(file: &str, content: &str, is_binary_base64: bool) -> ProjectFileItem {
        ProjectFileItem {
            file: file.to_string(),
            content: content.to_string(),
            is_binary_base64,
        }
    }

    #[tokio::test]
    async fn writes_nested_text_and_persists_diff_on_overwrite() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let project_dir = temp_dir.path().join("project");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create project dir");
        let db_path = temp_dir.path().join("diffs.db");
        let file_path = "src/main.ms";
        let output_path = project_dir.join("src/main.ms");

        let first_write = write_project_file(
            &project_dir,
            project_file(file_path, "first", false),
            &db_path,
            true,
        )
        .await;
        assert_eq!(first_write, Ok(true));
        assert_eq!(
            fs::read_to_string(&output_path)
                .await
                .expect("first output"),
            "first"
        );

        let second_write = write_project_file(
            &project_dir,
            project_file(file_path, "second", false),
            &db_path,
            true,
        )
        .await;
        assert_eq!(second_write, Ok(true));
        assert_eq!(
            fs::read_to_string(&output_path)
                .await
                .expect("second output"),
            "second"
        );

        let expected_diff = crate::diff::compute_diff("first", "second").expect("expected a diff");
        assert_eq!(
            get_all_diffs(&db_path).expect("stored diffs"),
            vec![(file_path.to_string(), expected_diff)]
        );
    }

    #[tokio::test]
    async fn decodes_and_writes_binary_base64_content() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let project_dir = temp_dir.path().join("project");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create project dir");
        let db_path = temp_dir.path().join("diffs.db");

        let result = write_project_file(
            &project_dir,
            project_file("assets/item.bin", "AAEC/w==", true),
            &db_path,
            true,
        )
        .await;

        assert_eq!(result, Ok(true));
        assert_eq!(
            fs::read(project_dir.join("assets/item.bin"))
                .await
                .expect("binary output"),
            vec![0, 1, 2, 0xff]
        );
    }

    #[tokio::test]
    async fn rejects_invalid_base64_before_creating_file() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let project_dir = temp_dir.path().join("project");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create project dir");
        let db_path = temp_dir.path().join("diffs.db");
        let file_path = "assets/broken.bin";

        let result = write_project_file(
            &project_dir,
            project_file(file_path, "not base64!", true),
            &db_path,
            true,
        )
        .await;

        assert!(result.unwrap_err().contains("Failed to decode Base64"));
        assert!(!project_dir.join(file_path).exists());
    }

    #[test]
    fn rejects_absolute_parent_and_traversal_paths() {
        for path in [
            Path::new("/tmp/escape.txt"),
            Path::new("../escape.txt"),
            Path::new("safe/../../escape.txt"),
        ] {
            assert!(
                ensure_safe_relative_path(path, "file").is_err(),
                "accepted unsafe path: {}",
                path.display()
            );
        }
    }

    #[tokio::test]
    async fn bulk_sync_skips_duplicates_but_individual_write_overwrites() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let project_dir = temp_dir.path().join("project");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create project dir");
        let db_path = temp_dir.path().join("diffs.db");
        let file_path = "src/main.ms";
        let output_path = project_dir.join("src/main.ms");
        let files = vec![
            project_file(file_path, "first", false),
            project_file(file_path, "duplicate", false),
        ];

        let response = sync_project_files(&project_dir, files, &db_path)
            .await
            .expect("bulk sync failed");
        assert_eq!(response.get("success").and_then(Value::as_bool), Some(true));
        assert_eq!(
            response.get("files_processed").and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            response.get("files_skipped").and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            fs::read_to_string(&output_path).await.expect("bulk output"),
            "first"
        );

        let overwrite = write_project_file(
            &project_dir,
            project_file(file_path, "second", false),
            &db_path,
            true,
        )
        .await;
        assert_eq!(overwrite, Ok(true));
        assert_eq!(
            fs::read_to_string(&output_path)
                .await
                .expect("overwritten output"),
            "second"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_symlink_component_that_escapes_project() {
        use std::os::unix::fs::symlink;

        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let project_dir = temp_dir.path().join("project");
        let outside_dir = temp_dir.path().join("outside");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create project dir");
        fs::create_dir_all(&outside_dir)
            .await
            .expect("failed to create outside dir");
        symlink(&outside_dir, project_dir.join("link")).expect("failed to create symlink");
        let db_path = temp_dir.path().join("diffs.db");

        let result = write_project_file(
            &project_dir,
            project_file("link/escape.txt", "escaped", false),
            &db_path,
            true,
        )
        .await;

        assert!(result
            .unwrap_err()
            .contains("Symbolic links are not allowed"));
        assert!(!outside_dir.join("escape.txt").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn allows_configured_project_root_symlink_and_resolves_canonical_target() {
        use std::os::unix::fs::symlink;

        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let target_root = temp_dir.path().join("target-root");
        let project_dir = target_root.join("project");
        fs::create_dir_all(&project_dir)
            .await
            .expect("failed to create target project dir");
        let linked_root = temp_dir.path().join("linked-root");
        symlink(&target_root, &linked_root).expect("failed to create root symlink");
        let linked_project_dir = linked_root.join("project");
        let db_path = temp_dir.path().join("diffs.db");

        ensure_path_within_project(
            &linked_project_dir,
            &linked_project_dir.join("nested/file.txt"),
        )
        .await
        .expect("configured root symlink should be allowed");

        let result = write_project_file(
            &linked_project_dir,
            project_file("nested/file.txt", "safe", false),
            &db_path,
            true,
        )
        .await;
        assert_eq!(result, Ok(true));
        assert_eq!(
            fs::read_to_string(project_dir.join("nested/file.txt"))
                .await
                .expect("canonical target output"),
            "safe"
        );
    }
}
