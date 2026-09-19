use micro_studio_agent_lib::config::{
    copy_knowledge_files, load_config, ChatConfig, ConfigState, LanceConfig, ProjectsConfig,
    RagConfig,
};
use micro_studio_agent_lib::config::{LogLevel, LoggerConfig};
use std::fs;
use tempfile::TempDir;

/// `ConfigState::default()` should produce a config with all string fields empty.
#[test]
fn config_defaults_are_empty() {
    let config = ConfigState::default();
    assert_eq!(config.rag.provider, "");
    assert_eq!(config.rag.model, "");
    assert!(config.rag.api_key_env.is_none());
    assert_eq!(config.rag.endpoint, "");
    assert_eq!(config.chat.provider, "");
    assert_eq!(config.chat.model, "");
    assert!(config.chat.api_key_env.is_none());
    assert_eq!(config.chat.endpoint, "");
    assert_eq!(config.projects.path, "");
    assert_eq!(config.lancedb.path, "");
    assert_eq!(config.knowledge.path, "");
}

/// `ConfigState` should implement `Clone` so it can be shared across threads.
#[test]
fn config_clone_preserves_values() {
    let original = ConfigState {
        rag: RagConfig {
            provider: "openai".to_string(),
            model: "text-embedding-ada-002".to_string(),
            api_key_env: Some("OPENAI_API_KEY".to_string()),
            endpoint: "https://api.openai.com".to_string(),
        },
        chat: ChatConfig {
            provider: "openai".to_string(),
            model: "gpt-4o".to_string(),
            api_key_env: Some("OPENAI_API_KEY".to_string()),
            endpoint: String::new(),
        },
        projects: ProjectsConfig {
            path: "/home/user/projects".to_string(),
        },
        lancedb: LanceConfig {
            path: "/home/user/lancedb".to_string(),
        },
        knowledge: micro_studio_agent_lib::config::KnowledgeConfig {
            path: "/home/user/knowledge_base".to_string(),
        },
        ..Default::default()
    };

    let cloned = original.clone();
    assert_eq!(original.rag.provider, cloned.rag.provider);
    assert_eq!(original.rag.model, cloned.rag.model);
    assert_eq!(original.rag.api_key_env, cloned.rag.api_key_env);
    assert_eq!(original.rag.endpoint, cloned.rag.endpoint);
    assert_eq!(original.chat.provider, cloned.chat.provider);
    assert_eq!(original.chat.model, cloned.chat.model);
    assert_eq!(original.chat.api_key_env, cloned.chat.api_key_env);
    assert_eq!(original.chat.endpoint, cloned.chat.endpoint);
    assert_eq!(original.projects.path, cloned.projects.path);
    assert_eq!(original.lancedb.path, cloned.lancedb.path);
}

/// `load_config` should successfully parse a valid `config.yml` file.
#[test]
fn config_loads_from_yml() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let config_path = temp_dir.path().join("config.yml");
    fs::write(
        &config_path,
        r#"
rag:
  provider: openai
  model: text-embedding-ada-002
  api_key_env: OPENAI_API_KEY
  endpoint: https://api.openai.com
chat:
  provider: openai
  model: gpt-4o
  api_key_env: OPENAI_API_KEY
  endpoint: ""
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
knowledge:
  path: /home/user/knowledge_base
"#,
    )
    .expect("failed to write config.yml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load config from temp dir");

    assert_eq!(state.rag.provider, "openai");
    assert_eq!(state.rag.model, "text-embedding-ada-002");
    assert_eq!(state.rag.api_key_env, Some("OPENAI_API_KEY".to_string()));
    assert_eq!(state.rag.endpoint, "https://api.openai.com");
    assert_eq!(state.chat.provider, "openai");
    assert_eq!(state.chat.model, "gpt-4o");
    assert_eq!(state.chat.api_key_env, Some("OPENAI_API_KEY".to_string()));
    assert_eq!(state.chat.endpoint, "");
    assert_eq!(state.projects.path, "/home/user/projects");
    assert_eq!(state.lancedb.path, "/home/user/lancedb");
    assert_eq!(state.knowledge.path, "/home/user/knowledge_base");
}

#[test]
fn config_loads_legacy_config_without_knowledge() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ollama
  model: nomic-embed-text:latest
  endpoint: "http://localhost:11434/v1"
chat:
  provider: ollama
  model: gemma4:E4B-it-qat-Q4_K_M
  endpoint: "http://localhost:11434/v1"
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
"#,
    )
    .expect("failed to write legacy config.yml");

    let state = load_config(temp_dir.path().to_path_buf()).expect("failed to load legacy config");

    let expected_knowledge_path = temp_dir.path().join("knowledge_base");

    assert_eq!(
        state.knowledge.path,
        expected_knowledge_path.to_string_lossy()
    );
}

/// Empty knowledge objects remain supported for compatibility with older configs.
#[test]
fn config_loads_empty_knowledge_object_for_backward_compatibility() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ollama
  model: nomic-embed-text:latest
  endpoint: "http://localhost:11434/v1"
chat:
  provider: ollama
  model: gemma4:E4B-it-qat-Q4_K_M
  endpoint: "http://localhost:11434/v1"
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
knowledge: {}
"#,
    )
    .expect("failed to write config.yml");

    let state = load_config(temp_dir.path().to_path_buf())
        .expect("failed to load config with empty knowledge");

    let expected_knowledge_path = temp_dir.path().join("knowledge_base");

    assert_eq!(
        state.knowledge.path,
        expected_knowledge_path.to_string_lossy()
    );
}

/// Empty knowledge paths remain supported for compatibility with older configs.
#[test]
fn config_loads_empty_knowledge_path_for_backward_compatibility() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ollama
  model: nomic-embed-text:latest
  endpoint: "http://localhost:11434/v1"
chat:
  provider: ollama
  model: gemma4:E4B-it-qat-Q4_K_M
  endpoint: "http://localhost:11434/v1"
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
knowledge:
  path: ""
"#,
    )
    .expect("failed to write config.yml");

    let state = load_config(temp_dir.path().to_path_buf())
        .expect("failed to load config with empty knowledge path");

    assert_eq!(
        state.knowledge.path,
        temp_dir.path().join("knowledge_base").to_string_lossy()
    );
}

#[test]
fn logger_config_is_omitted_defaults_to_info() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
"#,
    )
    .expect("failed to write config.yml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load config without logger");

    assert_eq!(state.logger, LoggerConfig::default());
}

#[test]
fn empty_logger_config_defaults_to_info() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
logger: {}
"#,
    )
    .expect("failed to write config.yml");

    let state = load_config(temp_dir.path().to_path_buf())
        .expect("failed to load config with empty logger");

    assert_eq!(state.logger, LoggerConfig::default());
}

#[test]
fn logger_config_applies_defaults_to_omitted_modules() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
logger:
  frontend: error
  proxy: off
  commands: trace
"#,
    )
    .expect("failed to write config.yml");

    let state = load_config(temp_dir.path().to_path_buf())
        .expect("failed to load partially configured logger");

    assert_eq!(state.logger.frontend, LogLevel::Error);
    assert_eq!(state.logger.tauri, LogLevel::Info);
    assert_eq!(state.logger.proxy, LogLevel::Off);
    assert_eq!(state.logger.agent, LogLevel::Info);
    assert_eq!(state.logger.commands, LogLevel::Trace);
    assert_eq!(state.logger.diff, LogLevel::Info);
}

#[test]
fn logger_config_supports_all_levels() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
logger:
  frontend: off
  tauri: error
  proxy: warn
  agent: info
  commands: debug
  diff: trace
"#,
    )
    .expect("failed to write config.yml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load fully configured logger");

    assert_eq!(state.logger.frontend, LogLevel::Off);
    assert_eq!(state.logger.tauri, LogLevel::Error);
    assert_eq!(state.logger.proxy, LogLevel::Warn);
    assert_eq!(state.logger.agent, LogLevel::Info);
    assert_eq!(state.logger.commands, LogLevel::Debug);
    assert_eq!(state.logger.diff, LogLevel::Trace);
}

#[test]
fn logger_config_rejects_invalid_levels() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
logger:
  frontend: INFO
"#,
    )
    .expect("failed to write config.yml");

    let error = load_config(temp_dir.path().to_path_buf())
        .expect_err("uppercase log levels should be rejected");

    let error = error.to_ascii_lowercase();
    assert!(error.contains("info"), "unexpected error: {error}");
    assert!(
        error.contains("expected one of"),
        "unexpected error: {error}"
    );
}

#[test]
fn config_loads_from_yaml_fallback() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let config_path = temp_dir.path().join("config.yaml");
    fs::write(
        &config_path,
        r#"
rag:
  provider: ollama
  model: nomic-embed-text
  api_key_env: ""
  endpoint: "http://localhost:11434"
chat:
  provider: ollama
  model: llama3
  api_key_env: ""
  endpoint: "http://localhost:11434"
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
knowledge:
  path: /home/user/knowledge_base
"#,
    )
    .expect("failed to write config.yaml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load config from temp dir");

    assert_eq!(state.rag.provider, "ollama");
    assert_eq!(state.rag.model, "nomic-embed-text");
    assert_eq!(state.rag.api_key_env, Some("".to_string()));
    assert_eq!(state.rag.endpoint, "http://localhost:11434");
    assert_eq!(state.chat.provider, "ollama");
    assert_eq!(state.chat.model, "llama3");
    assert_eq!(state.chat.api_key_env, Some("".to_string()));
    assert_eq!(state.chat.endpoint, "http://localhost:11434");
    assert_eq!(state.projects.path, "/home/user/projects");
    assert_eq!(state.lancedb.path, "/home/user/lancedb");
    assert_eq!(state.knowledge.path, "/home/user/knowledge_base");
}

/// `load_config` should return `Err` when no config file exists in the directory.
#[test]
fn config_load_missing_returns_error() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let result = load_config(temp_dir.path().to_path_buf());
    assert!(
        result.is_err(),
        "expected load_config to fail when no config file exists"
    );
}

/// `ConfigState::load` should load all configuration sections directly.
#[test]
fn config_state_load_succeeds() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let config_path = temp_dir.path().join("config.yml");
    fs::write(
        &config_path,
        r#"
rag:
  provider: openrouter
  model: text-embedding-ada-002
  api_key_env: OPENROUTER_API_KEY
  endpoint: ""
chat:
  provider: openrouter
  model: gpt-4o
  api_key_env: OPENROUTER_API_KEY
  endpoint: ""
projects:
  path: /home/user/projects
lancedb:
  path: /home/user/lancedb
knowledge:
  path: /home/user/knowledge_base
"#,
    )
    .expect("failed to write config.yml");

    let state =
        ConfigState::load(temp_dir.path().to_path_buf()).expect("failed to load ConfigState");

    assert_eq!(state.rag.provider, "openrouter");
    assert_eq!(state.rag.model, "text-embedding-ada-002");
    assert_eq!(
        state.rag.api_key_env,
        Some("OPENROUTER_API_KEY".to_string())
    );
    assert_eq!(state.chat.model, "gpt-4o");
    assert_eq!(
        state.chat.api_key_env,
        Some("OPENROUTER_API_KEY".to_string())
    );
    assert_eq!(state.projects.path, "/home/user/projects");
    assert_eq!(state.lancedb.path, "/home/user/lancedb");
}

#[test]
fn config_load_normalizes_knowledge_path() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let expected_knowledge_path = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .expect("HOME should be set")
        .join(".micro-zoukei/knowledge_base");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ollama
  model: nomic-embed-text:latest
  endpoint: "http://localhost:11434/v1"
chat:
  provider: ollama
  model: gemma4:E4B-it-qat-Q4_K_M
  endpoint: "http://localhost:11434/v1"
projects:
  path: "$HOME/.micro-zoukei/projects"
lancedb:
  path: "$HOME/.micro-zoukei/lancedb"
knowledge:
  path: "$HOME/.micro-zoukei/knowledge_base"
"#,
    )
    .expect("failed to write config.yml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load config from temp dir");

    assert_eq!(
        state.knowledge.path,
        expected_knowledge_path.to_string_lossy()
    );
}

#[test]
fn copies_knowledge_files_to_configured_path() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let source = temp_dir.path().join("resource/knowledge_base");
    let destination = temp_dir.path().join("workspace/knowledge_base");
    fs::create_dir_all(source.join("nested")).expect("failed to create source directory");
    fs::write(source.join("root.md"), "root").expect("failed to write root file");
    fs::write(source.join("nested/child.md"), "child").expect("failed to write child file");
    fs::write(
        temp_dir.path().join("config.yml"),
        format!(
            r#"
rag:
  provider: ollama
  model: nomic-embed-text:latest
  endpoint: ""
chat:
  provider: ollama
  model: gemma4:E4B-it-qat-Q4_K_M
  endpoint: ""
projects:
  path: "{}"
lancedb:
  path: "{}"
knowledge:
  path: "{}"
"#,
            temp_dir.path().join("workspace/projects").to_string_lossy(),
            temp_dir.path().join("workspace/lancedb").to_string_lossy(),
            destination.to_string_lossy(),
        ),
    )
    .expect("failed to write config.yml");

    let state =
        load_config(temp_dir.path().to_path_buf()).expect("failed to load config from temp dir");
    let copied = copy_knowledge_files(&source, std::path::Path::new(&state.knowledge.path))
        .expect("knowledge copy should succeed");

    assert_eq!(copied, 2);
    assert_eq!(
        fs::read_to_string(destination.join("root.md")).unwrap(),
        "root"
    );
    assert_eq!(
        fs::read_to_string(destination.join("nested/child.md")).unwrap(),
        "child"
    );
}

#[test]
fn logger_config_parses_dynamic_categories() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    fs::write(
        temp_dir.path().join("config.yml"),
        r#"
rag:
  provider: ""
  model: ""
  endpoint: ""
chat:
  provider: ""
  model: ""
  endpoint: ""
projects:
  path: ""
lancedb:
  path: ""
logger:
  frontend: trace
  proxy: off
  my_custom_category: debug
  another_category: warn
"#,
    )
    .expect("failed to write config.yml");

    let state = load_config(temp_dir.path().to_path_buf())
        .expect("failed to load config with dynamic categories");

    assert_eq!(state.logger.frontend, LogLevel::Trace);
    assert_eq!(state.logger.proxy, LogLevel::Off);
    assert_eq!(
        state.logger.dynamic.get("my_custom_category"),
        Some(&LogLevel::Debug)
    );
    assert_eq!(
        state.logger.dynamic.get("another_category"),
        Some(&LogLevel::Warn)
    );
}

#[test]
fn logger_config_dynamic_categories_generate_correct_directives() {
    let config = LoggerConfig {
        frontend: LogLevel::Info,
        tauri: LogLevel::Info,
        proxy: LogLevel::Info,
        agent: LogLevel::Info,
        commands: LogLevel::Info,
        diff: LogLevel::Info,
        dynamic: {
            let mut m = std::collections::BTreeMap::new();
            m.insert("handlers".to_string(), LogLevel::Debug);
            m.insert("custom".to_string(), LogLevel::Trace);
            m
        },
    };
    let directives = micro_studio_agent_lib::config::target_directives(&config);

    // handlers is an alias of commands: it shares the commands threshold
    // and is not independently configurable via a dynamic entry.
    let handlers_directive = directives
        .iter()
        .find(|(t, _)| t.ends_with("::handlers"))
        .expect("handlers directive should exist");
    assert_eq!(handlers_directive.1, log::LevelFilter::Info);
    assert!(directives.iter().any(|(t, _)| t.ends_with("::custom")));
}

#[test]
fn logger_config_handlers_alias_maps_to_commands() {
    let config = LoggerConfig {
        frontend: LogLevel::Info,
        tauri: LogLevel::Info,
        proxy: LogLevel::Info,
        agent: LogLevel::Info,
        commands: LogLevel::Debug,
        diff: LogLevel::Info,
        dynamic: {
            let mut m = std::collections::BTreeMap::new();
            m.insert("handlers".to_string(), LogLevel::Trace);
            m
        },
    };
    let directives = micro_studio_agent_lib::config::target_directives(&config);

    // handlers is not independently configurable: a dynamic `handlers` entry
    // is ignored, and handlers always uses the commands threshold.
    let handlers_directive = directives
        .iter()
        .find(|(t, _)| t.ends_with("::handlers"))
        .expect("handlers directive should exist");
    assert_eq!(handlers_directive.1, log::LevelFilter::Debug);
    let commands_directive = directives
        .iter()
        .find(|(t, _)| t.ends_with("::commands"))
        .expect("commands directive should exist");
    assert_eq!(commands_directive.1, log::LevelFilter::Debug);
}

#[test]
fn logger_config_classify_module_fallbacks_to_tauri() {
    assert_eq!(
        micro_studio_agent_lib::config::classify_module(
            Some("some_other_crate::module"),
            "micro_studio_agent_lib"
        ),
        "tauri"
    );
}

#[test]
fn logger_config_classify_module_frontend() {
    assert_eq!(
        micro_studio_agent_lib::config::classify_module(Some("frontend"), "micro_studio_agent_lib"),
        "frontend"
    );
}

#[test]
fn logger_config_filtering_with_dynamic_trace_category() {
    let config = LoggerConfig {
        frontend: LogLevel::Info,
        tauri: LogLevel::Info,
        proxy: LogLevel::Info,
        agent: LogLevel::Info,
        commands: LogLevel::Info,
        diff: LogLevel::Info,
        dynamic: {
            let mut m = std::collections::BTreeMap::new();
            m.insert("trace_category".to_string(), LogLevel::Trace);
            m
        },
    };
    let logger = micro_studio_agent_lib::config::build_logger(&config, env_logger::Target::Stdout);

    // The library crate name is used for internal directives, not the test crate name.
    let trace_target = "micro_studio_agent_lib::trace_category";
    let metadata = log::Metadata::builder()
        .level(log::Level::Trace)
        .target(trace_target)
        .build();
    assert!(log::Log::enabled(&logger, &metadata));

    let metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(trace_target)
        .build();
    assert!(log::Log::enabled(&logger, &metadata));
}

#[test]
fn logger_config_filtering_with_dynamic_trace_category_via_module_path() {
    let config = LoggerConfig {
        frontend: LogLevel::Off,
        tauri: LogLevel::Off,
        proxy: LogLevel::Off,
        agent: LogLevel::Off,
        commands: LogLevel::Off,
        diff: LogLevel::Off,
        dynamic: {
            let mut m = std::collections::BTreeMap::new();
            m.insert("trace_category".to_string(), LogLevel::Trace);
            m
        },
    };
    let logger = micro_studio_agent_lib::config::build_logger(&config, env_logger::Target::Stdout);

    // Records from a child module of the dynamic category should match
    let metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target("micro_studio_agent_lib::trace_category::inner")
        .build();
    assert!(log::Log::enabled(&logger, &metadata));
}
