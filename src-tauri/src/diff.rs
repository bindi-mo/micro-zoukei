use std::path::PathBuf;

use crate::config::LogLevel;

pub fn init_db(db_path: &PathBuf) -> Result<(), String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS diffs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path  TEXT    NOT NULL,
            diff_text  TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_diffs_file_path ON diffs(file_path);",
    )
    .map_err(|e| format!("Failed to init diffs table: {}", e))?;
    Ok(())
}

pub fn save_diff(db_path: &PathBuf, file_path: &str, diff_text: &str) -> Result<i64, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    conn.execute(
        "INSERT INTO diffs (file_path, diff_text) VALUES (?, ?)",
        rusqlite::params![file_path, diff_text],
    )
    .map_err(|e| format!("Failed to save diff: {}", e))?;
    Ok(conn.last_insert_rowid())
}

pub fn save_diff_with_log(
    db_path: &PathBuf,
    file_path: &str,
    diff_text: &str,
) -> Result<i64, String> {
    let result = save_diff(db_path, file_path, diff_text);
    if let Err(error) = &result {
        crate::log!(
            LogLevel::Error,
            "Failed to save diff for {}: {}",
            file_path,
            error
        );
    }
    result
}

pub fn get_all_diffs(db_path: &PathBuf) -> Result<Vec<(String, String)>, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT file_path, diff_text FROM diffs ORDER BY created_at ASC, id ASC")
        .map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params![], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| format!("Failed to query: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect: {}", e))
}

pub fn get_diffs_for_file(db_path: &PathBuf, file_path: &str) -> Result<Vec<String>, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT diff_text FROM diffs WHERE file_path = ? ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| format!("Failed to prepare: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params![file_path], |r| r.get(0))
        .map_err(|e| format!("Failed to query: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect: {}", e))
}

pub fn delete_diffs_for_file(db_path: &PathBuf, file_path: &str) -> Result<usize, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    conn.execute(
        "DELETE FROM diffs WHERE file_path = ?",
        rusqlite::params![file_path],
    )
    .map_err(|e| format!("Failed to delete: {}", e))
}

pub fn delete_all_diffs(db_path: &PathBuf) -> Result<usize, String> {
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open diff DB: {}", e))?;
    conn.execute("DELETE FROM diffs", rusqlite::params![])
        .map_err(|e| format!("Failed to delete all: {}", e))
}

pub fn compute_diff(old: &str, new: &str) -> String {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();
    let mut result = String::from("--- old\n+++ new\n");
    let max_lines = old_lines.len().max(new_lines.len());
    if max_lines == 0 {
        return result;
    }
    result.push_str("@@ -1 +1 @@\n");
    for i in 0..max_lines {
        let ol = old_lines.get(i).copied().unwrap_or("");
        let nl = new_lines.get(i).copied().unwrap_or("");
        if ol == nl {
            result.push_str(&format!(" {}\n", ol));
        } else {
            if i < old_lines.len() {
                result.push_str(&format!("-{}\n", ol));
            }
            if i < new_lines.len() {
                result.push_str(&format!("+{}\n", nl));
            }
        }
    }
    result
}
