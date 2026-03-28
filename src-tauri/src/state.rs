use std::{
  path::PathBuf,
  process::{Child, ChildStdin},
  sync::{Arc, Mutex},
};

use crate::voice::VoiceWorker;

#[derive(Clone)]
pub struct AppState {
  pub db_path: Arc<PathBuf>,
  pub app_data_dir: Arc<PathBuf>,
  pub recent_events: Arc<Mutex<Vec<String>>>,
  pub last_initialized_at: Arc<String>,
  pub voice_worker: Arc<Mutex<Option<VoiceWorker>>>,
  pub speech_stream_worker: Arc<Mutex<Option<SpeechStreamWorker>>>,
  pub kokoro_fastapi_runtime: Arc<Mutex<Option<ManagedKokoroFastApiRuntime>>>,
  pub active_call_session_id: Arc<Mutex<Option<i64>>>,
}

#[derive(Debug, Clone, Default)]
pub struct SpeechStreamSnapshotState {
  pub active: bool,
  pub started_at: Option<String>,
  pub partial_text: String,
  pub final_text: String,
  pub status: String,
  pub last_error: Option<String>,
}

pub struct SpeechStreamWorker {
  pub child: Child,
  pub stdin: ChildStdin,
  pub snapshot: Arc<Mutex<SpeechStreamSnapshotState>>,
}

pub struct ManagedKokoroFastApiRuntime {
  pub child: Child,
  pub working_dir: PathBuf,
  pub started_at: String,
}

impl AppState {
  pub fn push_event(&self, event: impl Into<String>) {
    let mut events = self.recent_events.lock().expect("recent event mutex poisoned");
    events.push(event.into());

    if events.len() > 12 {
      let drain_count = events.len() - 12;
      events.drain(0..drain_count);
    }
  }

  pub fn events(&self) -> Vec<String> {
    self
      .recent_events
      .lock()
      .expect("recent event mutex poisoned")
      .clone()
  }
}
