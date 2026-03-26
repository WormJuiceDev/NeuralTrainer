use std::{
  fs,
  path::{Path, PathBuf},
  process::Command,
  sync::Mutex,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use serde_json::{json, Value};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
  error::AppError,
  models::{AppSettings, CallTurnResult, VoiceSnapshot, VoiceSynthesisResult},
  state::{SpeechStreamSnapshotState, SpeechStreamWorker},
};

const KOKORO_SCRIPT: &str = include_str!("../scripts/kokoro_speak.py");
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const KOKORO_MODEL_FILE: &str = "kokoro-v1.0.int8.onnx";
const KOKORO_VOICES_FILE: &str = "voices-v1.0.bin";
const KOKORO_MODEL_URL: &str = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx";
const KOKORO_VOICES_URL: &str = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin";
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
const DEFAULT_CALL_REPLY: &str = "I hear you. I'm here with you.";
const DEFAULT_CALL_REPLY_PLAYFUL: &str = "Maybe just a croak or two.";
const DEFAULT_CALL_REPLY_POSITIVE: &str = "That sounds really nice.";
const DEFAULT_CALL_REPLY_MODEL_ISSUE: &str = "I had a little trouble responding just then. Can you say that again?";

pub struct VoiceWorker;

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
) -> Result<VoiceSnapshot, AppError> {
  let paths = resolve_voice_paths(app_data_dir, settings);
  fs::create_dir_all(&paths.previews_dir)?;
  fs::create_dir_all(&paths.recordings_dir)?;

  let mut missing_files = Vec::new();
  if !paths.model_path.exists() {
    missing_files.push(KOKORO_MODEL_FILE.to_string());
  }
  if !paths.voices_path.exists() {
    missing_files.push(KOKORO_VOICES_FILE.to_string());
  }

  let speech_ready = speech_model_files_exist(&paths.speech_model_dir);
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
    runtime_ready: worker_loaded || python_command().is_some(),
    runtime_detail: if worker_loaded {
      "Voice runtime is ready.".into()
    } else {
      "Voice runtime is available after setup.".into()
    },
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
) -> Result<(), AppError> {
  let python = python_command().ok_or_else(|| AppError::Message("Could not find Python 3.".into()))?;
  ensure_python_script(app_data_dir)?;
  let output = hidden_command(&python)
    .args(["-m", "pip", "install", "-U", "kokoro-onnx", "soundfile", "moonshine-voice", "sounddevice", "numpy"])
    .output()?;
  if !output.status.success() {
    return Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()));
  }
  let mut guard = worker_slot.lock().map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?;
  *guard = Some(VoiceWorker);
  let _ = settings;
  Ok(())
}

pub fn setup_local_speech(
  app_data_dir: &Path,
  settings: &AppSettings,
  _speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
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
}

pub fn speech_stream_snapshot(
  _speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<SpeechStreamSnapshotState, AppError> {
  Ok(SpeechStreamSnapshotState::default())
}

pub fn start_speech_stream(
  _app_data_dir: &Path,
  _settings: &AppSettings,
  _speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<SpeechStreamSnapshotState, AppError> {
  Err(AppError::Message("Live desktop speech streaming is temporarily unavailable while the voice module is being repaired.".into()))
}

pub fn stop_speech_stream_and_reply(
  _app_data_dir: &Path,
  _settings: &AppSettings,
  _worker_slot: &Mutex<Option<VoiceWorker>>,
  _speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
  _session_id: i64,
  _session_context: &str,
) -> Result<CallTurnResult, AppError> {
  Err(AppError::Message("Live desktop speech streaming is temporarily unavailable while the voice module is being repaired.".into()))
}

pub fn run_call_turn(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
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
  build_call_turn_result(app_data_dir, settings, worker_slot, session_id, &transcript_text, session_context)
}

pub fn run_uploaded_call_turn(
  app_data_dir: &Path,
  settings: &AppSettings,
  worker_slot: &Mutex<Option<VoiceWorker>>,
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
  build_call_turn_result(app_data_dir, settings, worker_slot, session_id, &transcript_text, session_context)
}

pub fn synthesize_test_phrase(
  app_data_dir: &Path,
  settings: &AppSettings,
  _worker_slot: &Mutex<Option<VoiceWorker>>,
) -> Result<VoiceSynthesisResult, AppError> {
  let voice_name = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let audio_bytes = synthesize_text_once(app_data_dir, settings, DEFAULT_TEST_PHRASE, voice_name)?;
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

pub fn clear_voice_assets(
  app_data_dir: &Path,
  worker_slot: &Mutex<Option<VoiceWorker>>,
  speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>,
) -> Result<(), AppError> {
  shutdown_worker(worker_slot);
  shutdown_speech_worker(speech_worker_slot);
  let voice_dir = app_data_dir.join("voice");
  if voice_dir.exists() {
    fs::remove_dir_all(voice_dir)?;
  }
  Ok(())
}

pub fn stop_speech_stream(_speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>) {}

pub fn shutdown_speech_worker(speech_worker_slot: &Mutex<Option<SpeechStreamWorker>>) {
  if let Ok(mut guard) = speech_worker_slot.lock() {
    *guard = None;
  }
}

pub fn shutdown_worker(worker_slot: &Mutex<Option<VoiceWorker>>) {
  if let Ok(mut guard) = worker_slot.lock() {
    *guard = None;
  }
}

fn build_call_turn_result(
  app_data_dir: &Path,
  settings: &AppSettings,
  _worker_slot: &Mutex<Option<VoiceWorker>>,
  session_id: i64,
  transcript_text: &str,
  session_context: &str,
) -> Result<CallTurnResult, AppError> {
  let (reply_text, reply_mode) = choose_call_reply(settings, session_context, transcript_text)?;
  let reply_voice = if settings.tts_default_voice.trim().is_empty() { "af_heart" } else { settings.tts_default_voice.trim() };
  let audio_bytes = synthesize_text_once(app_data_dir, settings, &reply_text, reply_voice)?;
  let output_path = resolve_voice_paths(app_data_dir, settings)
    .previews_dir
    .join(format!("call-reply-{}-{}.wav", session_id, Utc::now().timestamp_millis()));
  if let Some(parent) = output_path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&output_path, &audio_bytes)?;
  Ok(CallTurnResult {
    session_id,
    transcript_text: transcript_text.to_string(),
    reply_text: reply_text.clone(),
    reply_mode,
    reply_voice: reply_voice.to_string(),
    reply_output_path: output_path.display().to_string(),
    reply_audio_base64: STANDARD.encode(audio_bytes),
    sample_rate: settings.tts_sample_rate,
  })
}

fn synthesize_text_once(
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
    .arg(sanitize_text(text))
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
    "You are responding inside a live companion phone call. Give a real spoken answer to what the user actually asked. Most replies should be 2 to 4 short spoken sentences, usually under 70 words. If the user asks a practical or factual question, answer it directly and helpfully instead of staying vague.\n\nCall context:\n{session_context}\n\nUser just said:\n{transcript_text}\n\nReturn only the spoken reply."
  );
  let fallback_prompt = format!(
    "Answer this live phone-call question directly in 2 or 3 natural spoken sentences. No analysis. No tags. No hidden reasoning.\n\nUser asked: {transcript_text}"
  );
  if let Some(reply) = request_call_reply(settings, &endpoint, "You are on a live phone call. Reply with plain spoken answer text only. Do not use <think> tags. Do not explain your reasoning.", &primary_prompt, 0.45, 180)? {
    return Ok(Some(reply));
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
  cleaned
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

fn fallback_call_reply(transcript_text: &str) -> String {
  let lowered = transcript_text.to_lowercase();
  if ["frog", "frogs", "joke", "funny"].iter().any(|needle| lowered.contains(needle)) {
    DEFAULT_CALL_REPLY_PLAYFUL.to_string()
  } else if ["was really nice", "good morning", "that was lovely"].iter().any(|needle| lowered.contains(needle)) {
    DEFAULT_CALL_REPLY_POSITIVE.to_string()
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
