use crate::config::{LogLevel, LoggerConfig};
use std::fmt::Arguments;
use std::sync::{Arc, OnceLock};

static LOGGER: OnceLock<Arc<LoggerConfig>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LogModule {
    Frontend,
    Tauri,
    Proxy,
    Agent,
    Commands,
    Diff,
}

impl LogModule {
    fn as_str(self) -> &'static str {
        match self {
            Self::Frontend => "FRONTEND",
            Self::Tauri => "TAURI",
            Self::Proxy => "PROXY",
            Self::Agent => "AGENT",
            Self::Commands => "COMMANDS",
            Self::Diff => "DIFF",
        }
    }
}

/// Initialize the process-wide logger. Repeated calls are ignored.
pub fn initialize(config: LoggerConfig) {
    let _ = LOGGER.set(Arc::new(config));
}

fn config() -> &'static LoggerConfig {
    LOGGER.get().map(Arc::as_ref).unwrap_or_else(|| {
        let default = Arc::new(LoggerConfig::default());
        LOGGER.get_or_init(move || default)
    })
}

fn configured_level(module: LogModule) -> LogLevel {
    match module {
        LogModule::Frontend => config().frontend,
        LogModule::Tauri => config().tauri,
        LogModule::Proxy => config().proxy,
        LogModule::Agent => config().agent,
        LogModule::Commands => config().commands,
        LogModule::Diff => config().diff,
    }
}

fn module_from_path(module_path: &str) -> LogModule {
    let components: Vec<_> = module_path.split("::").collect();

    if components.iter().any(|component| *component == "proxy") {
        LogModule::Proxy
    } else if components.iter().any(|component| *component == "agent") {
        LogModule::Agent
    } else if components
        .iter()
        .any(|component| matches!(*component, "commands" | "handlers"))
    {
        LogModule::Commands
    } else if components.iter().any(|component| *component == "diff") {
        LogModule::Diff
    } else {
        LogModule::Tauri
    }
}

pub(crate) fn is_enabled_for_path(module_path: &str, level: LogLevel) -> bool {
    is_enabled(module_from_path(module_path), level)
}

pub(crate) fn emit_for_path(module_path: &str, level: LogLevel, message: Arguments<'_>) {
    emit(module_from_path(module_path), level, message);
}

pub(crate) fn is_frontend_enabled(level: LogLevel) -> bool {
    is_enabled(LogModule::Frontend, level)
}

pub(crate) fn emit_frontend(level: LogLevel, message: Arguments<'_>) {
    emit(LogModule::Frontend, level, message);
}

fn is_enabled(module: LogModule, level: LogLevel) -> bool {
    level.is_enabled(configured_level(module))
}

fn emit(module: LogModule, level: LogLevel, message: Arguments<'_>) {
    if !is_enabled(module, level) {
        return;
    }

    let output = format!("[{}] [{}] {}", module.as_str(), level, message);
    match level {
        LogLevel::Error | LogLevel::Warn => eprintln!("{output}"),
        LogLevel::Off | LogLevel::Info | LogLevel::Debug | LogLevel::Trace => {
            println!("{output}")
        }
    }
}

/// Emit a log using the calling Rust module's path.
///
/// The enabled check happens before `format_args!`, so disabled calls do not
/// evaluate message formatting expressions.
#[macro_export]
macro_rules! log {
    ($level:expr, $($arg:tt)*) => {{
        let level = $level;
        let module_path = module_path!();
        if $crate::logging::is_enabled_for_path(module_path, level) {
            $crate::logging::emit_for_path(module_path, level, format_args!($($arg)*));
        }
    }};
}

/// Emit a frontend-originated log using the frontend logger configuration.
#[macro_export]
macro_rules! frontend_log {
    ($level:expr, $($arg:tt)*) => {{
        let level = $level;
        if $crate::logging::is_frontend_enabled(level) {
            $crate::logging::emit_frontend(level, format_args!($($arg)*));
        }
    }};
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_ordering_matches_threshold_semantics() {
        assert!(LogLevel::Trace.is_enabled(LogLevel::Trace));
        assert!(LogLevel::Debug.is_enabled(LogLevel::Trace));
        assert!(LogLevel::Info.is_enabled(LogLevel::Debug));
        assert!(LogLevel::Warn.is_enabled(LogLevel::Info));
        assert!(LogLevel::Error.is_enabled(LogLevel::Warn));
        assert!(!LogLevel::Info.is_enabled(LogLevel::Off));
    }

    #[test]
    fn every_level_uses_the_expected_threshold() {
        let cases = [
            (LogLevel::Off, [false, false, false, false, false]),
            (LogLevel::Error, [true, true, true, true, true]),
            (LogLevel::Warn, [false, true, true, true, true]),
            (LogLevel::Info, [false, false, true, true, true]),
            (LogLevel::Debug, [false, false, false, true, true]),
            (LogLevel::Trace, [false, false, false, false, true]),
        ];
        let thresholds = [
            LogLevel::Error,
            LogLevel::Warn,
            LogLevel::Info,
            LogLevel::Debug,
            LogLevel::Trace,
        ];

        for (level, expected) in cases {
            for (threshold, is_enabled) in thresholds.into_iter().zip(expected) {
                assert_eq!(
                    level.is_enabled(threshold),
                    is_enabled,
                    "{level} with threshold {threshold}"
                );
            }
            assert!(!level.is_enabled(LogLevel::Off));
        }
    }

    #[test]
    fn logger_config_defaults_to_info_for_every_module() {
        let config = LoggerConfig::default();
        assert_eq!(config.frontend, LogLevel::Info);
        assert_eq!(config.tauri, LogLevel::Info);
        assert_eq!(config.proxy, LogLevel::Info);
        assert_eq!(config.agent, LogLevel::Info);
        assert_eq!(config.commands, LogLevel::Info);
        assert_eq!(config.diff, LogLevel::Info);
    }

    #[test]
    fn module_names_are_stable() {
        assert_eq!(LogModule::Frontend.as_str(), "FRONTEND");
        assert_eq!(LogModule::Tauri.as_str(), "TAURI");
        assert_eq!(LogModule::Proxy.as_str(), "PROXY");
        assert_eq!(LogModule::Agent.as_str(), "AGENT");
        assert_eq!(LogModule::Commands.as_str(), "COMMANDS");
        assert_eq!(LogModule::Diff.as_str(), "DIFF");
    }

    #[test]
    fn module_path_classification_uses_rust_module_ownership() {
        assert_eq!(
            module_from_path("micro_studio_agent_lib::proxy"),
            LogModule::Proxy
        );
        assert_eq!(
            module_from_path("micro_studio_agent_lib::agent"),
            LogModule::Agent
        );
        assert_eq!(
            module_from_path("micro_studio_agent_lib::agent::rag"),
            LogModule::Agent
        );
        assert_eq!(
            module_from_path("micro_studio_agent_lib::commands"),
            LogModule::Commands
        );
        assert_eq!(
            module_from_path("micro_studio_agent_lib::handlers"),
            LogModule::Commands
        );
        assert_eq!(
            module_from_path("micro_studio_agent_lib::diff"),
            LogModule::Diff
        );
    }

    #[test]
    fn unknown_module_paths_fall_back_to_tauri() {
        for module_path in [
            "micro_studio_agent_lib::lib",
            "micro_studio_agent_lib::config",
            "micro_studio_agent_lib::network",
            "micro_studio_agent_lib::main",
            "micro_studio_agent_lib::logging",
            "micro_studio_agent_lib::frontend",
        ] {
            assert_eq!(module_from_path(module_path), LogModule::Tauri);
        }
    }

    #[test]
    fn log_level_parsing_is_strict_and_lowercase() {
        for level in ["off", "error", "warn", "info", "debug", "trace"] {
            assert!(level.parse::<LogLevel>().is_ok(), "{level} should parse");
            assert!(
                level.to_ascii_uppercase().parse::<LogLevel>().is_err(),
                "{level} uppercase should be rejected"
            );
        }
        assert!("warning".parse::<LogLevel>().is_err());
    }
}
