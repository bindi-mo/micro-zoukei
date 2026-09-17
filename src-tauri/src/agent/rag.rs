use arrow_array::{types::Float64Type, ArrayRef, FixedSizeListArray, RecordBatch, StringArray};
use lancedb;
#[cfg(debug_assertions)]
use notify::{recommended_watcher, Config, RecursiveMode, Watcher};
use rig::client::{CompletionClient, EmbeddingsClient, ProviderClient};
use rig::embeddings::{Embedding, EmbeddingsBuilder};
use rig::lancedb::{LanceDbVectorIndex, SearchParams};
use rig::prelude::*;
use rig::providers::{ollama, openai, openrouter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use walkdir::WalkDir;

use crate::config::LogLevel;

// Helper function to handle RAG re-indexing
async fn handle_rag_reindex(
    app_handle: tauri::AppHandle,
    config: &crate::config::ConfigState,
    knowledge_path: &str,
) {
    let db_path = config.lancedb.path.clone();
    match crate::agent::rag::rag_inject_documents(
        &config.rag.provider,
        &config.rag.model,
        knowledge_path,
        &db_path,
    )
    .await
    {
        Ok(count) => {
            crate::log!(LogLevel::Info, "RAG re-index complete: {} documents", count);
            let _ = app_handle.emit("rag-reindexed", count);
        }
        Err(e) => {
            crate::log!(LogLevel::Error, "RAG re-index failed: {}", e);
        }
    }
}

pub enum SupportedClient {
    OpenAi(openai::Client),
    Ollama(ollama::Client),
    OpenRouter(openrouter::Client),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DocumentRecord {
    pub id: String,
    pub text: String,
    pub relative_path: String,
}

impl rig::Embed for DocumentRecord {
    fn embed(
        &self,
        embedder: &mut rig::embeddings::TextEmbedder,
    ) -> Result<(), rig::embeddings::EmbedError> {
        embedder.embed(self.text.clone());
        Ok(())
    }
}

fn knowledge_relative_path(root_dir: &Path, file_path: &Path) -> Result<String, String> {
    let normalized_root = root_dir.to_string_lossy().replace('\\', "/");
    let normalized_file = file_path.to_string_lossy().replace('\\', "/");

    let relative_path = Path::new(&normalized_file)
        .strip_prefix(Path::new(&normalized_root))
        .map_err(|e| {
            format!(
                "Failed to resolve relative path for {}: {}",
                file_path.display(),
                e
            )
        })?;

    Ok(relative_path.to_string_lossy().replace('\\', "/"))
}

pub fn create_llm_client(provider: &str) -> Result<SupportedClient, Box<dyn std::error::Error>> {
    match provider.to_lowercase().as_str() {
        "openai" => Ok(SupportedClient::OpenAi(openai::Client::from_env()?)),
        "ollama" => Ok(SupportedClient::Ollama(ollama::Client::new(
            "http://localhost:11434",
        )?)),
        "openrouter" => Ok(SupportedClient::OpenRouter(openrouter::Client::from_env()?)),
        _ => Err(format!("Unsupported provider: {}", provider).into()),
    }
}

// Convert (DocumentRecord, Vec<Embedding>) pairs into a RecordBatch that
// LanceDB can write via `create_table`. LanceDB's `create_table` requires a
// `Scannable` (e.g. `Vec<RecordBatch>`); raw `(document, embeddings)` pairs are
// not `Scannable`, so they must be materialized into a RecordBatch first.
//
// A document may produce multiple embeddings; each one becomes its own row in
// the table, sharing the document's id, relative_path, and text.
fn as_record_batch(
    records: Vec<(DocumentRecord, Vec<Embedding>)>,
    dims: usize,
) -> Result<RecordBatch, lancedb::arrow::arrow_schema::ArrowError> {
    let mut ids: Vec<String> = Vec::new();
    let mut relative_paths: Vec<String> = Vec::new();
    let mut texts: Vec<String> = Vec::new();
    let mut embedding_vecs: Vec<Option<Vec<Option<f64>>>> = Vec::new();

    for (record, embeddings) in records {
        for embedding in embeddings {
            ids.push(record.id.clone());
            relative_paths.push(record.relative_path.clone());
            texts.push(record.text.clone());
            embedding_vecs.push(Some(
                embedding.vec.into_iter().map(Some).collect::<Vec<_>>(),
            ));
        }
    }

    let id = StringArray::from_iter_values(ids);
    let relative_path = StringArray::from_iter_values(relative_paths);
    let text = StringArray::from_iter_values(texts);
    let embedding =
        FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(embedding_vecs, dims as i32);

    RecordBatch::try_from_iter(vec![
        ("id", Arc::new(id) as ArrayRef),
        ("relative_path", Arc::new(relative_path) as ArrayRef),
        ("text", Arc::new(text) as ArrayRef),
        ("embedding", Arc::new(embedding) as ArrayRef),
    ])
}

// Check target extension (.txt, .md)
fn is_target_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .is_some_and(|ext| ext == "txt" || ext == "md")
}

pub async fn rag_inject_documents(
    provider: &str,
    embedding_model_name: &str,
    target_dir: &str,
    db_uri: &str,
) -> Result<usize, Box<dyn std::error::Error>> {
    fs::create_dir_all(target_dir)?;

    let root_dir = Path::new(target_dir);
    let mut documents = Vec::new();
    let mut id_counter = 1;

    for entry in WalkDir::new(target_dir).into_iter() {
        let entry = entry?;
        let path = entry.path();
        if is_target_file(path) {
            let content = fs::read_to_string(path)?;
            let relative_path = knowledge_relative_path(root_dir, path)?;

            documents.push(DocumentRecord {
                id: format!("doc_{}", id_counter),
                text: content,
                relative_path,
            });
            id_counter += 1;
        }
    }

    let db = lancedb::connect(db_uri).execute().await?;
    if documents.is_empty() {
        let _ = db.drop_table("my_documents", &[]).await;
        return Ok(0);
    }

    let total_count = documents.len();
    let client_enum = create_llm_client(provider)?;

    // Shared macro to avoid duplicating vector injection code
    macro_rules! inject_with_client {
        ($client:expr) => {{
            let model = $client.embedding_model(embedding_model_name);
            let embeddings = EmbeddingsBuilder::new(model.clone())
                .documents(documents)?
                .build()
                .await?;
            // LanceDB's `create_table` requires a `Scannable` (e.g.
            // `Vec<RecordBatch>`). Raw `(document, embeddings)` pairs are not
            // `Scannable`, so materialize them into a RecordBatch first.
            let record_batch = as_record_batch(embeddings, model.ndims())?;
            let _ = db.drop_table("my_documents", &[]).await;
            let _table = db
                .create_table("my_documents", vec![record_batch])
                .execute()
                .await?;
        }};
    }

    match client_enum {
        SupportedClient::OpenAi(client) => inject_with_client!(client),
        SupportedClient::Ollama(client) => inject_with_client!(client),
        SupportedClient::OpenRouter(client) => inject_with_client!(client),
    }

    Ok(total_count)
}

pub async fn rag_query_answer(
    provider: &str,
    embedding_model_name: &str,
    completion_model_name: &str,
    db_uri: &str,
    query: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let db = lancedb::connect(db_uri).execute().await?;
    let table = db.open_table("my_documents").execute().await?;
    let client_enum = create_llm_client(provider)?;

    let preamble =
        "You are an excellent assistant who answers questions based on the provided documents.";

    // Shared macro to avoid duplicating RAG agent creation code
    macro_rules! query_with_client {
        ($client:expr) => {{
            let embed_model = $client.embedding_model(embedding_model_name);
            let completion_model = $client.completion_model(completion_model_name);
            let index =
                LanceDbVectorIndex::new(table, embed_model, "id", SearchParams::default()).await?;

            rig::agent::AgentBuilder::new(completion_model)
                .preamble(preamble)
                .dynamic_context(2, index)
                .build()
                .prompt(query)
                .await?
        }};
    }

    let response = match client_enum {
        SupportedClient::OpenAi(client) => query_with_client!(client),
        SupportedClient::Ollama(client) => query_with_client!(client),
        SupportedClient::OpenRouter(client) => query_with_client!(client),
    };

    Ok(response)
}

/// Start a file watcher on the knowledge directory.
///
/// When source files (.txt, .md) are created, modified, or removed,
/// the RAG index is automatically re-indexed via `agent::rag::rag_inject_documents`.
#[cfg(debug_assertions)]
pub fn spawn_knowledge_watcher(
    app_handle: tauri::AppHandle,
    path: PathBuf,
    config_state: std::sync::Arc<crate::config::ConfigState>,
) {
    std::thread::spawn(move || {
        let (tx, rx) = channel();

        let mut watcher = match recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                crate::log!(LogLevel::Error, "Failed to start project watcher: {:?}", e);
                return;
            }
        };

        if let Err(e) = watcher.configure(Config::default()) {
            crate::log!(
                LogLevel::Warn,
                "Failed to configure project watcher: {:?}",
                e
            );
        }

        if let Err(e) = watcher.watch(&path, RecursiveMode::Recursive) {
            crate::log!(
                LogLevel::Error,
                "Project watcher failed to watch path: {:?}",
                e
            );
            return;
        }

        crate::log!(LogLevel::Info, "Project watcher started on {:?}", path);

        // Debounce: ignore events within 2 seconds of the last re-index
        let mut last_reindex: u64 = 0;

        for event in rx {
            match event {
                Ok(event) => {
                    // Only react to file creation/modification/deletion
                    let is_relevant = event
                        .paths
                        .iter()
                        .any(|p| p.extension().is_some_and(|ext| ext == "txt" || ext == "md"));
                    if !is_relevant {
                        continue;
                    }

                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    if now - last_reindex < 2000 {
                        continue; // debounce
                    }
                    last_reindex = now;

                    crate::log!(
                        LogLevel::Info,
                        "Project file changed, triggering RAG re-index"
                    );

                    // Spawn async re-indexing task
                    let app_handle_cloned = app_handle.clone();
                    let config = config_state.clone();
                    let knowledge_path = path.to_string_lossy().into_owned();
                    tokio::spawn(async move {
                        crate::agent::rag::handle_rag_reindex(
                            app_handle_cloned,
                            config.as_ref(),
                            &knowledge_path,
                        )
                        .await;
                    });
                }
                Err(e) => crate::log!(LogLevel::Error, "Project watcher error: {:?}", e),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knowledge_relative_path_uses_root_relative_paths() {
        let root_dir = Path::new("/tmp/knowledge");

        let root_file = root_dir.join("intro.md");
        assert_eq!(
            knowledge_relative_path(root_dir, &root_file).unwrap(),
            "intro.md"
        );

        let nested_file = root_dir.join("guide/nested/shapes.md");
        assert_eq!(
            knowledge_relative_path(root_dir, &nested_file).unwrap(),
            "guide/nested/shapes.md"
        );

        let windows_like = Path::new("/tmp/knowledge\\guide\\shapes.md");
        assert_eq!(
            knowledge_relative_path(root_dir, windows_like).unwrap(),
            "guide/shapes.md"
        );
    }
}
