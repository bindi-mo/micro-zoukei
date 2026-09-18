use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::Emitter;

/// Lifecycle state for initial indexing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum InitialIndexStatus {
    #[default]
    Idle,
    InProgress,
    Complete,
    Failed,
}

/// Response for the ensure_initial_index command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureInitialIndexResponse {
    pub status: String, // "already_valid" | "in_progress" | "started"
    pub valid: bool,
    pub document_count: usize,
}

/// Event payload for initial-index-status events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialIndexStatusEvent {
    pub status: String, // "started" | "completed" | "failed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// State manager for initial indexing lifecycle
#[derive(Debug, Default)]
pub struct InitialIndexState {
    status: InitialIndexStatus,
    document_count: usize,
    error: Option<String>,
}

impl InitialIndexState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn status(&self) -> InitialIndexStatus {
        self.status
    }

    pub fn document_count(&self) -> usize {
        self.document_count
    }

    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn set_in_progress(&mut self) {
        self.status = InitialIndexStatus::InProgress;
        self.error = None;
    }

    pub fn set_complete(&mut self, document_count: usize) {
        self.status = InitialIndexStatus::Complete;
        self.document_count = document_count;
        self.error = None;
    }

    pub fn set_failed(&mut self, error: String) {
        self.status = InitialIndexStatus::Failed;
        self.error = Some(error);
    }

    pub fn set_idle(&mut self) {
        self.status = InitialIndexStatus::Idle;
        self.document_count = 0;
        self.error = None;
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            InitialIndexStatus::Complete | InitialIndexStatus::Failed
        )
    }
}

/// Thread-safe wrapper for the initial index state
#[derive(Debug, Default, Clone)]
pub struct InitialIndexManager {
    inner: Arc<Mutex<InitialIndexState>>,
    watcher_started: Arc<AtomicBool>,
}

impl InitialIndexManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get current status without holding the lock across await
    pub fn get_status(&self) -> InitialIndexStatus {
        self.inner.lock().unwrap().status()
    }

    /// Get current document count
    pub fn get_document_count(&self) -> usize {
        self.inner.lock().unwrap().document_count()
    }

    /// Get current error
    pub fn get_error(&self) -> Option<String> {
        self.inner.lock().unwrap().error().map(|s| s.to_string())
    }

    /// Transition to InProgress state when no job is active.
    pub fn try_start_indexing(&self) -> bool {
        let mut state = self.inner.lock().unwrap();
        if matches!(
            state.status(),
            InitialIndexStatus::InProgress | InitialIndexStatus::Complete
        ) {
            return false;
        }
        state.set_in_progress();
        true
    }

    /// Mark the debug knowledge watcher as started exactly once.
    pub fn mark_watcher_started(&self) -> bool {
        self.watcher_started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    /// Transition to Complete state
    pub fn complete_indexing(&self, document_count: usize) {
        self.inner.lock().unwrap().set_complete(document_count);
    }

    /// Transition to Failed state
    pub fn fail_indexing(&self, error: String) {
        self.inner.lock().unwrap().set_failed(error);
    }

    /// Reset to Idle state
    pub fn reset(&self) {
        self.inner.lock().unwrap().set_idle();
    }

    /// Check if in a terminal state
    pub fn is_terminal(&self) -> bool {
        self.inner.lock().unwrap().is_terminal()
    }

    /// Emit an initial-index-status event
    pub fn emit_status_event<R: tauri::Runtime>(
        &self,
        app_handle: &tauri::AppHandle<R>,
        event: InitialIndexStatusEvent,
    ) {
        let _ = app_handle.emit("initial-index-status", event);
    }
}
