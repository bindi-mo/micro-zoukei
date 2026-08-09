use std::path::PathBuf;
use tokio::fs;
use serde_json::json;

// Helper to resolve paths
fn resolve_path(path: &str) -> Result<PathBuf, String> {
    let mut full_path = PathBuf::from("_data");
    if path.starts_with('/') {
        full_path.push(&path[1..]);
    } else {
        full_path.push(path);
    }

    if !full_path.is_absolute() {
        let mut root = std::env::current_dir().map_err(|e| e.to_string())?;
        root.push(full_path);
        full_path = root;
    }
    Ok(full_path)
}

#[tauri::command]
pub async fn mzd_list_files(_group_id: String, path: String) -> Result<serde_json::Value, String> {
    let full_path = resolve_path(&path)?;
    let mut files = Vec::new();
    
    let mut entries = fs::read_dir(full_path).await.map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let e = entry;
        let p = e.path();
        files.push(json!({
            "path": p.to_string_lossy().into_owned(),
            "contentType": mime_guess::from_path(&p).first_raw().map(|s| s.to_string()).unwrap_or_default()
        }));
    }
    Ok(json!({ "files": files }))
}

#[tauri::command]
pub async fn mzd_read_file(_group_id: String, path: String) -> Result<String, String> {
    let full_path = resolve_path(&path)?;
    fs::read_to_string(full_path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mzd_write_file(_group_id: String, path: String, content: String) -> Result<bool, String> {
    let full_path = resolve_path(&path)?;
    fs::write(full_path, content).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn mzd_delete_file(_group_id: String, path: String) -> Result<bool, String> {
    let full_path = resolve_path(&path)?;
    fs::remove_file(full_path).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn mzd_sync_project(project_id: String) -> Result<serde_json::Value, String> {
    let project_path = match project_id.as_str() {
        "proj1" => "_data/project1",
        "proj2" => "_data/project2",
        _ => "_data/default",
    };

    if !std::path::Path::new(project_path).exists() {
        fs::create_dir_all(project_path).await.map_err(|e| e.to_string())?;
    }

    let list_res = mzd_list_files(project_id.clone(), project_path.to_string()).await?;
    let files = list_res["files"].as_array().cloned().unwrap_or_default();

    println!("[sync] Starting sync for project: {}", project_id);
    mzd_sync_files(project_id.clone(), project_path.to_string()).await?;

    Ok(json!({
        "status": "success",
        "project_id": project_id,
        "files_synced": files.len()
    }))
}

#[tauri::command]
pub async fn mzd_sync_files(project_id: String, path: String) -> Result<serde_json::Value, String> {
    let list = mzd_list_files(project_id.clone(), path.clone()).await?;
    let files = list["files"].as_array().cloned().unwrap_or_default();

    for file_obj in &files {
        if let Some(f) = file_obj.get("path").and_then(|v| v.as_str()) {
            match mzd_read_file(project_id.clone(), f.to_string()).await {
                Ok(content) => {
                    let _ = mzd_write_file(project_id.clone(), f.to_string(), content).await;
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
