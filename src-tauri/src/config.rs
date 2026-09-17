use noyalib;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RagConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: Option<String>,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ChatConfig {
    pub provider: String,
    pub model: String,
    pub api_key_env: Option<String>,
    pub endpoint: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProjectsConfig {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LanceConfig {
    pub path: String,
}

fn default_knowledge_path() -> String {
    "$HOME/.micro-zoukei/knowledge_base".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct KnowledgeConfig {
    #[serde(default = "default_knowledge_path")]
    pub path: String,
}

fn default_knowledge_config() -> KnowledgeConfig {
    KnowledgeConfig {
        path: default_knowledge_path(),
    }
}

fn expand_home_path(path: &str, home_dir: Option<&Path>) -> Result<PathBuf, String> {
    let Some(suffix) = path
        .strip_prefix("$HOME")
        .or_else(|| path.strip_prefix("${HOME}"))
    else {
        return Ok(PathBuf::from(path));
    };

    if !suffix.is_empty() && !suffix.starts_with('/') {
        return Ok(PathBuf::from(path));
    }

    let home_dir = home_dir
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "HOME environment variable is not set".to_string())?;

    Ok(match suffix {
        "" => home_dir.to_path_buf(),
        _ => home_dir.join(suffix.trim_start_matches('/')),
    })
}

fn normalize_config_paths_with_home(
    mut config: ConfigState,
    home_dir: Option<&Path>,
) -> Result<ConfigState, String> {
    config.projects.path = expand_home_path(&config.projects.path, home_dir)?
        .to_string_lossy()
        .into_owned();
    config.lancedb.path = expand_home_path(&config.lancedb.path, home_dir)?
        .to_string_lossy()
        .into_owned();
    config.knowledge.path = expand_home_path(&config.knowledge.path, home_dir)?
        .to_string_lossy()
        .into_owned();

    Ok(config)
}

fn normalize_config_paths(config: ConfigState) -> Result<ConfigState, String> {
    let home_dir = std::env::var_os("HOME");
    normalize_config_paths_with_home(config, home_dir.as_deref().map(Path::new))
}

/// Configuration shared via `Arc<ConfigState>` across Tauri commands and
/// background threads (e.g. the knowledge watcher).
///
/// The config is loaded once at application startup and treated as
/// immutable thereafter, so no locking is required.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ConfigState {
    pub rag: RagConfig,
    pub chat: ChatConfig,
    pub projects: ProjectsConfig,
    pub lancedb: LanceConfig,
    #[serde(default = "default_knowledge_config")]
    pub knowledge: KnowledgeConfig,
}

impl ConfigState {
    /// Load a `ConfigState` from the given workspace directory.
    pub fn load(path: PathBuf) -> Result<Self, String> {
        load_config(path)
    }
}

/// Load the application configuration from `config.yml` or `config.yaml`.
///
/// Tries `config.yml` first, then falls back to `config.yaml` for backward
/// compatibility. Returns `Err` if the file cannot be read or parsed.
pub fn load_config(path: PathBuf) -> Result<ConfigState, String> {
    load_config_with_path(path, None)
}

/// Load the application configuration from a specific config file path.
///
/// If `config_path` is provided, uses that path directly. Otherwise, tries
/// `config.yml` first, then falls back to `config.yaml` for backward compatibility.
/// Returns `Err` if the file cannot be read or parsed.
pub fn load_config_with_path(
    path: PathBuf,
    config_path: Option<PathBuf>,
) -> Result<ConfigState, String> {
    let actual_config_path = if let Some(p) = config_path {
        p
    } else {
        // Try config.yml first, then fall back to config.yaml for backward compatibility.
        if path.join("config.yml").exists() {
            path.join("config.yml")
        } else {
            path.join("config.yaml")
        }
    };

    let config_str = fs::read_to_string(&actual_config_path).map_err(|e| {
        format!(
            "Failed to read config at {}: {}",
            actual_config_path.display(),
            e
        )
    })?;

    let config: ConfigState =
        noyalib::from_str(&config_str).map_err(|e| format!("Failed to parse config: {}", e))?;
    normalize_config_paths(config)
}

// Ensure config.yml exists by copying from template.config.yml if needed
pub fn ensure_config_exists(
    workspace_path: PathBuf,
    template_path: PathBuf,
) -> Result<PathBuf, String> {
    let config_yml_path = workspace_path.join("config.yml");

    if !config_yml_path.exists() {
        if !template_path.exists() {
            return Err(format!(
                "Template config not found at: {}",
                template_path.display()
            ));
        }

        // Copy template to config.yml
        fs::copy(&template_path, &config_yml_path).map_err(|e| {
            format!(
                "Failed to copy template config to {}: {}",
                config_yml_path.display(),
                e
            )
        })?;

        println!(
            "Created config.yml from template at: {}",
            config_yml_path.display()
        );
    }

    Ok(config_yml_path)
}

/// Copy all regular files from `source` into `destination`, preserving their
/// relative directory structure. Existing destination files are overwritten,
/// while files that exist only in `destination` are retained.
pub fn copy_knowledge_files(source: &Path, destination: &Path) -> Result<usize, String> {
    if source.as_os_str().is_empty() {
        return Err("Knowledge source path is empty".to_string());
    }
    if destination.as_os_str().is_empty() {
        return Err("Knowledge destination path is empty".to_string());
    }
    if !source.exists() {
        return Err(format!(
            "Knowledge source does not exist: {}",
            source.display()
        ));
    }
    if !source.is_dir() {
        return Err(format!(
            "Knowledge source is not a directory: {}",
            source.display()
        ));
    }
    if destination.exists() && !destination.is_dir() {
        return Err(format!(
            "Knowledge destination is not a directory: {}",
            destination.display()
        ));
    }

    let source = fs::canonicalize(source)
        .map_err(|e| format!("Failed to resolve knowledge source: {}", e))?;
    let destination_parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(destination_parent).map_err(|e| {
        format!(
            "Failed to create knowledge destination parent {}: {}",
            destination_parent.display(),
            e
        )
    })?;

    let destination = if destination.exists() {
        fs::canonicalize(destination)
            .map_err(|e| format!("Failed to resolve knowledge destination: {}", e))?
    } else {
        let destination_name = destination.file_name().ok_or_else(|| {
            format!(
                "Knowledge destination has no file name: {}",
                destination.display()
            )
        })?;
        fs::canonicalize(destination_parent)
            .map_err(|e| format!("Failed to resolve knowledge destination parent: {}", e))?
            .join(destination_name)
    };

    if destination == source || destination.starts_with(&source) || source.starts_with(&destination)
    {
        return Err("Knowledge source and destination must not overlap".to_string());
    }

    let mut copied = 0;
    for entry in walkdir::WalkDir::new(&source).follow_links(false) {
        let entry = entry.map_err(|e| format!("Failed to read knowledge source: {}", e))?;
        if entry.file_type().is_symlink() || !entry.file_type().is_file() {
            continue;
        }

        let relative_path = entry.path().strip_prefix(&source).map_err(|e| {
            format!(
                "Failed to resolve relative path for {}: {}",
                entry.path().display(),
                e
            )
        })?;
        let target_path = destination.join(relative_path);
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create knowledge directory {}: {}",
                    parent.display(),
                    e
                )
            })?;
        }

        fs::copy(entry.path(), &target_path).map_err(|e| {
            format!(
                "Failed to copy knowledge file {} to {}: {}",
                relative_path.display(),
                target_path.display(),
                e
            )
        })?;
        copied += 1;
    }

    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> ConfigState {
        ConfigState::default()
    }

    #[test]
    fn expands_dollar_home_paths() {
        let home = Path::new("/home/test-user");
        let config = ConfigState {
            projects: ProjectsConfig {
                path: "$HOME/.micro-zoukei/projects".to_string(),
            },
            lancedb: LanceConfig {
                path: "${HOME}/.micro-zoukei/lancedb".to_string(),
            },
            ..test_config()
        };

        let config = normalize_config_paths_with_home(config, Some(home))
            .expect("home path expansion should succeed");

        assert_eq!(
            config.projects.path,
            "/home/test-user/.micro-zoukei/projects"
        );
        assert_eq!(config.lancedb.path, "/home/test-user/.micro-zoukei/lancedb");
    }

    #[test]
    fn leaves_non_home_paths_unchanged() {
        let home = Path::new("/home/test-user");
        let config = ConfigState {
            projects: ProjectsConfig {
                path: "/absolute/projects".to_string(),
            },
            lancedb: LanceConfig {
                path: "$HOMEfoo/lancedb".to_string(),
            },
            ..test_config()
        };

        let config = normalize_config_paths_with_home(config, Some(home))
            .expect("path normalization should succeed");

        assert_eq!(config.projects.path, "/absolute/projects");
        assert_eq!(config.lancedb.path, "$HOMEfoo/lancedb");
    }

    #[test]
    fn rejects_home_placeholder_without_home_directory() {
        let config = ConfigState {
            projects: ProjectsConfig {
                path: "$HOME/projects".to_string(),
            },
            ..test_config()
        };

        let error = normalize_config_paths_with_home(config, None)
            .expect_err("missing HOME should be rejected");

        assert_eq!(error, "HOME environment variable is not set");
    }

    #[test]
    fn normalizes_knowledge_home_paths() {
        let home = Path::new("/home/test-user");
        let config = ConfigState {
            knowledge: KnowledgeConfig {
                path: "$HOME/.micro-zoukei/knowledge_base".to_string(),
            },
            ..test_config()
        };

        let config = normalize_config_paths_with_home(config, Some(home))
            .expect("home path expansion should succeed");

        assert_eq!(
            config.knowledge.path,
            "/home/test-user/.micro-zoukei/knowledge_base"
        );
    }

    #[test]
    fn copies_knowledge_files_preserving_relative_paths() {
        let root = tempfile::TempDir::new().expect("failed to create temp dir");
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::create_dir_all(source.join("nested")).expect("failed to create source directory");
        fs::write(source.join("root.md"), "root").expect("failed to write root file");
        fs::write(source.join("nested/child.md"), "child").expect("failed to write child file");
        fs::create_dir_all(destination.join("nested"))
            .expect("failed to create destination directory");
        fs::write(destination.join("nested/child.md"), "old").expect("failed to write child file");
        fs::write(destination.join("keep.txt"), "keep").expect("failed to write extra file");

        let copied =
            copy_knowledge_files(&source, &destination).expect("knowledge copy should succeed");

        assert_eq!(copied, 2);
        assert_eq!(
            fs::read_to_string(destination.join("root.md")).unwrap(),
            "root"
        );
        assert_eq!(
            fs::read_to_string(destination.join("nested/child.md")).unwrap(),
            "child"
        );
        assert_eq!(
            fs::read_to_string(destination.join("keep.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn rejects_knowledge_destination_inside_source() {
        let root = tempfile::TempDir::new().expect("failed to create temp dir");
        let source = root.path().join("source");
        let destination = source.join("destination");
        fs::create_dir_all(&source).expect("failed to create source directory");

        let error = copy_knowledge_files(&source, &destination)
            .expect_err("destination inside source should be rejected");

        assert!(error.contains("must not overlap"));
    }

    #[test]
    fn rejects_knowledge_source_inside_destination() {
        let root = tempfile::TempDir::new().expect("failed to create temp dir");
        let destination = root.path().join("destination");
        let source = destination.join("source");
        fs::create_dir_all(&source).expect("failed to create source directory");

        let error = copy_knowledge_files(&source, &destination)
            .expect_err("source inside destination should be rejected");

        assert!(error.contains("must not overlap"));
    }

    #[test]
    fn rejects_empty_or_missing_knowledge_paths() {
        let root = tempfile::TempDir::new().expect("failed to create temp dir");
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::create_dir_all(&source).expect("failed to create source directory");

        assert!(copy_knowledge_files(&source, Path::new("")).is_err());
        assert!(copy_knowledge_files(&destination, &source).is_err());
    }
}
