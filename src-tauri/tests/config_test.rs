use micro_studio_agent_lib::config::{
    load_config, ChatConfig, ConfigState, LanceConfig, ProjectsConfig, RagConfig,
};
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
}

/// `load_config` should fall back to `config.yaml` when `config.yml` is absent.
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
