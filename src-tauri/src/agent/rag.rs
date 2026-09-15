use arrow_array::{types::Float64Type, ArrayRef, FixedSizeListArray, RecordBatch, StringArray};
use lancedb;
use rig::client::{CompletionClient, EmbeddingsClient, ProviderClient};
use rig::embeddings::{Embedding, EmbeddingsBuilder};
use rig::lancedb::{LanceDbVectorIndex, SearchParams};
use rig::prelude::*;
use rig::providers::{ollama, openai, openrouter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use walkdir::WalkDir;

pub enum SupportedClient {
    OpenAi(openai::Client),
    Ollama(ollama::Client),
    OpenRouter(openrouter::Client),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DocumentRecord {
    pub id: String,
    pub text: String,
    pub file_name: String,
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
// the table, sharing the document's id, file_name, and text.
fn as_record_batch(
    records: Vec<(DocumentRecord, Vec<Embedding>)>,
    dims: usize,
) -> Result<RecordBatch, lancedb::arrow::arrow_schema::ArrowError> {
    let mut ids: Vec<String> = Vec::new();
    let mut file_names: Vec<String> = Vec::new();
    let mut texts: Vec<String> = Vec::new();
    let mut embedding_vecs: Vec<Option<Vec<Option<f64>>>> = Vec::new();

    for (record, embeddings) in records {
        for embedding in embeddings {
            ids.push(record.id.clone());
            file_names.push(record.file_name.clone());
            texts.push(record.text.clone());
            embedding_vecs.push(Some(
                embedding.vec.into_iter().map(Some).collect::<Vec<_>>(),
            ));
        }
    }

    let id = StringArray::from_iter_values(ids);
    let file_name = StringArray::from_iter_values(file_names);
    let text = StringArray::from_iter_values(texts);
    let embedding =
        FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(embedding_vecs, dims as i32);

    RecordBatch::try_from_iter(vec![
        ("id", Arc::new(id) as ArrayRef),
        ("file_name", Arc::new(file_name) as ArrayRef),
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

    let mut documents = Vec::new();
    let mut id_counter = 1;

    for entry in WalkDir::new(target_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if is_target_file(path) {
            let content = fs::read_to_string(path)?;
            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();

            documents.push(DocumentRecord {
                id: format!("doc_{}", id_counter),
                text: content,
                file_name,
            });
            id_counter += 1;
        }
    }

    if documents.is_empty() {
        return Ok(0);
    }

    let total_count = documents.len();
    let db = lancedb::connect(db_uri).execute().await?;
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
