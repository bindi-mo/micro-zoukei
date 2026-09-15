use crate::agent::tools::{ReadFileTool, ViewFileStructureTool, WriteFileTool};
use crate::config::load_config;
use rig::agent::AgentBuilder;
use rig::client::CompletionClient;
use rig::completion::Prompt;

/// Resolve the API key from an environment variable.
///
/// If `config_key` is non-empty, it is treated as an environment variable name
/// and the API key is read from that variable. If `config_key` is empty,
/// the `default_env` variable name is used instead.
fn resolve_api_key(config_key: &str, default_env: &str) -> Result<String, String> {
    let env_name = if config_key.is_empty() {
        default_env
    } else {
        config_key
    };
    std::env::var(env_name)
        .map_err(|e| format!("Failed to read {} from environment: {}", env_name, e))
}

pub async fn run_agent(prompt: String) -> Result<String, String> {
    // 1. Load configuration
    let config = load_config()?;

    // 2. Create the LLM client based on the configured provider
    let provider = config.chat.provider.to_lowercase();
    let model_name = &config.chat.model;

    let agent = match provider.as_str() {
        "openai" => {
            let api_key = resolve_api_key(&config.chat.api_key_env, "OPENAI_API_KEY")?;
            let client = rig::providers::openai::Client::new(&api_key)
                .map_err(|e| format!("Failed to create OpenAI client: {}", e))?;
            let model = client.completion_model(model_name);
            AgentBuilder::new(model)
                .preamble("You are a helpful AI coding assistant. You can read, write files, and view the project structure. Use the available tools to explore and modify the codebase.")
                .tool(ReadFileTool)
                .tool(WriteFileTool)
                .tool(ViewFileStructureTool)
                .build()
        }
        "ollama" => {
            let endpoint = config.chat.endpoint.clone();
            let client = rig::providers::ollama::Client::new(endpoint.as_str())
                .map_err(|e| format!("Failed to create Ollama client: {}", e))?;
            let model = client.completion_model(model_name);
            AgentBuilder::new(model)
                .preamble("You are a helpful AI coding assistant. You can read, write files, and view the project structure. Use the available tools to explore and modify the codebase.")
                .tool(ReadFileTool)
                .tool(WriteFileTool)
                .tool(ViewFileStructureTool)
                .build()
        }
        "openrouter" => {
            let api_key = resolve_api_key(&config.chat.api_key_env, "OPENROUTER_API_KEY")?;
            let client = rig::providers::openrouter::Client::new(&api_key)
                .map_err(|e| format!("Failed to create OpenRouter client: {}", e))?;
            let model = client.completion_model(model_name);
            AgentBuilder::new(model)
                .preamble("You are a helpful AI coding assistant. You can read, write files, and view the project structure. Use the available tools to explore and modify the codebase.")
                .tool(ReadFileTool)
                .tool(WriteFileTool)
                .tool(ViewFileStructureTool)
                .build()
        }
        _ => return Err(format!("Unsupported provider: {}", provider)),
    };

    // 3. Execute the prompt with the agent
    let response = agent
        .prompt(prompt)
        .await
        .map_err(|e| format!("Agent execution error: {}", e))?;

    Ok(response)
}
