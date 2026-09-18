use arrow_array::{types::Float64Type, ArrayRef, FixedSizeListArray, RecordBatch, StringArray};
use arrow_schema::DataType;
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
            log::info!("RAG re-index complete: {} documents", count);
            let _ = app_handle.emit("rag-reindexed", count);
        }
        Err(e) => {
            log::error!("RAG re-index failed: {}", e);
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

// Check supported source extensions independently of file existence so deletion
// events remain eligible for re-indexing.
fn is_supported_source_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("txt") || ext.eq_ignore_ascii_case("md"))
}

// Check target extension (.txt, .md)
fn is_target_file(path: &Path) -> bool {
    path.is_file() && is_supported_source_path(path)
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

    for (id_counter, entry) in (1..).zip(WalkDir::new(target_dir)) {
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
                log::error!("Failed to start project watcher: {:?}", e);
                return;
            }
        };

        if let Err(e) = watcher.configure(Config::default()) {
            log::warn!("Failed to configure project watcher: {:?}", e);
        }

        if let Err(e) = watcher.watch(&path, RecursiveMode::Recursive) {
            log::error!("Project watcher failed to watch path: {:?}", e);
            return;
        }

        log::info!("Project watcher started on {:?}", path);

        // Debounce: ignore events within 2 seconds of the last re-index
        let mut last_reindex: u64 = 0;

        for event in rx {
            match event {
                Ok(event) => {
                    // React to supported source creation, modification, and deletion.
                    // Deletion paths may no longer exist, so extension filtering is
                    // intentionally separate from is_target_file().
                    let is_relevant = event
                        .paths
                        .iter()
                        .any(|path| is_supported_source_path(path));
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

                    log::info!("Project file changed, triggering RAG re-index");

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
                Err(e) => log::error!("Project watcher error: {:?}", e),
            }
        }
    });
}

// Schema validation for the my_documents table
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableValidationResult {
    pub valid: bool,
    pub document_count: usize,
    pub error: Option<String>,
}

/// Validate the my_documents table schema and content
pub async fn validate_my_documents_table(
    db_uri: &str,
    expected_dims: usize,
) -> Result<TableValidationResult, Box<dyn std::error::Error>> {
    let db = lancedb::connect(db_uri).execute().await?;

    // Check if table exists
    let table_names = db.table_names().execute().await?;
    if !table_names.contains(&"my_documents".to_string()) {
        return Ok(TableValidationResult {
            valid: false,
            document_count: 0,
            error: Some("Table 'my_documents' does not exist".to_string()),
        });
    }

    let table = db.open_table("my_documents").execute().await?;

    // Validate the persisted Arrow schema without mutating the table.
    let schema = table.schema().await?;
    let fields = schema.fields();

    // Required fields
    let required_fields = ["id", "relative_path", "text", "embedding"];
    for field_name in required_fields {
        if !fields
            .iter()
            .any(|field| field.name().as_str() == field_name)
        {
            return Ok(TableValidationResult {
                valid: false,
                document_count: 0,
                error: Some(format!("Missing required field: {}", field_name)),
            });
        }
    }

    // Validate field types
    for field in fields {
        match field.name().as_str() {
            "id" | "relative_path" | "text" => {
                if !matches!(field.data_type(), DataType::Utf8) {
                    return Ok(TableValidationResult {
                        valid: false,
                        document_count: 0,
                        error: Some(format!(
                            "Field '{}' must be UTF-8 string, got {:?}",
                            field.name(),
                            field.data_type()
                        )),
                    });
                }
            }
            "embedding" => {
                if let DataType::FixedSizeList(inner_field, list_size) = field.data_type() {
                    if *list_size as usize != expected_dims {
                        return Ok(TableValidationResult {
                            valid: false,
                            document_count: 0,
                            error: Some(format!(
                                "Embedding dimension mismatch: expected {}, got {}",
                                expected_dims, list_size
                            )),
                        });
                    }
                    if !matches!(inner_field.data_type(), DataType::Float64) {
                        return Ok(TableValidationResult {
                            valid: false,
                            document_count: 0,
                            error: Some(format!(
                                "Embedding inner type must be Float64, got {:?}",
                                inner_field.data_type()
                            )),
                        });
                    }
                } else {
                    return Ok(TableValidationResult {
                        valid: false,
                        document_count: 0,
                        error: Some(format!(
                            "Embedding field must be FixedSizeList, got {:?}",
                            field.data_type()
                        )),
                    });
                }
            }
            _ => {
                // Extra columns are allowed for forward compatibility
            }
        }
    }

    // Check row count
    let count = table.count_rows(None).await? as usize;
    if count == 0 {
        return Ok(TableValidationResult {
            valid: false,
            document_count: 0,
            error: Some("Table 'my_documents' has zero rows".to_string()),
        });
    }

    Ok(TableValidationResult {
        valid: true,
        document_count: count,
        error: None,
    })
}

/// Discover supported source files recursively
pub fn discover_source_files(target_dir: &str) -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    let mut files = Vec::new();

    for entry in WalkDir::new(target_dir).into_iter() {
        let entry = entry?;
        let path = entry.path();
        if is_target_file(path) {
            files.push(path.to_path_buf());
        }
    }

    Ok(files)
}

/// Create document records from source files
pub fn create_document_records(
    root_dir: &Path,
    files: Vec<PathBuf>,
) -> Result<Vec<DocumentRecord>, Box<dyn std::error::Error>> {
    let mut documents = Vec::new();

    for (id_counter, path) in (1..).zip(files) {
        let content = fs::read_to_string(&path)?;
        let relative_path = knowledge_relative_path(root_dir, &path)?;

        documents.push(DocumentRecord {
            id: format!("doc_{}", id_counter),
            text: content,
            relative_path,
        });
    }

    Ok(documents)
}

/// Build record batch from documents and embeddings
pub fn build_record_batch(
    records: Vec<(DocumentRecord, Vec<Embedding>)>,
    dims: usize,
) -> Result<RecordBatch, lancedb::arrow::arrow_schema::ArrowError> {
    as_record_batch(records, dims)
}

/// Write record batch to my_documents table (replaces existing)
pub async fn write_my_documents_table(
    db_uri: &str,
    record_batch: RecordBatch,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = lancedb::connect(db_uri).execute().await?;
    let _ = db.drop_table("my_documents", &[]).await;
    let _table = db
        .create_table("my_documents", vec![record_batch])
        .execute()
        .await?;
    Ok(())
}

/// Non-destructive initial ingestion: only builds if table is absent or invalid
pub async fn ensure_initial_index(
    provider: &str,
    embedding_model_name: &str,
    target_dir: &str,
    db_uri: &str,
) -> Result<TableValidationResult, Box<dyn std::error::Error>> {
    // First, validate existing table
    let client_enum = create_llm_client(provider)?;
    let expected_dims = match &client_enum {
        SupportedClient::OpenAi(client) => client.embedding_model(embedding_model_name).ndims(),
        SupportedClient::Ollama(client) => client.embedding_model(embedding_model_name).ndims(),
        SupportedClient::OpenRouter(client) => client.embedding_model(embedding_model_name).ndims(),
    };

    let validation = validate_my_documents_table(db_uri, expected_dims).await?;
    if validation.valid {
        return Ok(validation);
    }

    // Table is absent or invalid - discover source files
    let source_files = discover_source_files(target_dir)?;
    if source_files.is_empty() {
        return Ok(TableValidationResult {
            valid: false,
            document_count: 0,
            error: Some(
                "No supported source documents (.md, .txt) found in knowledge directory"
                    .to_string(),
            ),
        });
    }

    // Create document records
    let root_dir = Path::new(target_dir);
    let documents = create_document_records(root_dir, source_files)?;

    // Generate embeddings
    let embeddings = match client_enum {
        SupportedClient::OpenAi(client) => {
            let model = client.embedding_model(embedding_model_name);
            EmbeddingsBuilder::new(model.clone())
                .documents(documents)?
                .build()
                .await?
        }
        SupportedClient::Ollama(client) => {
            let model = client.embedding_model(embedding_model_name);
            EmbeddingsBuilder::new(model.clone())
                .documents(documents)?
                .build()
                .await?
        }
        SupportedClient::OpenRouter(client) => {
            let model = client.embedding_model(embedding_model_name);
            EmbeddingsBuilder::new(model.clone())
                .documents(documents)?
                .build()
                .await?
        }
    };

    // Build record batch
    let record_batch = build_record_batch(embeddings, expected_dims)?;

    // Write table
    write_my_documents_table(db_uri, record_batch).await?;

    // Revalidate
    validate_my_documents_table(db_uri, expected_dims).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_array::types::Int64Type;
    use arrow_array::{ArrayRef, FixedSizeListArray, Int64Array, RecordBatch, StringArray};
    use std::sync::Arc;
    use tempfile::tempdir;

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

    #[test]
    fn is_target_file_filters_correctly() {
        let dir = tempdir().unwrap();
        let md_file = dir.path().join("test.md");
        let txt_file = dir.path().join("test.txt");
        let rs_file = dir.path().join("test.rs");
        let subdir = dir.path().join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        let nested_md = subdir.join("nested.md");

        fs::write(&md_file, "test").unwrap();
        fs::write(&txt_file, "test").unwrap();
        fs::write(&rs_file, "test").unwrap();
        fs::write(&nested_md, "test").unwrap();

        assert!(is_target_file(&md_file));
        assert!(is_target_file(&txt_file));
        assert!(!is_target_file(&rs_file));
        assert!(is_target_file(&nested_md));
        assert!(!is_target_file(&subdir)); // directory
    }

    #[test]
    fn discover_source_files_finds_md_and_txt() {
        let dir = tempdir().unwrap();
        let md_file = dir.path().join("test.md");
        let txt_file = dir.path().join("test.txt");
        let upper_md_file = dir.path().join("test.MD");
        let upper_txt_file = dir.path().join("test.TXT");
        let rs_file = dir.path().join("test.rs");
        let subdir = dir.path().join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        let nested_md = subdir.join("nested.md");

        fs::write(&md_file, "test").unwrap();
        fs::write(&txt_file, "test").unwrap();
        fs::write(&upper_md_file, "test").unwrap();
        fs::write(&upper_txt_file, "test").unwrap();
        fs::write(&rs_file, "test").unwrap();
        fs::write(&nested_md, "test").unwrap();

        let files = discover_source_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(files.len(), 5);
        assert!(files.iter().any(|f| f.ends_with("test.md")));
        assert!(files.iter().any(|f| f.ends_with("test.txt")));
        assert!(files.iter().any(|f| f.ends_with("test.MD")));
        assert!(files.iter().any(|f| f.ends_with("test.TXT")));
        assert!(files.iter().any(|f| f.ends_with("nested.md")));
        assert!(!files.iter().any(|f| f.ends_with("test.rs")));
    }

    async fn write_validation_table(db_uri: &str, batch: RecordBatch) {
        let db = lancedb::connect(db_uri).execute().await.unwrap();
        let _ = db.drop_table("my_documents", &[]).await;
        db.create_table("my_documents", vec![batch])
            .execute()
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn validates_a_non_empty_compatible_table() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(
            vec![Some(vec![Some(1.0), Some(2.0)])],
            2,
        );
        let batch = RecordBatch::try_from_iter(vec![
            ("id", Arc::new(StringArray::from(vec!["1"])) as ArrayRef),
            (
                "relative_path",
                Arc::new(StringArray::from(vec!["one.md"])) as ArrayRef,
            ),
            (
                "text",
                Arc::new(StringArray::from(vec!["content"])) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
            (
                "extra",
                Arc::new(StringArray::from(vec!["allowed"])) as ArrayRef,
            ),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 2).await.unwrap();
        assert!(result.valid);
        assert_eq!(result.document_count, 1);
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn rejects_a_table_missing_a_required_column() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(
            vec![Some(vec![Some(1.0)])],
            1,
        );
        let batch = RecordBatch::try_from_iter(vec![
            ("id", Arc::new(StringArray::from(vec!["1"])) as ArrayRef),
            (
                "text",
                Arc::new(StringArray::from(vec!["content"])) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 1).await.unwrap();
        assert!(!result.valid);
        assert_eq!(
            result.error.as_deref(),
            Some("Missing required field: relative_path")
        );
    }

    #[tokio::test]
    async fn rejects_non_utf8_required_fields() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(
            vec![Some(vec![Some(1.0)])],
            1,
        );
        let batch = RecordBatch::try_from_iter(vec![
            ("id", Arc::new(StringArray::from(vec!["1"])) as ArrayRef),
            (
                "relative_path",
                Arc::new(Int64Array::from(vec![1])) as ArrayRef,
            ),
            (
                "text",
                Arc::new(StringArray::from(vec!["content"])) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 1).await.unwrap();
        assert!(!result.valid);
        assert!(result
            .error
            .as_deref()
            .unwrap()
            .contains("must be UTF-8 string"));
    }

    #[tokio::test]
    async fn rejects_wrong_embedding_element_type() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Int64Type, _, _>(
            vec![Some(vec![Some(1)])],
            1,
        );
        let batch = RecordBatch::try_from_iter(vec![
            ("id", Arc::new(StringArray::from(vec!["1"])) as ArrayRef),
            (
                "relative_path",
                Arc::new(StringArray::from(vec!["one.md"])) as ArrayRef,
            ),
            (
                "text",
                Arc::new(StringArray::from(vec!["content"])) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 1).await.unwrap();
        assert!(!result.valid);
        assert!(result
            .error
            .as_deref()
            .unwrap()
            .contains("inner type must be Float64"));
    }

    #[tokio::test]
    async fn rejects_wrong_embedding_width() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(
            vec![Some(vec![Some(1.0), Some(2.0)])],
            2,
        );
        let batch = RecordBatch::try_from_iter(vec![
            ("id", Arc::new(StringArray::from(vec!["1"])) as ArrayRef),
            (
                "relative_path",
                Arc::new(StringArray::from(vec!["one.md"])) as ArrayRef,
            ),
            (
                "text",
                Arc::new(StringArray::from(vec!["content"])) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 1).await.unwrap();
        assert!(!result.valid);
        assert!(result
            .error
            .as_deref()
            .unwrap()
            .contains("Embedding dimension mismatch"));
    }

    #[tokio::test]
    async fn rejects_a_zero_row_table() {
        let dir = tempdir().unwrap();
        let db_uri = dir.path().join("db").to_string_lossy().into_owned();
        let embedding = FixedSizeListArray::from_iter_primitive::<Float64Type, _, _>(
            Vec::<Option<Vec<Option<f64>>>>::new(),
            2,
        );
        let batch = RecordBatch::try_from_iter(vec![
            (
                "id",
                Arc::new(StringArray::from(Vec::<String>::new())) as ArrayRef,
            ),
            (
                "relative_path",
                Arc::new(StringArray::from(Vec::<String>::new())) as ArrayRef,
            ),
            (
                "text",
                Arc::new(StringArray::from(Vec::<String>::new())) as ArrayRef,
            ),
            ("embedding", Arc::new(embedding) as ArrayRef),
        ])
        .unwrap();
        write_validation_table(&db_uri, batch).await;

        let result = validate_my_documents_table(&db_uri, 2).await.unwrap();
        assert!(!result.valid);
        assert_eq!(
            result.error.as_deref(),
            Some("Table 'my_documents' has zero rows")
        );
    }
}
