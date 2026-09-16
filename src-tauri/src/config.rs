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
}
