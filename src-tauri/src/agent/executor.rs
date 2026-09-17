use crate::agent::rag;
use crate::agent::tools::{ReadFileTool, ViewFileStructureTool, WriteFileTool};
use rig::agent::AgentBuilder;
use rig::client::CompletionClient;
use rig::completion::Prompt;

/// Resolve the API key from an environment variable.
fn resolve_api_key(config_key: &str, default_env: &str) -> Result<String, String> {
    let env_name = if config_key.is_empty() {
        default_env
    } else {
        config_key
    };
    std::env::var(env_name)
        .map_err(|e| format!("Failed to read {} from environment: {}", env_name, e))
}

use crate::config::LogLevel;

/// Run the AI agent with the given prompt.
///
/// When RAG is configured (provider + model + lancedb path are all set),
/// relevant context is retrieved from the LanceDB index and prepended
/// to the prompt before it is sent to the LLM.
pub async fn run_agent(
    prompt: String,
    config: &crate::config::ConfigState,
) -> Result<String, String> {
    // 1. RAG: retrieve relevant context from LanceDB if configured
    let rag_context = if !config.rag.provider.is_empty()
        && !config.rag.model.is_empty()
        && !config.lancedb.path.is_empty()
    {
        match rag::rag_query_answer(
            &config.rag.provider,
            &config.rag.model,
            &config.chat.model,
            &config.lancedb.path,
            &prompt,
        )
        .await
        {
            Ok(ctx) => {
                crate::log!(
                    LogLevel::Info,
                    "Retrieved RAG context ({} chars)",
                    ctx.len()
                );
                Some(ctx)
            }
            Err(e) => {
                crate::log!(LogLevel::Error, "Failed to retrieve RAG context: {}", e);
                None
            }
        }
    } else {
        None
    };

    // 2. Build the full prompt with RAG context
    let full_prompt = match &rag_context {
        Some(ctx) => format!(
            "Use the following context to help answer the user's request:\n\n--- Context ---\n{}\n--- End Context ---\n\nUser request: {}",
            ctx, prompt
        ),
        None => prompt.clone(),
    };

    // 3. Create the LLM client based on the configured provider
    let provider = config.chat.provider.to_lowercase();
    let model_name = &config.chat.model;

    let agent = match provider.as_str() {
        "openai" => {
            let api_key = resolve_api_key(
                config.chat.api_key_env.as_deref().unwrap_or(""),
                "OPENAI_API_KEY",
            )?;
            let client = if config.chat.endpoint.is_empty() {
                rig::providers::openai::Client::new(&api_key)
                    .map_err(|e| format!("Failed to create OpenAI client: {}", e))?
            } else {
                rig::providers::openai::Client::builder()
                    .api_key(api_key)
                    .base_url(&config.chat.endpoint)
                    .build()
                    .map_err(|e| format!("Failed to build OpenAI client: {}", e))?
            };
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
            let client = if endpoint.is_empty() {
                rig::providers::ollama::Client::new("http://localhost:11434")
                    .map_err(|e| format!("Failed to create Ollama client: {}", e))?
            } else {
                rig::providers::ollama::Client::builder()
                    .api_key("")
                    .base_url(&endpoint)
                    .build()
                    .map_err(|e| format!("Failed to build Ollama client: {}", e))?
            };
            let model = client.completion_model(model_name);
            AgentBuilder::new(model)
                .preamble("You are a helpful AI coding assistant. You can read, write files, and view the project structure. Use the available tools to explore and modify the codebase.")
                .tool(ReadFileTool)
                .tool(WriteFileTool)
                .tool(ViewFileStructureTool)
                .build()
        }
        "openrouter" => {
            let api_key = resolve_api_key(
                config.chat.api_key_env.as_deref().unwrap_or(""),
                "OPENROUTER_API_KEY",
            )?;
            let client = if config.chat.endpoint.is_empty() {
                rig::providers::openrouter::Client::new(&api_key)
                    .map_err(|e| format!("Failed to create OpenRouter client: {}", e))?
            } else {
                rig::providers::openrouter::Client::builder()
                    .api_key(api_key)
                    .base_url(&config.chat.endpoint)
                    .build()
                    .map_err(|e| format!("Failed to build OpenRouter client: {}", e))?
            };
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

    // 4. Execute the prompt with the agent
    let response = agent
        .prompt(&full_prompt)
        .await
        .map_err(|e| format!("Agent execution error: {}", e))?;

    Ok(response)
}
