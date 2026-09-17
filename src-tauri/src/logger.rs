use crate::config::{LogLevel, LoggerConfig};
use std::fmt::Arguments;
use std::sync::{Arc, OnceLock};

static LOGGER: OnceLock<Arc<LoggerConfig>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogModule {
    Frontend,
    Tauri,
    Proxy,
    Agent,
    Commands,
    Diff,
}

impl LogModule {
    pub fn as_str(self) -> &'static str {
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

pub fn is_enabled(module: LogModule, level: LogLevel) -> bool {
    level.is_enabled(configured_level(module))
}

pub fn emit(module: LogModule, level: LogLevel, message: Arguments<'_>) {
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

/// Emit a log only when its module and level are enabled.
///
/// The enabled check happens before `format_args!`, so disabled calls do not
/// evaluate message formatting expressions.
#[macro_export]
macro_rules! log {
    ($module:expr, $level:expr, $($arg:tt)*) => {{
        if $crate::logger::is_enabled($module, $level) {
            $crate::logger::emit($module, $level, format_args!($($arg)*));
        }
    }};
}

pub fn frontend_error(message: Arguments<'_>) {
    emit(LogModule::Frontend, LogLevel::Error, message);
}

pub fn frontend_warn(message: Arguments<'_>) {
    emit(LogModule::Frontend, LogLevel::Warn, message);
}

pub fn frontend_info(message: Arguments<'_>) {
    emit(LogModule::Frontend, LogLevel::Info, message);
}

pub fn tauri_error(message: Arguments<'_>) {
    emit(LogModule::Tauri, LogLevel::Error, message);
}

pub fn tauri_warn(message: Arguments<'_>) {
    emit(LogModule::Tauri, LogLevel::Warn, message);
}

pub fn tauri_info(message: Arguments<'_>) {
    emit(LogModule::Tauri, LogLevel::Info, message);
}

pub fn tauri_debug(message: Arguments<'_>) {
    emit(LogModule::Tauri, LogLevel::Debug, message);
}

pub fn proxy_error(message: Arguments<'_>) {
    emit(LogModule::Proxy, LogLevel::Error, message);
}

pub fn proxy_warn(message: Arguments<'_>) {
    emit(LogModule::Proxy, LogLevel::Warn, message);
}

pub fn proxy_info(message: Arguments<'_>) {
    emit(LogModule::Proxy, LogLevel::Info, message);
}

pub fn proxy_debug(message: Arguments<'_>) {
    emit(LogModule::Proxy, LogLevel::Debug, message);
}

pub fn agent_error(message: Arguments<'_>) {
    emit(LogModule::Agent, LogLevel::Error, message);
}

pub fn agent_warn(message: Arguments<'_>) {
    emit(LogModule::Agent, LogLevel::Warn, message);
}

pub fn agent_info(message: Arguments<'_>) {
    emit(LogModule::Agent, LogLevel::Info, message);
}

pub fn agent_debug(message: Arguments<'_>) {
    emit(LogModule::Agent, LogLevel::Debug, message);
}

pub fn commands_error(message: Arguments<'_>) {
    emit(LogModule::Commands, LogLevel::Error, message);
}

pub fn commands_warn(message: Arguments<'_>) {
    emit(LogModule::Commands, LogLevel::Warn, message);
}

pub fn commands_info(message: Arguments<'_>) {
    emit(LogModule::Commands, LogLevel::Info, message);
}

pub fn commands_debug(message: Arguments<'_>) {
    emit(LogModule::Commands, LogLevel::Debug, message);
}

pub fn diff_error(message: Arguments<'_>) {
    emit(LogModule::Diff, LogLevel::Error, message);
}

pub fn diff_warn(message: Arguments<'_>) {
    emit(LogModule::Diff, LogLevel::Warn, message);
}

pub fn diff_info(message: Arguments<'_>) {
    emit(LogModule::Diff, LogLevel::Info, message);
}

pub fn diff_debug(message: Arguments<'_>) {
    emit(LogModule::Diff, LogLevel::Debug, message);
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
