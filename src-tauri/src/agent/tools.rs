use rig::tool::PortableTool;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::fs;

/// Custom error type for tool execution errors.
#[derive(Debug)]
pub struct ToolError(pub String);

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ToolError {}

impl From<walkdir::Error> for ToolError {
    fn from(err: walkdir::Error) -> Self {
        ToolError(err.to_string())
    }
}

/// Resolve a path relative to the workspace/data directory.
fn resolve_workspace_path(path: &str) -> Result<PathBuf, ToolError> {
    crate::handlers::resolve_path(path).map_err(ToolError)
}

// ── ReadFileTool ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
}

pub struct ReadFileTool;

impl PortableTool for ReadFileTool {
    const NAME: &'static str = "read_file";
    type Args = ReadFileArgs;
    type Output = String;
    type Error = ToolError;

    fn description(&self) -> String {
        "Read the contents of a file at the given path".to_string()
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to read"
                }
            },
            "required": ["path"]
        })
    }

    async fn call(&self, args: ReadFileArgs) -> Result<String, ToolError> {
        let full_path = resolve_workspace_path(&args.path)?;
        fs::read_to_string(&full_path)
            .await
            .map_err(|e| ToolError(format!("Failed to read file {}: {}", args.path, e)))
    }
}

// ── WriteFileTool ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub content: String,
}

pub struct WriteFileTool;

impl PortableTool for WriteFileTool {
    const NAME: &'static str = "write_file";
    type Args = WriteFileArgs;
    type Output = String;
    type Error = ToolError;

    fn description(&self) -> String {
        "Write content to a file at the given path, creating parent directories as needed"
            .to_string()
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the file to write"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file"
                }
            },
            "required": ["path", "content"]
        })
    }

    async fn call(&self, args: WriteFileArgs) -> Result<String, ToolError> {
        let full_path = resolve_workspace_path(&args.path)?;
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| ToolError(format!("Failed to create directory: {}", e)))?;
        }
        fs::write(&full_path, &args.content)
            .await
            .map_err(|e| ToolError(format!("Failed to write file {}: {}", args.path, e)))?;
        Ok(format!(
            "Successfully wrote {} bytes to {}",
            args.content.len(),
            args.path
        ))
    }
}

// ── ViewFileStructureTool ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ViewFileStructureArgs {
    pub path: Option<String>,
}

pub struct ViewFileStructureTool;

impl PortableTool for ViewFileStructureTool {
    const NAME: &'static str = "view_file_structure";
    type Args = ViewFileStructureArgs;
    type Output = String;
    type Error = ToolError;

    fn description(&self) -> String {
        "View the directory structure of the project, showing files and subdirectories".to_string()
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The path to the directory to view (optional, defaults to workspace root)"
                }
            }
        })
    }

    async fn call(&self, args: ViewFileStructureArgs) -> Result<String, ToolError> {
        let base_path = match &args.path {
            Some(p) => resolve_workspace_path(p)?,
            None => resolve_workspace_path("")?,
        };

        let base_path_clone = base_path.clone();
        let tree = tokio::task::spawn_blocking(move || {
            let mut lines = vec!["Directory structure:".to_string()];
            for entry in walkdir::WalkDir::new(&base_path_clone) {
                let entry = entry?;
                let depth = entry.depth();
                let name = entry.file_name().to_string_lossy().to_string();
                let indent = "  ".repeat(depth);
                if entry.file_type().is_dir() {
                    lines.push(format!("{}{}/", indent, name));
                } else {
                    lines.push(format!("{}{}", indent, name));
                }
            }
            Ok::<String, ToolError>(lines.join("\n"))
        })
        .await
        .map_err(|e| ToolError(format!("Task panicked: {}", e)))??;

        Ok(tree)
    }
}
