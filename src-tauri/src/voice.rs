use std::{
  collections::BTreeMap,
  fs,
  io::{BufRead, BufReader, Write},
  path::{Path, PathBuf},
  process::{Child, ChildStdin, ChildStdout, Command, Stdio},
  sync::{mpsc, Mutex},
  thread,
  time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use serde_json::{json, Value};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
  error::AppError,
  models::{AppSettings, CallTurnResult, NorthStarLiveReplyStreamEvent, VoiceSnapshot, VoiceSynthesisResult},
  state::{ManagedKokoroFastApiRuntime, SpeechStreamSnapshotState, SpeechStreamWorker},
};

const KOKORO_SCRIPT: &str = include_str!("../scripts/kokoro_speak.py");
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const KOKORO_MODEL_FILE: &str = "kokoro-v1.0.int8.onnx";
const KOKORO_VOICES_FILE: &str = "voices-v1.0.bin";
const KOKORO_MODEL_URL: &str = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx";
const KOKORO_VOICES_URL: &str = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin";
const KOKORO_FASTAPI_REPO_URL: &str = "https://github.com/remsky/Kokoro-FastAPI.git";
const MOONSHINE_MODEL_DIR_NAME: &str = "tiny-streaming-en";
const MOONSHINE_MODEL_BASE_URL: &str = "https://download.moonshine.ai/model/tiny-streaming-en/quantized";
const MOONSHINE_MODEL_FILES: [&str; 7] = [
  "adapter.ort",
  "cross_kv.ort",
  "decoder_kv.ort",
  "encoder.ort",
  "frontend.ort",
  "streaming_config.json",
  "tokenizer.bin",
];
const DEFAULT_TEST_PHRASE: &str = "Hey, I am here with you for a moment.";
const DEFAULT_CALL_REPLY: &str = "I had a little trouble with that reply just then. Can you ask it once more?";
const DEFAULT_CALL_REPLY_PLAYFUL: &str = "Maybe just a croak or two.";
const DEFAULT_CALL_REPLY_POSITIVE: &str = "That sounds really nice.";
const DEFAULT_CALL_REPLY_MODEL_ISSUE: &str = "I had a little trouble responding just then. Can you say that again?";

pub struct VoiceWorker {
  child: Child,
  stdin: ChildStdin,
  stdout: BufReader<ChildStdout>,
}

#[derive(Debug, Clone)]
struct VoicePaths {
  model_path: PathBuf,
  voices_path: PathBuf,
  previews_dir: PathBuf,
  speech_model_dir: PathBuf,
  recordings_dir: PathBuf,
}

pub fn voice_snapshot(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_loaded: bool,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
) -> Result<VoiceSnapshot, AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  let managed_runtime = uses_managed_local_fastapi(settings);
  let managed_root = managed_fastapi_root(app_data_dir);
  let managed_logs_dir = managed_root.join("runtime-logs");
  fs::create_dir_all(&paths.previews_dir)?;
  fs::create_dir_all(&paths.recordings_dir)?;

  let mut missing_files = Vec::new();
  let tts_uses_remote_kokoro = tts_uses_fastapi(settings);
  if !tts_uses_remote_kokoro {
    if !paths.model_path.exists() {
      missing_files.push(KOKORO_MODEL_FILE.to_string());
    }
    if !paths.voices_path.exists() {
      missing_files.push(KOKORO_VOICES_FILE.to_string());
    }
  }

  let speech_ready = speech_model_files_exist(&paths.speech_model_dir);
  let runtime_ready = if tts_uses_remote_kokoro {
    match managed_fastapi_health(settings) {
      Ok(true) => true,
      _ => kokoro_runtime_slot
        .lock()
        .map_err(|_| AppError::Message("Kokoro-FastAPI runtime mutex was poisoned.".into()))?
        .as_mut()
        .map(|runtime| runtime.child.try_wait().ok().flatten().is_none())
        .unwrap_or(false),
    }
  } else {
    worker_loaded || python_command().is_some()
  };
  Ok(VoiceSnapshot {
    provider: settings.tts_provider.clone(),
    model_id: settings.tts_model_id.clone(),
    sample_rate: settings.tts_sample_rate,
    default_voice: settings.tts_default_voice.clone(),
    model_path: paths.model_path.display().to_string(),
    voices_path: paths.voices_path.display().to_string(),
    previews_dir: paths.previews_dir.display().to_string(),
    speech_model_path: paths.speech_model_dir.display().to_string(),
    files_ready: missing_files.is_empty(),
    missing_files,
    runtime_ready,
    runtime_detail: if tts_uses_remote_kokoro {
      if settings.tts_endpoint.trim().is_empty() {
        "Kokoro-FastAPI endpoint is not configured.".into()
      } else if managed_fastapi_health(settings).unwrap_or(false) {
        format!("Managed Kokoro-FastAPI is reachable at {}.", settings.tts_endpoint.trim())
      } else {
        format!("Kokoro-FastAPI is configured for {} but is not reachable yet.", settings.tts_endpoint.trim())
      }
    } else if worker_loaded {
      "Voice runtime is ready.".into()
    } else {
      "Voice runtime is available after setup.".into()
    },
    managed_runtime,
    runtime_endpoint: settings.tts_endpoint.trim().to_string(),
    runtime_root: managed_root.display().to_string(),
    runtime_stdout_log: managed_logs_dir.join("kokoro-fastapi.stdout.log").display().to_string(),
    runtime_stderr_log: managed_logs_dir.join("kokoro-fastapi.stderr.log").display().to_string(),
    speech_ready,
    speech_runtime_ready: speech_ready,
    speech_runtime_detail: if speech_ready {
      "Local speech input is ready.".into()
    } else {
      "Speech input model is missing. Set up voice first.".into()
    },
    example_voices: vec!["af_heart".into(), "af_bella".into(), "af_nicole".into(), "af_sky".into()],
  })
}

pub fn download_kokoro_assets(app_data_dir: &Path, settings: &AppSettings) -> Result<(), AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  if let Some(parent) = paths.model_path.parent() {
    fs::create_dir_all(parent)?;
  }
  let client = Client::new();
  download_file_if_missing(&client, KOKORO_MODEL_URL, &paths.model_path)?;
  download_file_if_missing(&client, KOKORO_VOICES_URL, &paths.voices_path)?;
  Ok(())
}

pub fn prepare_python_runtime(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
) -> Result<(), AppError> {
  if tts_uses_fastapi(settings) {
    ensure_managed_kokoro_fastapi_runtime(app_data_dir, settings, kokoro_runtime_slot)?;
    return Ok(());
  }
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  ensure_python_script(app_data_dir)?;
  let output = hidden_command(&python)
    .args(["-m", "pip", "install", "-U", "kokoro-onnx", "soundfile", "moonshine-voice", "sounddevice", "numpy"])
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let mut guard = worker_slot.lock().map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?;
  let _ = ensure_voice_worker(app_data_dir, settings, &mut guard)?;
  Ok(())
}

pub fn setup_local_speech(
  app_data_dir: &Path,
  settings: &AppSettings,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<(), AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  if let Some(parent) = paths.speech_model_dir.parent() {
    fs::create_dir_all(parent)?;
  }
  let output = hidden_command(&python)
    .args(["-m", "pip", "install", "-U", "moonshine-voice", "sounddevice", "numpy"])
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  download_moonshine_model_if_missing(&paths.speech_model_dir)
    .and_then(|_| {
      let mut guard = speech_worker_slot
        .lock()
        .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
      let _ = ensure_speech_worker(app_data_dir, settings, &mut guard)?;
      Ok(())
    })
}

fn ensure_speech_worker<'a>(
  app_data_dir: &Path,
  settings: &AppSettings,
  speech_worker_slot: &'a mut Option<SpeechStreamWorker>,
) -> Result<&'a mut SpeechStreamWorker, AppError> {
  let worker_is_running = match speech_worker_slot {
    Some(worker) => worker.child.try_wait()?.is_none(),
    None => false,
  };
  if worker_is_running {
    return speech_worker_slot
      .as_mut()
      .ok_or_else(|| AppError::Message("Speech worker disappeared unexpectedly.".into()));
  }

  *speech_worker_slot = None;
  let paths = resolve_voice_paths(app_data_dir, settings);
  if !speech_model_files_exist(&paths.speech_model_dir) {
    return Err(AppError::Message("Speech input model is missing. Set up voice first.".into()));
  }

  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  let mut child = hidden_command(&python)
    .arg(&script_path)
    .arg("--speech-worker")
    .arg("--stt-model")
    .arg(&paths.speech_model_dir)
    .arg("--sample-rate")
    .arg("16000")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| AppError::Message("Speech worker did not expose stdin.".into()))?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| AppError::Message("Speech worker did not expose stdout.".into()))?;
  let mut stdout = BufReader::new(stdout);
  let mut ready_line = String::new();
  let read_count = stdout.read_line(&mut ready_line)?;
  if read_count == 0 {
    return Err(AppError::Message("Speech worker did not start correctly.".into()));
  }
  let ready_payload: Value = serde_json::from_str(ready_line.trim())?;
  if ready_payload.get("event").and_then(|value| value.as_str()) != Some("worker_ready") {
    return Err(AppError::Message(
      ready_payload
        .get("text")
        .and_then(|value| value.as_str())
        .unwrap_or("Speech worker failed to initialize.")
        .to_string(),
    ));
  }

  let snapshot = std::sync::Arc::new(Mutex::new(SpeechStreamSnapshotState::default()));
  let snapshot_reader = snapshot.clone();
  thread::spawn(move || {
    let mut reader = stdout;
    loop {
      let mut line = String::new();
      match reader.read_line(&mut line) {
        Ok(0) => break,
        Ok(_) => {
          let trimmed = line.trim();
          if trimmed.is_empty() {
            continue;
          }
          let Ok(payload): Result<Value, _> = serde_json::from_str(trimmed) else {
            continue;
          };
          let event = payload.get("event").and_then(|value| value.as_str()).unwrap_or("");
          let text = payload.get("text").and_then(|value| value.as_str()).unwrap_or("").to_string();
          if let Ok(mut state) = snapshot_reader.lock() {
            match event {
              "ready" => {
                state.active = true;
                state.status = "listening".into();
                state.last_error = None;
              }
              "partial" => {
                state.partial_text = text;
                state.status = "listening".into();
              }
              "final" => {
                state.final_text = text;
                state.status = "processing".into();
              }
              "stopped" => {
                state.active = false;
                state.final_text = text;
                state.status = "stopped".into();
              }
              "error" => {
                state.last_error = Some(text);
                state.status = "error".into();
              }
              "shutdown" => {
                state.active = false;
                state.status = "idle".into();
                break;
              }
              _ => {}
            }
          }
        }
        Err(_) => break,
      }
    }
  });

  *speech_worker_slot = Some(SpeechStreamWorker { child, stdin, snapshot });
  speech_worker_slot
    .as_mut()
    .ok_or_else(|| AppError::Message("Speech worker was not available after startup.".into()))
}

fn send_speech_worker_command(worker: &mut SpeechStreamWorker, payload: &Value) -> Result<(), AppError> {
  let line = serde_json::to_string(payload)?;
  writeln!(worker.stdin, "{line}")?;
  worker.stdin.flush()?;
  Ok(())
}

fn wait_for_speech_stream_state<F>(
  snapshot: &std::sync::Arc<Mutex<SpeechStreamSnapshotState>>,
  timeout: Duration,
  predicate: F,
) -> Result<(), AppError>
where
  F: Fn(&SpeechStreamSnapshotState) -> bool,
{
  let started = Instant::now();
  loop {
    let current = snapshot
      .lock()
      .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
      .clone();
    if predicate(&current) {
      return Ok(());
    }
    if started.elapsed() >= timeout {
      return Err(AppError::Message("Speech stream state transition timed out.".into()));
    }
    thread::sleep(Duration::from_millis(25));
  }
}

pub fn speech_stream_snapshot(
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<SpeechStreamSnapshotState, AppError> {
  let guard = speech_worker_slot
    .lock()
    .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
  if let Some(worker) = guard.as_ref() {
    let snapshot = worker
      .snapshot
      .lock()
      .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?;
    return Ok(snapshot.clone());
  }
  Ok(SpeechStreamSnapshotState::default())
}

pub fn start_speech_stream(
  app_data_dir: &Path,
  settings: &AppSettings,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<SpeechStreamSnapshotState, AppError> {
  let mut guard = speech_worker_slot
    .lock()
    .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
  let worker = ensure_speech_worker(app_data_dir, settings, &mut guard)?;
  let existing_snapshot = worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .clone();
  if existing_snapshot.active
    || matches!(existing_snapshot.status.as_str(), "starting" | "listening" | "processing")
  {
    send_speech_worker_command(worker, &json!({ "command": "stop" }))?;
    wait_for_speech_stream_state(&worker.snapshot, Duration::from_secs(3), |snapshot| {
      !snapshot.active || snapshot.status == "stopped" || snapshot.last_error.is_some()
    })?;
  }
  {
    let mut snapshot = worker
      .snapshot
      .lock()
      .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?;
    snapshot.active = true;
    snapshot.started_at = Some(Utc::now().to_rfc3339());
    snapshot.partial_text.clear();
    snapshot.final_text.clear();
    snapshot.status = "starting".into();
    snapshot.last_error = None;
  }
  send_speech_worker_command(worker, &json!({ "command": "start" }))?;
  wait_for_speech_stream_state(&worker.snapshot, Duration::from_secs(2), |snapshot| {
    snapshot.status == "listening" || snapshot.last_error.is_some()
  })?;
  let snapshot = worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .clone();
  if let Some(error) = snapshot.last_error.clone() {
    return Err(AppError::Message(error));
  }
  Ok(snapshot)
}

pub fn stop_speech_stream_and_reply(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  session_context: &str,
) -> Result<CallTurnResult, AppError> {
  let mut guard = speech_worker_slot
    .lock()
    .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
  let worker = guard
    .as_mut()
    .ok_or_else(|| AppError::Message("Speech stream worker is not running.".into()))?;
  send_speech_worker_command(worker, &json!({ "command": "stop" }))?;
  wait_for_speech_stream_state(&worker.snapshot, Duration::from_secs(3), |snapshot| {
    snapshot.status == "stopped" || snapshot.last_error.is_some()
  })?;
  let snapshot = worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .clone();
  if let Some(error) = snapshot.last_error.clone() {
    return Err(AppError::Message(error));
  }
  let transcript_text = if snapshot.final_text.trim().is_empty() {
    snapshot.partial_text.trim().to_string()
  } else {
    snapshot.final_text.trim().to_string()
  };
  if transcript_text.is_empty() {
    return Err(AppError::Message("Speech stream produced no transcript.".into()));
  }
  build_call_turn_result(
    app_data_dir,
    settings,
    worker_slot,
    kokoro_runtime_slot,
    session_id,
    &transcript_text,
    session_context,
  )
}

pub fn stop_speech_stream_and_stream_reply<F>(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  session_context: &str,
  request_id: &str,
  mut emit_event: F,
) -> Result<CallTurnResult, AppError>
where
  F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
{
  let mut guard = speech_worker_slot
    .lock()
    .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
  let worker = guard
    .as_mut()
    .ok_or_else(|| AppError::Message("Speech stream worker is not running.".into()))?;
  send_speech_worker_command(worker, &json!({ "command": "stop" }))?;
  wait_for_speech_stream_state(&worker.snapshot, Duration::from_secs(3), |snapshot| {
    snapshot.status == "stopped" || snapshot.last_error.is_some()
  })?;
  let snapshot = worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .clone();
  if let Some(error) = snapshot.last_error.clone() {
    return Err(AppError::Message(error));
  }
  let transcript_text = if snapshot.final_text.trim().is_empty() {
    snapshot.partial_text.trim().to_string()
  } else {
    snapshot.final_text.trim().to_string()
  };
  if transcript_text.is_empty() {
    return Err(AppError::Message("Speech stream produced no transcript.".into()));
  }
  stream_call_turn_for_transcript(
    app_data_dir,
    settings,
    worker_slot,
    kokoro_runtime_slot,
    session_id,
    &transcript_text,
    session_context,
    request_id,
    &mut emit_event,
  )
}

pub fn push_speech_stream_audio(
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
  _session_id: i64,
  audio_base64: &str,
  sample_rate: i32,
  audio_format: &str,
) -> Result<SpeechStreamSnapshotState, AppError> {
  let mut guard = speech_worker_slot
    .lock()
    .map_err(|_| AppError::Message("Speech worker mutex was poisoned.".into()))?;
  let worker = guard
    .as_mut()
    .ok_or_else(|| AppError::Message("Speech stream worker is not running.".into()))?;
  if !worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .active
  {
    return Err(AppError::Message("Speech stream is not active.".into()));
  }
  send_speech_worker_command(worker, &json!({
    "command": "add_audio",
    "audio_base64": audio_base64,
    "sample_rate": sample_rate,
    "audio_format": audio_format,
  }))?;
  let snapshot = worker
    .snapshot
    .lock()
    .map_err(|_| AppError::Message("Speech stream snapshot mutex was poisoned.".into()))?
    .clone();
  Ok(snapshot)
}

pub fn run_call_turn(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  duration_seconds: i64,
  session_context: &str,
) -> Result<CallTurnResult, AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  fs::create_dir_all(&paths.recordings_dir)?;
  let recording_path = paths
    .recordings_dir
    .join(format!("call-input-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  let output = hidden_command(&python)
    .arg(&script_path)
    .arg("--record-transcribe")
    .arg("--stt-model")
    .arg(&paths.speech_model_dir)
    .arg("--output")
    .arg(&recording_path)
    .arg("--duration")
    .arg(duration_seconds.max(1).to_string())
    .arg("--sample-rate")
    .arg("16000")
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  let transcript_text = parsed.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
  if transcript_text.is_empty() {
    return Err(AppError::Message("I could not hear a clear spoken turn yet. Try again a little closer to the microphone.".into()));
  }
  build_call_turn_result(app_data_dir, settings, worker_slot, kokoro_runtime_slot, session_id, &transcript_text, session_context)
}

pub fn run_uploaded_call_turn(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  input_audio_wav: &[u8],
  session_context: &str,
) -> Result<CallTurnResult, AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  fs::create_dir_all(&paths.recordings_dir)?;
  let recording_path = paths
    .recordings_dir
    .join(format!("north-star-call-input-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  fs::write(&recording_path, input_audio_wav)?;
  let output = hidden_command(&python)
    .arg(&script_path)
    .arg("--transcribe-file")
    .arg("--stt-model")
    .arg(&paths.speech_model_dir)
    .arg("--input")
    .arg(&recording_path)
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  let transcript_text = parsed.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
  if transcript_text.is_empty() {
    return Err(AppError::Message("I could not hear a clear spoken turn from North Star yet. Try again a little closer to the microphone.".into()));
  }
  build_call_turn_result(app_data_dir, settings, worker_slot, kokoro_runtime_slot, session_id, &transcript_text, session_context)
}

pub fn synthesize_test_phrase(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
) -> Result<VoiceSynthesisResult, AppError> {
  let voice_name = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, DEFAULT_TEST_PHRASE, voice_name)?;
  let output_path = resolve_voice_paths(app_data_dir, settings)
    .previews_dir
    .join(format!("voice-preview-{}.wav", Utc::now().timestamp_millis()));
  if let Some(parent) = output_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&output_path, &audio_bytes)?;
  Ok(VoiceSynthesisResult {
    provider: settings.tts_provider.clone(),
    voice: voice_name.to_string(),
    text: sanitize_text(DEFAULT_TEST_PHRASE),
    sample_rate: settings.tts_sample_rate,
    output_path: output_path.display().to_string(),
    audio_base64: STANDARD.encode(audio_bytes),
  })
}

pub fn synthesize_phrase(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  text: &str,
) -> Result<VoiceSynthesisResult, AppError> {
  let voice_name = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, text, voice_name)?;
  let output_path = resolve_voice_paths(app_data_dir, settings)
    .previews_dir
    .join(format!("voice-line-{}.wav", Utc::now().timestamp_millis()));
  if let Some(parent) = output_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&output_path, &audio_bytes)?;
  Ok(VoiceSynthesisResult {
    provider: settings.tts_provider.clone(),
    voice: voice_name.to_string(),
    text: sanitize_text(text),
    sample_rate: settings.tts_sample_rate,
    output_path: output_path.display().to_string(),
    audio_base64: STANDARD.encode(audio_bytes),
  })
}

pub fn clear_voice_assets(
  app_data_dir: &Path,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
) -> Result<(), AppError> {
  shutdown_worker(worker_slot);
  shutdown_speech_worker(speech_worker_slot);
  shutdown_kokoro_fastapi_runtime(kokoro_runtime_slot);
  let voice_dir = app_data_dir.join("voice");
  if voice_dir.exists() {
    fs::remove_dir_all(voice_dir)?;
  }
  Ok(())
}

pub fn stop_speech_stream(speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>) {
  if let Ok(mut guard) = speech_worker_slot.lock() {
    if let Some(worker) = guard.as_mut() {
      let _ = send_speech_worker_command(worker, &json!({ "command": "stop" }));
    }
  }
}

pub fn shutdown_speech_worker(speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>) {
  if let Ok(mut guard) = speech_worker_slot.lock() {
    if let Some(worker) = guard.as_mut() {
      let _ = send_speech_worker_command(worker, &json!({ "command": "shutdown" }));
      let _ = worker.child.wait();
    }
    *guard = None;
  }
}

pub fn shutdown_worker(worker_slot: &Mutex<Option<VoiceWorker>>) {
  if let Ok(mut guard) = worker_slot.lock() {
    if let Some(worker) = guard.as_mut() {
      let _ = worker.child.kill();
      let _ = worker.child.wait();
    }
    *guard = None;
  }
}

fn build_call_turn_result(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  transcript_text: &str,
  session_context: &str,
) -> Result<CallTurnResult, AppError> {
  let repaired_transcript = repair_call_transcript(settings, session_context, transcript_text)?
    .filter(|candidate| !candidate.is_empty())
    .unwrap_or_else(|| transcript_text.to_string());
  let (reply_text, reply_mode) = choose_call_reply(settings, session_context, &repaired_transcript)?;
  let reply_voice = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, &reply_text, reply_voice)?;
  let output_path = resolve_voice_paths(app_data_dir, settings)
    .previews_dir
    .join(format!("call-reply-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  if let Some(parent) = output_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&output_path, &audio_bytes)?;
  Ok(CallTurnResult {
    session_id,
    transcript_text: repaired_transcript,
    reply_text: reply_text.clone(),
    reply_mode,
    reply_voice: reply_voice.to_string(),
    reply_output_path: output_path.display().to_string(),
    reply_audio_base64: STANDARD.encode(audio_bytes),
    sample_rate: settings.tts_sample_rate,
  })
}

pub fn run_uploaded_call_turn_streaming<F>(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  input_audio_wav: &[u8],
  session_context: &str,
  request_id: &str,
  mut emit_event: F,
) -> Result<CallTurnResult, AppError>
where
  F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
{
  let paths = resolve_voice_paths(app_data_dir, settings);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  fs::create_dir_all(&paths.recordings_dir)?;
  let recording_path = paths
    .recordings_dir
    .join(format!("north-star-call-input-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  fs::write(&recording_path, input_audio_wav)?;
  let output = hidden_command(&python)
    .arg(&script_path)
    .arg("--transcribe-file")
    .arg("--stt-model")
    .arg(&paths.speech_model_dir)
    .arg("--input")
    .arg(&recording_path)
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  let transcript_text = parsed.get("text").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
  if transcript_text.is_empty() {
    return Err(AppError::Message("I could not hear a clear spoken turn from North Star yet. Try again a little closer to the microphone.".into()));
  }

  stream_call_turn_for_transcript(
    app_data_dir,
    settings,
    worker_slot,
    kokoro_runtime_slot,
    session_id,
    &transcript_text,
    session_context,
    request_id,
    &mut emit_event,
  )
}

fn stream_call_turn_for_transcript<F>(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_id: i64,
  transcript_text: &str,
  session_context: &str,
  request_id: &str,
  emit_event: &mut F,
) -> Result<CallTurnResult, AppError>
where
  F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
{
  let repaired_transcript = repair_call_transcript(settings, session_context, &transcript_text)?
    .filter(|candidate| !candidate.is_empty())
    .unwrap_or_else(|| transcript_text.to_string());
  emit_event(NorthStarLiveReplyStreamEvent {
    request_id: request_id.to_string(),
    phase: "transcript_ready".into(),
    transcript_text: Some(repaired_transcript.clone()),
    reply_text: None,
    reply_mode: None,
    text_chunk: None,
    audio_base64: None,
    audio_slice: None,
    sample_rate: None,
    chunk_index: None,
    part_index: None,
    total_parts: None,
    message: None,
  })?;

  let reply_voice = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let (reply_text, reply_mode, chunk_texts) = generate_streamed_call_reply(
    app_data_dir,
    settings,
    worker_slot,
    kokoro_runtime_slot,
    session_context,
    &repaired_transcript,
    request_id,
    reply_voice,
    emit_event,
  )?;

  let full_audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, &reply_text, reply_voice)?;
  let output_path = resolve_voice_paths(app_data_dir, settings)
    .previews_dir
    .join(format!("call-reply-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  if let Some(parent) = output_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&output_path, &full_audio_bytes)?;
  let result = CallTurnResult {
    session_id,
    transcript_text: repaired_transcript.clone(),
    reply_text: reply_text.clone(),
    reply_mode: reply_mode.clone(),
    reply_voice: reply_voice.to_string(),
    reply_output_path: output_path.display().to_string(),
    reply_audio_base64: STANDARD.encode(full_audio_bytes),
    sample_rate: settings.tts_sample_rate,
  };
  emit_event(NorthStarLiveReplyStreamEvent {
    request_id: request_id.to_string(),
    phase: "complete".into(),
    transcript_text: Some(repaired_transcript),
    reply_text: Some(reply_text),
    reply_mode: Some(reply_mode),
    text_chunk: Some(chunk_texts.join(" ").trim().to_string()),
    audio_base64: None,
    audio_slice: None,
    sample_rate: Some(settings.tts_sample_rate),
    chunk_index: None,
    part_index: None,
    total_parts: None,
    message: None,
  })?;
  Ok(result)
}

fn synthesize_text_once(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  text: &str,
  voice_name: &str,
) -> Result<Vec<u8>, AppError> {
  let cleaned_text = sanitize_text(text);
  if cleaned_text.is_empty() {
    return Err(AppError::Message("Voice synthesis text is empty.".into()));
  }
  if tts_uses_fastapi(settings) {
    ensure_managed_kokoro_fastapi_runtime(app_data_dir, settings, kokoro_runtime_slot)?;
    return synthesize_text_via_fastapi(settings, &cleaned_text, voice_name);
  }
  match synthesize_text_with_worker(app_data_dir, settings, worker_slot, &cleaned_text, voice_name) {
    Ok(audio_bytes) => Ok(audio_bytes),
    Err(_) => synthesize_text_one_shot(app_data_dir, settings, &cleaned_text, voice_name),
  }
}

fn tts_uses_fastapi(settings: &AppSettings) -> bool {
  let provider = settings.tts_provider.trim().to_ascii_lowercase();
  provider == "kokoro_fastapi"
    || provider == "kokoro-fastapi"
    || (
      provider == "kokoro"
      && !settings.tts_endpoint.trim().is_empty()
    )
}

fn normalize_tts_endpoint(endpoint: &str) -> String {
  let trimmed = endpoint.trim().trim_end_matches('/').to_string();
  if trimmed.ends_with("/v1") {
    trimmed
  } else {
    format!("{trimmed}/v1")
  }
}

fn managed_fastapi_health(settings: &AppSettings) -> Result<bool, AppError> {
  let endpoint = settings.tts_endpoint.trim();
  if endpoint.is_empty() {
    return Ok(false);
  }
  let root = normalize_tts_endpoint(endpoint).trim_end_matches("/v1").to_string();
  let client = Client::builder()
    .timeout(Duration::from_secs(2))
    .build()?;
  let response = client.get(format!("{root}/docs")).send();
  match response {
    Ok(response) => Ok(response.status().is_success()),
    Err(_) => Ok(false),
  }
}

fn managed_fastapi_root(app_data_dir: &Path) -> PathBuf {
  app_data_dir.join("voice").join("kokoro-fastapi")
}

fn ensure_managed_kokoro_fastapi_installed(app_data_dir: &Path) -> Result<PathBuf, AppError> {
  let root = managed_fastapi_root(app_data_dir);
  let start_script = root.join("start-cpu.ps1");
  if start_script.exists() {
    return Ok(root);
  }
  if root.exists() {
    fs::remove_dir_all(&root)?;
  }
  let parent = root.parent().ok_or_else(|| AppError::Message("Managed Kokoro-FastAPI path was invalid.".into()))?;
  fs::create_dir_all(parent)?;
  let output = hidden_command("git")
    .args(["clone", "--depth", "1", KOKORO_FASTAPI_REPO_URL, root.to_string_lossy().as_ref()])
    .output()
    .map_err(|caught| AppError::Message(format!("Could not start git clone for Kokoro-FastAPI: {caught}")))?;
  if !output.status.success() {
    return Err(AppError::Message(format!(
      "Could not clone Kokoro-FastAPI. Make sure Git is installed. {}",
      String::from_utf8_lossy(&output.stderr).trim()
    )));
  }
  Ok(root)
}

fn ensure_python_uv_available(python: &str) -> Result<(), AppError> {
  let uv_check = hidden_command(python)
    .args(["-m", "uv", "--version"])
    .output();
  if let Ok(output) = uv_check {
    if output.status.success() {
      return Ok(());
    }
  }

  let install = hidden_command(python)
    .args(["-m", "pip", "install", "-U", "uv"])
    .output()?;
  if !install.status.success() {
    return Err(AppError::Message(format!(
      "Could not install the Python uv runtime manager required by Kokoro-FastAPI. {}",
      String::from_utf8_lossy(&install.stderr).trim()
    )));
  }

  let verify = hidden_command(python)
    .args(["-m", "uv", "--version"])
    .output()?;
  if !verify.status.success() {
    return Err(AppError::Message(
      "Python uv was installed, but NeuralTrainer still could not run it.".into(),
    ));
  }
  Ok(())
}

fn managed_fastapi_bootstrap_script(root: &Path, python: &str) -> String {
  let python_escaped = python.replace('\'', "''");
  let root_display = root.display().to_string().replace('\'', "''");
  format!(
    r#"$ErrorActionPreference = "Stop"
$env:PHONEMIZER_ESPEAK_LIBRARY="C:\Program Files\eSpeak NG\libespeak-ng.dll"
$env:PYTHONUTF8=1
$Env:PROJECT_ROOT='{root_display}'
$Env:USE_GPU="false"
$Env:USE_ONNX="false"
$Env:PYTHONPATH="$Env:PROJECT_ROOT;$Env:PROJECT_ROOT/api"
$Env:MODEL_DIR="src/models"
$Env:VOICES_DIR="src/voices/v1_0"
$Env:WEB_PLAYER_PATH="$Env:PROJECT_ROOT/web"

& '{python_escaped}' -m uv sync --extra cpu
& '{python_escaped}' -m uv run --no-sync python docker/scripts/download_model.py --output api/src/models/v1_0
& '{python_escaped}' -m uv run --no-sync uvicorn api.src.main:app --host 0.0.0.0 --port 8880
"#
  )
}

fn uses_managed_local_fastapi(settings: &AppSettings) -> bool {
  if !tts_uses_fastapi(settings) {
    return false;
  }
  let endpoint = settings.tts_endpoint.trim().to_ascii_lowercase();
  endpoint.starts_with("http://127.0.0.1:") || endpoint.starts_with("http://localhost:")
}

fn ensure_managed_kokoro_fastapi_runtime(
  app_data_dir: &Path,
  settings: &AppSettings,
  runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
) -> Result<(), AppError> {
  if !uses_managed_local_fastapi(settings) {
    return Ok(());
  }
  if managed_fastapi_health(settings)? {
    return Ok(());
  }
  {
    let mut guard = runtime_slot.lock().map_err(|_| AppError::Message("Kokoro-FastAPI runtime mutex was poisoned.".into()))?;
    if let Some(runtime) = guard.as_mut() {
      if runtime.child.try_wait()?.is_some() {
        *guard = None;
      }
    }
    if guard.is_some() && managed_fastapi_health(settings)? {
      return Ok(());
    }
  }

  let root = ensure_managed_kokoro_fastapi_installed(app_data_dir)?;
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3 for managed Kokoro-FastAPI.".into()))?;
  ensure_python_uv_available(&python)?;
  let logs_dir = root.join("runtime-logs");
  fs::create_dir_all(&logs_dir)?;
  let bootstrap_script = logs_dir.join("start-managed-cpu.ps1");
  fs::write(&bootstrap_script, managed_fastapi_bootstrap_script(&root, &python))?;
  let stdout_log = fs::File::create(logs_dir.join("kokoro-fastapi.stdout.log"))?;
  let stderr_log = fs::File::create(logs_dir.join("kokoro-fastapi.stderr.log"))?;

  let mut command = hidden_command("powershell");
  command
    .arg("-ExecutionPolicy")
    .arg("Bypass")
    .arg("-File")
    .arg(&bootstrap_script)
    .current_dir(&root)
    .stdin(Stdio::null())
    .stdout(Stdio::from(stdout_log))
    .stderr(Stdio::from(stderr_log));
  let child = command.spawn()?;

  {
    let mut guard = runtime_slot.lock().map_err(|_| AppError::Message("Kokoro-FastAPI runtime mutex was poisoned.".into()))?;
    *guard = Some(ManagedKokoroFastApiRuntime {
      child,
      working_dir: root,
      started_at: Utc::now().to_rfc3339(),
    });
  }

  let deadline = Instant::now() + Duration::from_secs(90);
  while Instant::now() < deadline {
    if managed_fastapi_health(settings)? {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(800));
  }
  Err(AppError::Message("Managed Kokoro-FastAPI did not become ready in time.".into()))
}

pub fn shutdown_kokoro_fastapi_runtime(runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>) {
  if let Ok(mut guard) = runtime_slot.lock() {
    if let Some(runtime) = guard.as_mut() {
      let _ = runtime.child.kill();
      let _ = runtime.child.wait();
    }
    *guard = None;
  }
}

fn synthesize_text_via_fastapi(
  settings: &AppSettings,
  text: &str,
  voice_name: &str,
) -> Result<Vec<u8>, AppError> {
  let endpoint = settings.tts_endpoint.trim();
  if endpoint.is_empty() {
    return Err(AppError::Message("Kokoro-FastAPI endpoint is empty.".into()));
  }

  let requested_model = settings.tts_model_id.trim();
  let fastapi_model = match requested_model.to_ascii_lowercase().as_str() {
    "" => "kokoro".to_string(),
    "kokoro-82m" => "kokoro".to_string(),
    other => other.to_string(),
  };

  let client = Client::new();
  let mut request = client
    .post(format!("{}/audio/speech", normalize_tts_endpoint(endpoint)))
    .json(&json!({
      "model": fastapi_model,
      "voice": voice_name,
      "input": text,
      "response_format": "wav",
      "speed": 1.0
    }));

  if !settings.tts_api_key.trim().is_empty() {
    request = request.bearer_auth(settings.tts_api_key.trim());
  }

  let response = request.send()?;
  if !response.status().is_success() {
    let status = response.status();
    let detail = response.text().unwrap_or_default();
    return Err(AppError::Message(format!("Kokoro-FastAPI synthesis failed with {status}: {detail}")));
  }
  Ok(response.bytes()?.to_vec())
}

fn synthesize_text_with_worker(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  text: &str,
  voice_name: &str,
) -> Result<Vec<u8>, AppError> {
  let request_line = serde_json::to_string(&json!({
    "text": text,
    "voice": voice_name,
  }))?;

  let mut last_error: Option<AppError> = None;
  for _ in 0..2 {
    let mut guard = worker_slot.lock().map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?;
    match ensure_voice_worker(app_data_dir, settings, &mut guard) {
      Ok(worker) => {
        let mut should_reset = false;
        let synthesis_result = {
          if writeln!(worker.stdin, "{request_line}").is_err() || worker.stdin.flush().is_err() {
            should_reset = true;
            Err(AppError::Message("Voice worker stopped before synthesis completed.".into()))
          } else {
            let mut response_line = String::new();
            match worker.stdout.read_line(&mut response_line) {
              Ok(0) => {
                should_reset = true;
                Err(AppError::Message("Voice worker closed unexpectedly.".into()))
              }
              Ok(_) => {
                let payload: Value = serde_json::from_str(response_line.trim())?;
                if payload.get("ok").and_then(|value| value.as_bool()).unwrap_or(false) {
                  let audio_base64 = payload
                    .get("audio_base64")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| AppError::Message("Voice worker returned no audio.".into()))?;
                  STANDARD
                    .decode(audio_base64)
                    .map_err(|error| AppError::Message(format!("Voice worker returned invalid audio: {error}")))
                } else {
                  should_reset = true;
                  Err(AppError::Message(
                    payload
                      .get("error")
                      .and_then(|value| value.as_str())
                      .unwrap_or("Voice worker synthesis failed.")
                      .to_string(),
                  ))
                }
              }
              Err(error) => {
                should_reset = true;
                Err(AppError::from(error))
              }
            }
          }
        };

        if should_reset {
          *guard = None;
        }
        match synthesis_result {
          Ok(audio_bytes) => return Ok(audio_bytes),
          Err(error) => {
            last_error = Some(error);
            continue;
          }
        }
      }
      Err(error) => {
        last_error = Some(error);
      }
    }
  }

  Err(last_error.unwrap_or_else(|| AppError::Message("Voice worker could not synthesize audio.".into())))
}

fn synthesize_text_one_shot(
  app_data_dir: &Path,
  settings: &AppSettings,
  text: &str,
  voice_name: &str,
) -> Result<Vec<u8>, AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  if !paths.model_path.exists() || !paths.voices_path.exists() {
    return Err(AppError::Message("Kokoro model files are missing. Download them first in Settings > Voice.".into()));
  }
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  fs::create_dir_all(&paths.previews_dir)?;
  let output_path = paths
    .previews_dir
    .join(format!("tts-temp-{}.wav", Utc::now().timestamp_millis()));
  let output = hidden_command(&python)
    .arg(&script_path)
    .arg("--model")
    .arg(&paths.model_path)
    .arg("--voices")
    .arg(&paths.voices_path)
    .arg("--voice")
    .arg(voice_name)
    .arg("--text")
    .arg(text)
    .arg("--output")
    .arg(&output_path)
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let audio_bytes = fs::read(&output_path)?;
  let _ = fs::remove_file(&output_path);
  Ok(audio_bytes)
}

fn ensure_voice_worker<'a>(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &'a mut Option<VoiceWorker>,
) -> Result<&'a mut VoiceWorker, AppError> {
  let worker_is_running = match worker_slot.as_mut() {
    Some(worker) => worker.child.try_wait()?.is_none(),
    None => false,
  };
  if worker_is_running {
    return worker_slot
      .as_mut()
      .ok_or_else(|| AppError::Message("Voice worker disappeared unexpectedly.".into()));
  }

  *worker_slot = None;
  let paths = resolve_voice_paths(app_data_dir, settings);
  if !paths.model_path.exists() || !paths.voices_path.exists() {
    return Err(AppError::Message("Kokoro model files are missing. Download them first in Settings > Voice.".into()));
  }

  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  let script_path = ensure_python_script(app_data_dir)?;
  let mut child = hidden_command(&python)
    .arg(&script_path)
    .arg("--worker")
    .arg("--model")
    .arg(&paths.model_path)
    .arg("--voices")
    .arg(&paths.voices_path)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| AppError::Message("Voice worker did not expose stdin.".into()))?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| AppError::Message("Voice worker did not expose stdout.".into()))?;
  let mut stdout = BufReader::new(stdout);
  let mut ready_line = String::new();
  let read_count = stdout.read_line(&mut ready_line)?;
  if read_count == 0 {
    return Err(AppError::Message("Voice worker did not start correctly.".into()));
  }

  let ready_payload: Value = serde_json::from_str(ready_line.trim())?;
  let is_ready =
    ready_payload.get("ok").and_then(|value| value.as_bool()).unwrap_or(false)
      && ready_payload.get("status").and_then(|value| value.as_str()) == Some("ready");
  if !is_ready {
    return Err(AppError::Message(
      ready_payload
        .get("error")
        .and_then(|value| value.as_str())
        .unwrap_or("Voice worker failed to initialize.")
        .to_string(),
    ));
  }

  *worker_slot = Some(VoiceWorker { child, stdin, stdout });
  worker_slot
    .as_mut()
    .ok_or_else(|| AppError::Message("Voice worker was not available after startup.".into()))
}

fn choose_call_reply(
  settings: &AppSettings,
  session_context: &str,
  transcript_text: &str,
) -> Result<(String, String), AppError> {
  let lm_is_configured = !settings.lm_studio_endpoint.trim().is_empty()
    && !settings.lm_studio_model.trim().is_empty()
    && !settings.lm_studio_api_key.trim().is_empty();
  if let Some(reply_text) = generate_call_reply(settings, session_context, transcript_text)? {
    return Ok((reply_text, "model".into()));
  }
  if lm_is_configured {
    return Ok((DEFAULT_CALL_REPLY_MODEL_ISSUE.to_string(), "model_issue".into()));
  }
  Ok((fallback_call_reply(transcript_text), "fallback".into()))
}

fn repair_call_transcript(
  settings: &AppSettings,
  session_context: &str,
  transcript_text: &str,
) -> Result<Option<String>, AppError> {
  if settings.lm_studio_endpoint.trim().is_empty()
    || settings.lm_studio_model.trim().is_empty()
    || settings.lm_studio_api_key.trim().is_empty()
  {
    return Ok(None);
  }

  let endpoint = settings.lm_studio_endpoint.trim_end_matches('/').to_string();
  let repair_prompt = format!(
    "You are cleaning up rough speech-to-text from a live phone call. Rewrite only what the speaker most likely meant to say in plain natural language. Do not answer the question. Do not add facts that were not implied. Be conservative. If you are not highly confident, keep the original wording close to the raw transcript. Do not replace one specific noun or topic with a different specific noun or topic unless the correction is extremely obvious.\n\nRecent call context:\n{session_context}\n\nRaw transcript:\n{transcript_text}\n\nReturn only the cleaned transcript."
  );

  request_call_reply(
    settings,
    &endpoint,
    "Rewrite rough speech recognition into the speaker's likely intended words. Output transcript text only. Do not use <think> tags or reasoning.",
    &repair_prompt,
    0.2,
    80,
  )
}

fn generate_call_reply(
  settings: &AppSettings,
  session_context: &str,
  transcript_text: &str,
) -> Result<Option<String>, AppError> {
  if settings.lm_studio_endpoint.trim().is_empty()
    || settings.lm_studio_model.trim().is_empty()
    || settings.lm_studio_api_key.trim().is_empty()
  {
    return Ok(None);
  }
  let endpoint = settings.lm_studio_endpoint.trim_end_matches('/').to_string();
  let primary_prompt = format!(
    "You are North Star, speaking inside a live companion phone call. Give a real spoken answer to what the user actually asked. Most replies should be 2 to 4 short spoken sentences, usually under 70 words. If the user asks a practical or factual question, answer it directly and helpfully. If the user asks how, why, or what something is, actually explain it instead of merely acknowledging the question. Do not stall with phrases like 'That's a great question', 'I'd love to help', or 'Sure' unless they are immediately followed by the real answer in the same reply. Never say you are an AI language model, text model, or that you cannot talk about normal everyday topics like cooking, music, travel, work, or hobbies. Stay warm, grounded, and useful.\n\nCall context:\n{session_context}\n\nUser just said:\n{transcript_text}\n\nReturn only the spoken reply."
  );
  let fallback_prompt = format!(
    "Answer this live phone-call question directly in 2 or 3 natural spoken sentences. No analysis. No tags. No hidden reasoning. Do not mention being an AI.\n\nUser asked: {transcript_text}"
  );
  let wants_explanation = wants_explanatory_answer(transcript_text);
  if let Some(reply) = request_call_reply(settings, &endpoint, "You are on a live phone call. Reply with plain spoken answer text only. Do not use <think> tags. Do not explain your reasoning.", &primary_prompt, 0.45, 180)? {
    if !wants_explanation || !is_acknowledgment_only_reply(&reply) {
      return Ok(Some(reply));
    }
  }
  if wants_explanation {
    let stricter_prompt = format!(
      "The user is clearly asking for an explanation. Answer the question itself right away. Do not just acknowledge it. Start with the explanation in the first sentence. Give a concise but real explanation in 2 to 4 natural spoken sentences.\n\nCall context:\n{session_context}\n\nUser just said:\n{transcript_text}\n\nReturn only the spoken reply."
    );
    if let Some(reply) = request_call_reply(settings, &endpoint, "You are on a live phone call. Provide the actual answer immediately. No <think> tags. No reasoning trace. No acknowledgment-only replies.", &stricter_prompt, 0.35, 220)? {
      return Ok(Some(reply));
    }
  }
  request_call_reply(settings, &endpoint, "Reply with plain spoken answer text only.", &fallback_prompt, 0.3, 96)
}

fn request_call_reply(
  settings: &AppSettings,
  endpoint: &str,
  system_prompt: &str,
  user_prompt: &str,
  temperature: f32,
  max_tokens: i32,
) -> Result<Option<String>, AppError> {
  let client = Client::new();
  let response = client
    .post(format!("{endpoint}/v1/chat/completions"))
    .bearer_auth(&settings.lm_studio_api_key)
    .json(&json!({
      "model": settings.lm_studio_model,
      "temperature": temperature,
      "max_tokens": max_tokens,
      "messages": [
        { "role": "system", "content": system_prompt },
        { "role": "user", "content": user_prompt }
      ]
    }))
    .send();
  let response = match response {
    Ok(value) => value,
    Err(_) => return Ok(None),
  };
  let body: Value = match response.json() {
    Ok(value) => value,
    Err(_) => return Ok(None),
  };
  let choice = body.get("choices").and_then(|v| v.as_array()).and_then(|choices| choices.first());
  let content = choice
    .and_then(|choice| choice.get("message"))
    .and_then(|message| message.get("content"))
    .and_then(|content| content.as_str())
    .map(|content| sanitize_text(&strip_think_text(content)))
    .filter(|content| !content.is_empty())
    .filter(|content| is_usable_call_reply(content));
  Ok(content)
}

fn generate_streamed_call_reply<F>(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  kokoro_runtime_slot: &Mutex<Option<ManagedKokoroFastApiRuntime>>,
  session_context: &str,
  transcript_text: &str,
  request_id: &str,
  reply_voice: &str,
  emit_event: &mut F,
) -> Result<(String, String, Vec<String>), AppError>
where
  F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
{
  const NORTH_STAR_LIVE_REPLY_AUDIO_SLICE_SIZE: usize = 6_000;

  fn emit_streamed_reply_audio<F>(
    request_id: &str,
    reply_mode: &str,
    text_chunk: &str,
    audio_bytes: Vec<u8>,
    sample_rate: i64,
    chunk_index: usize,
    emit_event: &mut F,
  ) -> Result<(), AppError>
  where
    F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
  {
    let audio_base64 = STANDARD.encode(audio_bytes);
    if audio_base64.len() <= NORTH_STAR_LIVE_REPLY_AUDIO_SLICE_SIZE {
      emit_event(NorthStarLiveReplyStreamEvent {
        request_id: request_id.to_string(),
        phase: "chunk".into(),
        transcript_text: None,
        reply_text: None,
        reply_mode: Some(reply_mode.into()),
        text_chunk: Some(text_chunk.to_string()),
        audio_base64: Some(audio_base64),
        audio_slice: None,
        sample_rate: Some(sample_rate),
        chunk_index: Some(chunk_index),
        part_index: None,
        total_parts: None,
        message: None,
      })?;
      return Ok(());
    }

    let total_parts = audio_base64.len().div_ceil(NORTH_STAR_LIVE_REPLY_AUDIO_SLICE_SIZE);
    for part_index in 0..total_parts {
      let start = part_index * NORTH_STAR_LIVE_REPLY_AUDIO_SLICE_SIZE;
      let end = ((part_index + 1) * NORTH_STAR_LIVE_REPLY_AUDIO_SLICE_SIZE).min(audio_base64.len());
      emit_event(NorthStarLiveReplyStreamEvent {
        request_id: request_id.to_string(),
        phase: "chunk_part".into(),
        transcript_text: None,
        reply_text: None,
        reply_mode: Some(reply_mode.into()),
        text_chunk: Some(if part_index == 0 { text_chunk.to_string() } else { String::new() }),
        audio_base64: None,
        audio_slice: Some(audio_base64[start..end].to_string()),
        sample_rate: Some(sample_rate),
        chunk_index: Some(chunk_index),
        part_index: Some(part_index),
        total_parts: Some(total_parts),
        message: None,
      })?;
    }

    Ok(())
  }

  if settings.lm_studio_endpoint.trim().is_empty()
    || settings.lm_studio_model.trim().is_empty()
    || settings.lm_studio_api_key.trim().is_empty()
  {
    let fallback = fallback_call_reply(transcript_text);
    let audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, &fallback, reply_voice)?;
    emit_streamed_reply_audio(
      request_id,
      "fallback",
      &fallback,
      audio_bytes,
      settings.tts_sample_rate,
      0,
      emit_event,
    )?;
    return Ok((fallback.clone(), "fallback".into(), vec![fallback]));
  }

  let endpoint = settings.lm_studio_endpoint.trim_end_matches('/').to_string();
  let system_prompt = "You are on a live phone call. Reply with plain spoken answer text only. Do not use <think> tags. Do not explain your reasoning. If the user asks for an explanation, give the explanation itself instead of only acknowledging the question.";
  let user_prompt = format!(
    "You are North Star, speaking inside a live companion phone call. Give a real spoken answer to what the user actually asked. Most replies should be 2 to 4 short spoken sentences, usually under 70 words. If the user asks a practical or factual question, answer it directly and helpfully. If the user asks how, why, or what something is, actually explain it instead of merely acknowledging the question. Do not stall with phrases like 'That's a great question', 'I'd love to help', or 'Sure' unless they are immediately followed by the real answer in the same reply. Never say you are an AI language model, text model, or that you cannot talk about normal everyday topics like cooking, music, travel, work, or hobbies. Stay warm, grounded, and useful.\n\nCall context:\n{session_context}\n\nUser just said:\n{transcript_text}\n\nReturn only the spoken reply."
  );

  let client = Client::new();
  let response = client
    .post(format!("{endpoint}/v1/chat/completions"))
    .bearer_auth(&settings.lm_studio_api_key)
    .json(&json!({
      "model": settings.lm_studio_model,
      "temperature": 0.45,
      "max_tokens": 180,
      "stream": true,
      "messages": [
        { "role": "system", "content": system_prompt },
        { "role": "user", "content": user_prompt }
      ]
    }))
    .send()?;

  if !response.status().is_success() {
    return Err(AppError::Message(format!("LM Studio streaming reply failed with {}.", response.status())));
  }
  thread::scope(|scope| -> Result<(String, String, Vec<String>), AppError> {
    let (tts_request_tx, tts_request_rx) = mpsc::channel::<(usize, String)>();
    let (tts_result_tx, tts_result_rx) = mpsc::channel::<Result<(usize, String, Vec<u8>), String>>();
    let tts_worker = scope.spawn(move || {
      while let Ok((queued_index, queued_text)) = tts_request_rx.recv() {
        let synthesis = synthesize_text_once(
          app_data_dir,
          settings,
          worker_slot,
          kokoro_runtime_slot,
          &queued_text,
          reply_voice,
        )
        .map(|audio_bytes| (queued_index, queued_text, audio_bytes))
        .map_err(|error| error.to_string());
        if tts_result_tx.send(synthesis).is_err() {
          break;
        }
      }
    });

    let mut reader = BufReader::new(response);
    let mut line = String::new();
    let mut accumulated = String::new();
    let mut flushed_visible_prefix = String::new();
    let mut queued_chunk_count = 0usize;
    let mut next_emit_index = 0usize;
    let mut emitted_chunk_texts = Vec::new();
    let mut pending_tts_results = BTreeMap::<usize, (String, Vec<u8>)>::new();

    fn flush_tts_results<F>(
      block_until_next: bool,
      queued_chunk_count: usize,
      next_emit_index: &mut usize,
      pending_tts_results: &mut BTreeMap<usize, (String, Vec<u8>)>,
      emitted_chunk_texts: &mut Vec<String>,
      tts_result_rx: &mpsc::Receiver<Result<(usize, String, Vec<u8>), String>>,
      request_id: &str,
      sample_rate: i64,
      emit_event: &mut F,
    ) -> Result<(), AppError>
    where
      F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
    {
      loop {
        if let Some((text_chunk, audio_bytes)) = pending_tts_results.remove(next_emit_index) {
          emit_streamed_reply_audio(
            request_id,
            "model_stream",
            &text_chunk,
            audio_bytes,
            sample_rate,
            *next_emit_index,
            emit_event,
          )?;
          emitted_chunk_texts.push(text_chunk);
          *next_emit_index += 1;
          continue;
        }

        if block_until_next && *next_emit_index < queued_chunk_count {
          let result = tts_result_rx
            .recv()
            .map_err(|_| AppError::Message("Live reply TTS worker stopped before all chunks were synthesized.".into()))?;
          let (completed_index, completed_text, completed_audio) = result
            .map_err(AppError::Message)?;
          pending_tts_results.insert(completed_index, (completed_text, completed_audio));
          continue;
        }

        match tts_result_rx.try_recv() {
          Ok(result) => {
            let (completed_index, completed_text, completed_audio) = result
              .map_err(AppError::Message)?;
            pending_tts_results.insert(completed_index, (completed_text, completed_audio));
          }
          Err(mpsc::TryRecvError::Empty) => break,
          Err(mpsc::TryRecvError::Disconnected) => break,
        }
      }
      Ok(())
    }

    fn queue_stream_segment<F>(
      text: String,
      queued_chunk_count: &mut usize,
      tts_request_tx: &mpsc::Sender<(usize, String)>,
      request_id: &str,
      emit_event: &mut F,
    ) -> Result<(), AppError>
    where
      F: FnMut(NorthStarLiveReplyStreamEvent) -> Result<(), AppError>,
    {
      if text.is_empty() {
        return Ok(());
      }
      emit_event(NorthStarLiveReplyStreamEvent {
        request_id: request_id.to_string(),
        phase: "text_preview".into(),
        transcript_text: None,
        reply_text: None,
        reply_mode: Some("model_stream".into()),
        text_chunk: Some(text.clone()),
        audio_base64: None,
        audio_slice: None,
        sample_rate: None,
        chunk_index: Some(*queued_chunk_count),
        part_index: None,
        total_parts: None,
        message: None,
      })?;
      let queued_index = *queued_chunk_count;
      *queued_chunk_count += 1;
      tts_request_tx
        .send((queued_index, text))
        .map_err(|_| AppError::Message("Could not queue live reply chunk for synthesis.".into()))
    }

    loop {
      line.clear();
      if reader.read_line(&mut line)? == 0 {
        break;
      }
      let trimmed = line.trim();
      if !trimmed.starts_with("data:") {
        flush_tts_results(
          false,
          queued_chunk_count,
          &mut next_emit_index,
          &mut pending_tts_results,
          &mut emitted_chunk_texts,
          &tts_result_rx,
          request_id,
          settings.tts_sample_rate,
          emit_event,
        )?;
        continue;
      }
      let data = trimmed.trim_start_matches("data:").trim();
      if data == "[DONE]" {
        break;
      }
      let value: Value = match serde_json::from_str(data) {
        Ok(value) => value,
        Err(_) => {
          flush_tts_results(
            false,
            queued_chunk_count,
            &mut next_emit_index,
            &mut pending_tts_results,
            &mut emitted_chunk_texts,
            &tts_result_rx,
            request_id,
            settings.tts_sample_rate,
            emit_event,
          )?;
          continue;
        }
      };
      let delta = value
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(|content| content.as_str())
        .unwrap_or("");
      if delta.is_empty() {
        flush_tts_results(
          false,
          queued_chunk_count,
          &mut next_emit_index,
          &mut pending_tts_results,
          &mut emitted_chunk_texts,
          &tts_result_rx,
          request_id,
          settings.tts_sample_rate,
          emit_event,
        )?;
        continue;
      }
      accumulated.push_str(delta);
      let visible_accumulated = sanitize_text(&strip_think_text(&accumulated));
      while let Some(segment) = next_streamable_segment(&visible_accumulated, &mut flushed_visible_prefix, false) {
        let cleaned = sanitize_text(&segment);
        if cleaned.is_empty() {
          continue;
        }
        queue_stream_segment(cleaned, &mut queued_chunk_count, &tts_request_tx, request_id, emit_event)?;
      }
      flush_tts_results(
        false,
        queued_chunk_count,
        &mut next_emit_index,
        &mut pending_tts_results,
        &mut emitted_chunk_texts,
        &tts_result_rx,
        request_id,
        settings.tts_sample_rate,
        emit_event,
      )?;
    }

    let visible_accumulated = sanitize_text(&strip_think_text(&accumulated));
    while let Some(segment) = next_streamable_segment(&visible_accumulated, &mut flushed_visible_prefix, true) {
      let cleaned = sanitize_text(&segment);
      if cleaned.is_empty() {
        continue;
      }
      queue_stream_segment(cleaned, &mut queued_chunk_count, &tts_request_tx, request_id, emit_event)?;
    }

    let reply_text = sanitize_text(&strip_think_text(&accumulated));
    if reply_text.is_empty() {
      drop(tts_request_tx);
      while next_emit_index < queued_chunk_count {
        flush_tts_results(
          true,
          queued_chunk_count,
          &mut next_emit_index,
          &mut pending_tts_results,
          &mut emitted_chunk_texts,
          &tts_result_rx,
          request_id,
          settings.tts_sample_rate,
          emit_event,
        )?;
      }
      let _ = tts_worker.join();

      let fallback = fallback_call_reply(transcript_text);
      let audio_bytes = synthesize_text_once(app_data_dir, settings, worker_slot, kokoro_runtime_slot, &fallback, reply_voice)?;
      emit_streamed_reply_audio(
        request_id,
        "fallback",
        &fallback,
        audio_bytes,
        settings.tts_sample_rate,
        0,
        emit_event,
      )?;
      return Ok((fallback.clone(), "fallback".into(), vec![fallback]));
    }

    if queued_chunk_count == 0 {
      queue_stream_segment(reply_text.clone(), &mut queued_chunk_count, &tts_request_tx, request_id, emit_event)?;
    }

    drop(tts_request_tx);
    while next_emit_index < queued_chunk_count {
      flush_tts_results(
        true,
        queued_chunk_count,
        &mut next_emit_index,
        &mut pending_tts_results,
        &mut emitted_chunk_texts,
        &tts_result_rx,
        request_id,
        settings.tts_sample_rate,
        emit_event,
      )?;
    }
    let _ = tts_worker.join();

    Ok((reply_text, "model_stream".into(), emitted_chunk_texts))
  })
}

fn next_streamable_segment(
  accumulated: &str,
  flushed_prefix: &mut String,
  force_flush: bool,
) -> Option<String> {
  if accumulated.len() <= flushed_prefix.len() {
    return None;
  }
  let pending = &accumulated[flushed_prefix.len()..];
  let mut boundary: Option<usize> = None;
  let mut last_space: Option<usize> = None;
  for (index, ch) in pending.char_indices() {
    if ch.is_whitespace() {
      last_space = Some(index + ch.len_utf8());
    }
    if matches!(ch, '.' | '!' | '?' | '\n') {
      boundary = Some(index + ch.len_utf8());
    }
  }
  let cut = if let Some(boundary) = boundary {
    Some(boundary)
  } else if pending.len() > 160 {
    last_space
  } else if force_flush {
    Some(pending.len())
  } else {
    None
  }?;
  let segment = pending[..cut].trim().to_string();
  *flushed_prefix = accumulated[..flushed_prefix.len() + cut].to_string();
  if segment.is_empty() {
    return None;
  }
  Some(segment)
}

fn strip_think_text(content: &str) -> String {
  let mut cleaned = content.to_string();
  while let Some(start) = cleaned.find("<think>") {
    if let Some(end) = cleaned[start..].find("</think>") {
      let end_index = start + end + "</think>".len();
      cleaned.replace_range(start..end_index, "");
    } else {
      cleaned.truncate(start);
      break;
    }
  }
  let mut normalized = cleaned
    .lines()
    .filter_map(|line| {
      let trimmed = line.trim();
      let lowered = trimmed.to_ascii_lowercase();
      if trimmed.is_empty() {
        return None;
      }
      if lowered == "flash think"
        || lowered == "flash-think"
        || lowered == "thinking"
        || lowered == "thinking:"
        || lowered == "internal reasoning"
        || lowered == "internal reasoning:"
      {
        return None;
      }
      if lowered.starts_with("flash think:") || lowered.starts_with("flash-think:") {
        return Some(trimmed[trimmed.find(':').map(|idx| idx + 1).unwrap_or(0)..].trim().to_string());
      }
      Some(trimmed.to_string())
    })
    .collect::<Vec<_>>()
    .join(" ");

  for prefix in [
    "flash think:",
    "flash-think:",
    "thinking:",
    "internal reasoning:",
  ] {
    if normalized.to_ascii_lowercase().starts_with(prefix) {
      normalized = normalized[prefix.len()..].trim().to_string();
    }
  }
  normalized
}

fn sanitize_text(text: &str) -> String {
  text
    .replace(['\r', '\n', '\t'], " ")
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string()
}

fn is_usable_call_reply(text: &str) -> bool {
  let lowered = text.to_lowercase();
  !lowered.contains("<think>") && !lowered.contains("thinking process") && !text.trim().is_empty()
}

fn wants_explanatory_answer(transcript_text: &str) -> bool {
  let lowered = transcript_text.to_lowercase();
  lowered.contains("how ")
    || lowered.starts_with("how")
    || lowered.contains("why ")
    || lowered.starts_with("why")
    || lowered.contains("what is ")
    || lowered.contains("what are ")
    || lowered.contains("tell me how")
    || lowered.contains("tell me about")
    || lowered.contains("can you explain")
    || lowered.contains("explain ")
}

fn is_acknowledgment_only_reply(reply_text: &str) -> bool {
  let normalized = reply_text.trim().to_lowercase();
  let short_reply = normalized.len() <= 140;
  short_reply
    && [
      "that's a great",
      "that is a great",
      "good question",
      "i'd love to help",
      "i would love to help",
      "sure,",
      "sure.",
      "absolutely,",
      "absolutely.",
      "of course,",
      "of course.",
      "okay,",
      "okay.",
      "alright,",
      "alright.",
    ]
    .iter()
    .any(|needle| normalized.starts_with(needle))
}

fn fallback_call_reply(transcript_text: &str) -> String {
  let lowered = transcript_text.to_lowercase();
  if ["frog", "frogs", "joke", "funny"].iter().any(|needle| lowered.contains(needle)) {
    DEFAULT_CALL_REPLY_PLAYFUL.to_string()
  } else if ["was really nice", "good morning", "that was lovely"].iter().any(|needle| lowered.contains(needle)) {
    DEFAULT_CALL_REPLY_POSITIVE.to_string()
  } else if lowered.contains('?')
    || lowered.starts_with("can ")
    || lowered.starts_with("could ")
    || lowered.starts_with("would ")
    || lowered.starts_with("what ")
    || lowered.starts_with("why ")
    || lowered.starts_with("how ")
    || lowered.contains("recommend")
    || lowered.contains("tell me")
  {
    DEFAULT_CALL_REPLY_MODEL_ISSUE.to_string()
  } else {
    DEFAULT_CALL_REPLY.to_string()
  }
}

fn resolve_voice_paths(app_data_dir: &Path, settings: &AppSettings) -> VoicePaths {
  let voice_root = app_data_dir.join("voice").join("kokoro");
  let speech_root = app_data_dir.join("voice").join("speech");
  VoicePaths {
    model_path: if settings.tts_model_path.trim().is_empty() { voice_root.join(KOKORO_MODEL_FILE) } else { PathBuf::from(settings.tts_model_path.trim()) },
    voices_path: if settings.tts_voices_path.trim().is_empty() { voice_root.join(KOKORO_VOICES_FILE) } else { PathBuf::from(settings.tts_voices_path.trim()) },
    previews_dir: voice_root.join("previews"),
    speech_model_dir: speech_root.join(MOONSHINE_MODEL_DIR_NAME),
    recordings_dir: speech_root.join("recordings"),
  }
}

fn ensure_python_script(app_data_dir: &Path) -> Result<PathBuf, AppError> {
  let script_path = app_data_dir.join("voice").join("kokoro").join("kokoro_speak.py");
  if let Some(parent) = script_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&script_path, KOKORO_SCRIPT)?;
  Ok(script_path)
}

fn python_command() -> Option<String> {
  for program in ["python", "py"] {
    let mut command = hidden_command(program);
    if program == "py" {
      command.arg("-3");
    }
    if let Ok(output) = command.arg("-c").arg("import sys; print(sys.executable)").output() {
      if output.status.success() {
        let executable = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !executable.is_empty() {
          return Some(executable);
        }
      }
    }
  }
  None
}

fn hidden_command(program: &str) -> Command {
  let mut command = Command::new(program);
  #[cfg(windows)]
  command.creation_flags(CREATE_NO_WINDOW);
  command
}

fn speech_model_files_exist(model_dir: &Path) -> bool {
  MOONSHINE_MODEL_FILES.iter().all(|file_name| model_dir.join(file_name).exists())
}

fn download_file_if_missing(client: &Client, url: &str, destination: &Path) -> Result<(), AppError> {
  if destination.exists() {
    return Ok(());
  }
  let mut response = client.get(url).send()?;
  if !response.status().is_success() {
    return Err(AppError::Message(format!("Failed to download {}: HTTP {}", destination.display(), response.status())));
  }
  let mut temp_path = destination.to_path_buf();
  temp_path.set_extension("download");
  let mut file = fs::File::create(&temp_path)?;
  response.copy_to(&mut file)?;
  std::io::Write::flush(&mut file)?;
  fs::rename(&temp_path, destination)?;
  Ok(())
}

fn download_moonshine_model_if_missing(target_dir: &Path) -> Result<(), AppError> {
  if speech_model_files_exist(target_dir) {
    return Ok(());
  }
  if target_dir.exists() {
    fs::remove_dir_all(target_dir)?;
  }
  let client = Client::new();
  fs::create_dir_all(target_dir)?;
  for file_name in MOONSHINE_MODEL_FILES {
    let url = format!("{MOONSHINE_MODEL_BASE_URL}/{file_name}");
    download_file_if_missing(&client, &url, &target_dir.join(file_name))?;
  }
  Ok(())
}
