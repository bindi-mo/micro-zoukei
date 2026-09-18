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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct KnowledgeConfig {
    #[serde(default)]
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
    workspace_path: &Path,
    home_dir: Option<&Path>,
) -> Result<ConfigState, String> {
    config.projects.path = expand_home_path(&config.projects.path, home_dir)?
        .to_string_lossy()
        .into_owned();
    config.lancedb.path = expand_home_path(&config.lancedb.path, home_dir)?
        .to_string_lossy()
        .into_owned();

    if config.knowledge.path.is_empty() {
        config.knowledge.path = workspace_path
            .join("knowledge_base")
            .to_string_lossy()
            .into_owned();
    }

    config.knowledge.path = expand_home_path(&config.knowledge.path, home_dir)?
        .to_string_lossy()
        .into_owned();

    Ok(config)
}

fn normalize_config_paths(
    config: ConfigState,
    workspace_path: &Path,
) -> Result<ConfigState, String> {
    let home_dir = std::env::var_os("HOME");
    normalize_config_paths_with_home(config, workspace_path, home_dir.as_deref().map(Path::new))
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Off,
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

impl From<LogLevel> for log::LevelFilter {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Off => Self::Off,
            LogLevel::Error => Self::Error,
            LogLevel::Warn => Self::Warn,
            LogLevel::Info => Self::Info,
            LogLevel::Debug => Self::Debug,
            LogLevel::Trace => Self::Trace,
        }
    }
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Off => "off",
            Self::Error => "error",
            Self::Warn => "warn",
            Self::Info => "info",
            Self::Debug => "debug",
            Self::Trace => "trace",
        })
    }
}

impl std::str::FromStr for LogLevel {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "off" => Ok(Self::Off),
            "error" => Ok(Self::Error),
            "warn" => Ok(Self::Warn),
            "info" => Ok(Self::Info),
            "debug" => Ok(Self::Debug),
            "trace" => Ok(Self::Trace),
            _ => Err(format!("Invalid log level: {}", value)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(default)]
pub struct LoggerConfig {
    #[serde(default)]
    pub frontend: LogLevel,
    #[serde(default)]
    pub tauri: LogLevel,
    #[serde(default)]
    pub proxy: LogLevel,
    #[serde(default)]
    pub agent: LogLevel,
    #[serde(default)]
    pub commands: LogLevel,
    #[serde(default)]
    pub diff: LogLevel,
}

impl Default for LoggerConfig {
    fn default() -> Self {
        Self {
            frontend: LogLevel::Info,
            tauri: LogLevel::Info,
            proxy: LogLevel::Info,
            agent: LogLevel::Info,
            commands: LogLevel::Info,
            diff: LogLevel::Info,
        }
    }
}

fn target_directives(config: &LoggerConfig) -> Vec<(String, log::LevelFilter)> {
    let crate_prefix = env!("CARGO_CRATE_NAME");
    vec![
        ("frontend".to_string(), config.frontend.into()),
        (crate_prefix.to_string(), config.tauri.into()),
        (format!("{crate_prefix}::proxy"), config.proxy.into()),
        (format!("{crate_prefix}::agent"), config.agent.into()),
        (format!("{crate_prefix}::commands"), config.commands.into()),
        (format!("{crate_prefix}::handlers"), config.commands.into()),
        (format!("{crate_prefix}::diff"), config.diff.into()),
    ]
}

fn build_logger(config: &LoggerConfig, output_target: env_logger::Target) -> env_logger::Logger {
    let mut builder = env_logger::Builder::new();
    for (target, level) in target_directives(config) {
        builder.filter_module(&target, level);
    }
    builder.target(output_target);
    builder.build()
}

fn highest_configured_level(config: &LoggerConfig) -> log::LevelFilter {
    [
        config.frontend.into(),
        config.tauri.into(),
        config.proxy.into(),
        config.agent.into(),
        config.commands.into(),
        config.diff.into(),
    ]
    .into_iter()
    .filter(|level| *level != log::LevelFilter::Off)
    .max()
    .unwrap_or(log::LevelFilter::Off)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum OutputTarget {
    Stdout,
    Stderr,
}

fn output_target_for_level(level: log::Level) -> OutputTarget {
    if level == log::Level::Error {
        OutputTarget::Stderr
    } else {
        OutputTarget::Stdout
    }
}

struct SplitLogger {
    stdout: env_logger::Logger,
    stderr: env_logger::Logger,
}

impl SplitLogger {
    fn new(stdout: env_logger::Logger, stderr: env_logger::Logger) -> Self {
        Self { stdout, stderr }
    }

    fn logger_for_level(&self, level: log::Level) -> &env_logger::Logger {
        match output_target_for_level(level) {
            OutputTarget::Stdout => &self.stdout,
            OutputTarget::Stderr => &self.stderr,
        }
    }
}

impl log::Log for SplitLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        self.logger_for_level(metadata.level()).enabled(metadata)
    }

    fn log(&self, record: &log::Record<'_>) {
        self.logger_for_level(record.level()).log(record);
    }

    fn flush(&self) {
        self.stdout.flush();
        self.stderr.flush();
    }
}

/// Initialize the process-wide logger. Repeated calls are ignored.
pub fn init_logger(config: LoggerConfig) {
    let stdout = build_logger(&config, env_logger::Target::Stdout);
    let stderr = build_logger(&config, env_logger::Target::Stderr);
    let max_level = highest_configured_level(&config);

    if log::set_boxed_logger(Box::new(SplitLogger::new(stdout, stderr))).is_ok() {
        log::set_max_level(max_level);
    }
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
    #[serde(default)]
    pub knowledge: KnowledgeConfig,
    #[serde(default)]
    pub logger: LoggerConfig,
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
    normalize_config_paths(config, &path)
}

// Ensure config.yml exists by copying from template.config.yml if needed
pub fn ensure_config_exists(
    workspace_path: PathBuf,
    template_path: PathBuf,
) -> Result<(PathBuf, bool), String> {
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

        return Ok((config_yml_path, true));
    }

    Ok((config_yml_path, false))
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
    use log::Log;

    fn test_config() -> ConfigState {
        ConfigState::default()
    }

    #[test]
    fn log_levels_convert_to_level_filters() {
        let cases = [
            (LogLevel::Off, log::LevelFilter::Off),
            (LogLevel::Error, log::LevelFilter::Error),
            (LogLevel::Warn, log::LevelFilter::Warn),
            (LogLevel::Info, log::LevelFilter::Info),
            (LogLevel::Debug, log::LevelFilter::Debug),
            (LogLevel::Trace, log::LevelFilter::Trace),
        ];

        for (level, expected) in cases {
            assert_eq!(log::LevelFilter::from(level), expected);
        }
    }

    #[test]
    fn target_directives_use_actual_crate_prefix_and_module_thresholds() {
        let config = LoggerConfig {
            frontend: LogLevel::Trace,
            tauri: LogLevel::Error,
            proxy: LogLevel::Warn,
            agent: LogLevel::Info,
            commands: LogLevel::Debug,
            diff: LogLevel::Off,
        };
        let crate_prefix = env!("CARGO_CRATE_NAME");
        let directives = target_directives(&config);

        assert_eq!(
            directives,
            vec![
                ("frontend".to_string(), log::LevelFilter::Trace),
                (crate_prefix.to_string(), log::LevelFilter::Error),
                (format!("{crate_prefix}::proxy"), log::LevelFilter::Warn,),
                (format!("{crate_prefix}::agent"), log::LevelFilter::Info,),
                (format!("{crate_prefix}::commands"), log::LevelFilter::Debug,),
                (format!("{crate_prefix}::handlers"), log::LevelFilter::Debug,),
                (format!("{crate_prefix}::diff"), log::LevelFilter::Off),
            ]
        );
        assert_eq!(directives[1].0, crate_prefix);
        assert!(directives
            .iter()
            .skip(2)
            .all(|(target, _)| { target.starts_with(&format!("{crate_prefix}::")) }));

        let command_directives: Vec<_> = directives
            .iter()
            .filter(|(target, _)| target.ends_with("::commands") || target.ends_with("::handlers"))
            .collect();
        assert_eq!(command_directives.len(), 2);
        assert!(command_directives
            .iter()
            .all(|(_, level)| *level == log::LevelFilter::Debug));
    }

    #[test]
    fn child_logger_filters_by_target_and_level() {
        let config = LoggerConfig {
            proxy: LogLevel::Warn,
            commands: LogLevel::Debug,
            ..LoggerConfig::default()
        };
        let logger = build_logger(&config, env_logger::Target::Stdout);
        let crate_prefix = env!("CARGO_CRATE_NAME");
        let proxy_target = format!("{crate_prefix}::proxy::nested");
        let handler_target = format!("{crate_prefix}::handlers");

        let metadata = log::Metadata::builder()
            .level(log::Level::Debug)
            .target(&proxy_target)
            .build();
        assert!(!logger.enabled(&metadata));

        let metadata = log::Metadata::builder()
            .level(log::Level::Warn)
            .target(&proxy_target)
            .build();
        assert!(logger.enabled(&metadata));

        let metadata = log::Metadata::builder()
            .level(log::Level::Debug)
            .target(&handler_target)
            .build();
        assert!(logger.enabled(&metadata));
    }

    #[test]
    fn highest_configured_level_ignores_disabled_modules() {
        let mut config = LoggerConfig {
            frontend: LogLevel::Off,
            tauri: LogLevel::Error,
            proxy: LogLevel::Off,
            agent: LogLevel::Trace,
            commands: LogLevel::Off,
            diff: LogLevel::Off,
        };
        assert_eq!(highest_configured_level(&config), log::LevelFilter::Trace);

        config.tauri = LogLevel::Off;
        config.agent = LogLevel::Off;
        assert_eq!(highest_configured_level(&config), log::LevelFilter::Off);
    }

    #[test]
    fn error_records_use_stderr_and_other_levels_use_stdout() {
        assert_eq!(
            output_target_for_level(log::Level::Error),
            OutputTarget::Stderr
        );

        for level in [
            log::Level::Trace,
            log::Level::Debug,
            log::Level::Info,
            log::Level::Warn,
        ] {
            assert_eq!(output_target_for_level(level), OutputTarget::Stdout);
        }
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

        let config = normalize_config_paths_with_home(config, Path::new("/workspace"), Some(home))
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

        let config = normalize_config_paths_with_home(config, Path::new("/workspace"), Some(home))
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

        let error = normalize_config_paths_with_home(config, Path::new("/workspace"), None)
            .expect_err("missing HOME should be rejected");

        assert_eq!(error, "HOME environment variable is not set");
    }

    #[test]
    fn normalizes_empty_knowledge_path_to_workspace() {
        let home = Path::new("/home/test-user");
        let config = ConfigState {
            knowledge: KnowledgeConfig {
                path: String::new(),
            },
            ..test_config()
        };

        let config = normalize_config_paths_with_home(config, Path::new("/workspace"), Some(home))
            .expect("empty knowledge path should use the workspace default");

        assert_eq!(config.knowledge.path, "/workspace/knowledge_base");
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

        let config = normalize_config_paths_with_home(config, Path::new("/workspace"), Some(home))
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
