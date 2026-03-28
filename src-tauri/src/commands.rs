use base64::Engine as _;
use serde_json::json;
use tauri::{async_runtime, ipc::Channel, AppHandle, Emitter, State};

use crate::{
  db,
  error::AppError,
  models::{
    AppSettings, CallSessionSnapshot, CallTurnRecord, CallTurnResult, CreatePlaceInput, CreateReflectionInput, CreateRuleInput, DiagnosticStatus,
    CompleteTelegramUserLoginInput, DecisionRunResult, DecisionSnapshot, EndCallSessionInput, LocationEventInput, ManualReflection,
    MemoryGrowthSnapshot, MvpRealityCheckSnapshot, NorthStarLiveReplyStreamEvent, NorthStarSnapshot, NorthStarTurnProcessingResult, SimulationRunInput, SimulationRunResult, SimulationScenario,
    NorthStarRuntimeSnapshot, SimulationSuiteResult, OutreachDispatchResult, PassiveContextSnapshot, PhaseOneSnapshot, NorthStarRtcIceServer, NorthStarWebRtcSignal,
    PhaseThreeSnapshot, Place, PushSpeechStreamAudioInput, SpeechStreamSnapshot, StartSpeechStreamInput, StopSpeechStreamInput, VoiceSnapshot, VoiceSynthesisResult,
    ProtectedRule, RawLocationEvent, RunCallTurnInput, SettingsEntry, StartCallSessionInput, SubmitFeedbackInput, UpdateMemoryItemInput,
    TelegramCallActionResult, TelegramCallTransportSnapshot, TelegramConnectionSnapshot, TelegramSendResult, TelegramUserActionResult, TelegramUserSnapshot, UpdatePlaceInput, UpdateRuleInput,
  },
  north_star,
  state::AppState,
  telegram_call,
  telegram_user,
  voice,
};

#[tauri::command]
pub fn load_settings(state: State<'_, AppState>) -> Result<AppSettings, AppError> {
  state.push_event("Loaded settings from SQLite.");
  db::load_settings(&state.db_path)
}

#[tauri::command]
pub fn save_settings(
  state: State<'_, AppState>,
  payload: AppSettings,
) -> Result<Vec<SettingsEntry>, AppError> {
  let rows = db::save_settings(&state.db_path, &payload)?;
  state.push_event(format!("Saved {} settings entries.", rows.len()));
  Ok(rows)
}

#[tauri::command]
pub fn get_diagnostics(state: State<'_, AppState>) -> Result<DiagnosticStatus, AppError> {
  db::diagnostics(
    &state.app_data_dir,
    &state.db_path,
    state.last_initialized_at.as_str(),
    state.events(),
  )
}

#[tauri::command]
pub fn get_north_star_snapshot(state: State<'_, AppState>) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  north_star::fetch_snapshot(&settings, None)
}

#[tauri::command]
pub fn get_north_star_runtime_snapshot(state: State<'_, AppState>) -> Result<NorthStarRuntimeSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  north_star::fetch_runtime_snapshot(&settings)
}

#[tauri::command]
pub fn create_north_star_session(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let mut settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::create_session(&mut settings)?;
  db::save_settings(&state.db_path, &settings)?;
  state.push_event("Created North Star companion session.");
  Ok(snapshot)
}

#[tauri::command]
pub fn bind_north_star_desktop(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let mut settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::bind_desktop(&mut settings)?;
  db::save_settings(&state.db_path, &settings)?;
  state.push_event("Bound this desktop to North Star.");
  Ok(snapshot)
}

#[tauri::command]
pub fn send_north_star_heartbeat(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::send_heartbeat(&settings)?;
  state.push_event("Sent North Star heartbeat.");
  Ok(snapshot)
}

#[tauri::command]
pub fn send_north_star_message(
  state: State<'_, AppState>,
  text: String,
) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::send_desktop_message(&settings, &text)?;
  state.push_event("Sent desktop companion message into North Star.");
  Ok(snapshot)
}

#[tauri::command]
pub fn send_north_star_call_request(
  state: State<'_, AppState>,
  note: String,
) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::send_call_request(&settings, &note)?;
  state.push_event("Sent a North Star call request from the desktop.");
  Ok(snapshot)
}

#[tauri::command]
pub fn pull_north_star_location_events(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let mut settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::pull_location_events(&state.db_path, &mut settings)?;
  db::save_settings(&state.db_path, &settings)?;
  state.push_event("Pulled North Star location events into local context.");
  Ok(snapshot)
}

#[tauri::command]
pub fn import_north_star_call_reviews(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::fetch_snapshot(&settings, None)?;
  let mut imported = 0usize;

  for review in &snapshot.call_reviews {
    let text = if review.notes.trim().is_empty() {
      format!("North Star call review: this call felt {}.", review.sentiment)
    } else {
      format!(
        "North Star call review: this call felt {}. {}",
        review.sentiment,
        review.notes.trim()
      )
    };

    if db::create_reflection_if_missing(
      &state.db_path,
      &CreateReflectionInput {
        reflection_kind: "meaning".into(),
        text,
        linked_place_id: None,
        weight: 0.72,
        expires_at: None,
        is_sensitive: false,
      },
    )? {
      imported += 1;
    }
  }

  state.push_event(format!(
    "Imported {} North Star call review(s) into local reflections.",
    imported
  ));

  north_star::fetch_snapshot(
    &settings,
    Some(if imported == 0 {
      "No new North Star call reviews needed importing.".into()
    } else {
      format!("Imported {} North Star call review(s) into local reflections.", imported)
    }),
  )
}

fn process_next_north_star_call_turn_impl(
  state: &AppState,
) -> Result<NorthStarTurnProcessingResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, None)?;
  let active_session = session_snapshot
    .active_session
    .clone()
    .filter(|session| session.handoff_kind == "north_star_companion" && session.session_state == "active");

  let result = north_star::process_next_pending_turn(&settings, |call, turn| {
    let local_session = active_session.clone().ok_or_else(|| {
      AppError::Message("Start the accepted North Star call on the desktop before processing remote speech turns.".into())
    })?;
    let session_context = format!(
      "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nremote call id: {}\nrecent exchange:\n{}",
      local_session.handoff_kind,
      local_session.notes,
      local_session.outcome,
      local_session.transcript_summary,
      call.call_id,
      db::build_call_turn_context(&state.db_path, local_session.id, 3)?,
    );
    let input_audio = base64::engine::general_purpose::STANDARD
      .decode(turn.input_audio_base64.as_bytes())
      .map_err(|caught| AppError::Message(format!("North Star turn audio was invalid: {caught}")))?;
    let reply = voice::run_uploaded_call_turn(
      state.app_data_dir.as_ref().as_path(),
      &settings,
      &state.voice_worker,
      &state.kokoro_fastapi_runtime,
      local_session.id,
      &input_audio,
      &session_context,
    )?;
    db::save_call_turn(
      &state.db_path,
      local_session.id,
      &reply.transcript_text,
      &reply.reply_text,
      &reply.reply_mode,
    )?;
    Ok(reply)
  })?;

  if result.processed {
    state.push_event(result.detail.clone());
  }

  Ok(result)
}

#[tauri::command]
pub async fn process_next_north_star_call_turn(
  state: State<'_, AppState>,
) -> Result<NorthStarTurnProcessingResult, AppError> {
  let state = state.inner().clone();
  async_runtime::spawn_blocking(move || process_next_north_star_call_turn_impl(&state))
    .await
    .map_err(|caught| AppError::Message(format!("North Star turn processor task failed: {caught}")))?
}

fn process_north_star_live_turn_impl(
  state: &AppState,
  session_id: i64,
  audio_base64: String,
) -> Result<CallTurnResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, Some(session_id))?;
  let session = session_snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active North Star live call session.".into()))?;

  if session.handoff_kind != "north_star_companion" {
    return Err(AppError::Message("The active session is not a North Star call.".into()));
  }

  let input_audio = base64::engine::general_purpose::STANDARD
    .decode(audio_base64.as_bytes())
    .map_err(|caught| AppError::Message(format!("North Star live audio was invalid: {caught}")))?;

  let session_context = format!(
    "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nrecent exchange:\n{}",
    session.handoff_kind,
    session.notes,
    session.outcome,
    session.transcript_summary,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  );

  let result = voice::run_uploaded_call_turn(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
    session.id,
    &input_audio,
    &session_context,
  )?;

  db::save_call_turn(
    &state.db_path,
    session.id,
    &result.transcript_text,
    &result.reply_text,
    &result.reply_mode,
  )?;

  state.push_event(format!("Processed a live North Star turn for session {}.", session.id));
  Ok(result)
}

#[tauri::command]
pub async fn process_north_star_live_turn(
  state: State<'_, AppState>,
  session_id: i64,
  audio_base64: String,
) -> Result<CallTurnResult, AppError> {
  let state = state.inner().clone();
  async_runtime::spawn_blocking(move || process_north_star_live_turn_impl(&state, session_id, audio_base64))
    .await
    .map_err(|caught| AppError::Message(format!("North Star live turn task failed: {caught}")))?
}

fn stream_north_star_live_turn_impl(
  app: AppHandle,
  state: &AppState,
  session_id: i64,
  audio_base64: String,
  request_id: String,
) -> Result<(), AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, Some(session_id))?;
  let session = session_snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active North Star live call session.".into()))?;

  if session.handoff_kind != "north_star_companion" {
    return Err(AppError::Message("The active session is not a North Star call.".into()));
  }

  let input_audio = base64::engine::general_purpose::STANDARD
    .decode(audio_base64.as_bytes())
    .map_err(|caught| AppError::Message(format!("North Star live audio was invalid: {caught}")))?;

  let session_context = format!(
    "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nrecent exchange:\n{}",
    session.handoff_kind,
    session.notes,
    session.outcome,
    session.transcript_summary,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  );

  let result = voice::run_uploaded_call_turn_streaming(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
    session.id,
    &input_audio,
    &session_context,
    &request_id,
    |event: NorthStarLiveReplyStreamEvent| {
      app.emit("north-star-live-reply-stream", &event)
        .map_err(|caught| AppError::Message(format!("Could not emit North Star live reply event: {caught}")))?;
      Ok(())
    },
  )?;

  db::save_call_turn(
    &state.db_path,
    session.id,
    &result.transcript_text,
    &result.reply_text,
    &result.reply_mode,
  )?;

  state.push_event(format!("Streamed a live North Star turn for session {}.", session.id));
  Ok(())
}

fn complete_north_star_live_speech_stream_impl(
  state: &AppState,
  session_id: i64,
  request_id: String,
  handler: &Channel<NorthStarLiveReplyStreamEvent>,
) -> Result<(), AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, Some(session_id))?;
  let session = session_snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active North Star live call session.".into()))?;

  if session.handoff_kind != "north_star_companion" {
    return Err(AppError::Message("The active session is not a North Star call.".into()));
  }

  let session_context = format!(
    "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nrecent exchange:\n{}",
    session.handoff_kind,
    session.notes,
    session.outcome,
    session.transcript_summary,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  );

  let result = voice::stop_speech_stream_and_stream_reply(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.speech_stream_worker,
    &state.kokoro_fastapi_runtime,
    session.id,
    &session_context,
    &request_id,
    |event: NorthStarLiveReplyStreamEvent| {
      handler
        .send(event)
        .map_err(|caught| AppError::Message(format!("Could not send North Star live reply event over channel: {caught}")))?;
      Ok(())
    },
  )?;

  db::save_call_turn(
    &state.db_path,
    session.id,
    &result.transcript_text,
    &result.reply_text,
    &result.reply_mode,
  )?;

  state.push_event(format!("Completed a streamed North Star speech turn for session {}.", session.id));
  Ok(())
}

#[tauri::command]
pub async fn start_north_star_live_turn_stream(
  app: AppHandle,
  state: State<'_, AppState>,
  session_id: i64,
  audio_base64: String,
  request_id: String,
) -> Result<(), AppError> {
  let state = state.inner().clone();
  async_runtime::spawn_blocking(move || {
    let result = stream_north_star_live_turn_impl(app.clone(), &state, session_id, audio_base64, request_id.clone());
    if let Err(error) = result {
      let _ = app.emit(
        "north-star-live-reply-stream",
        &NorthStarLiveReplyStreamEvent {
          request_id,
          phase: "error".into(),
          transcript_text: None,
          reply_text: None,
          reply_mode: None,
          text_chunk: None,
          audio_base64: None,
          audio_slice: None,
          sample_rate: None,
          chunk_index: None,
          part_index: None,
          total_parts: None,
          message: Some(error.to_string()),
        },
      );
      return Err(error);
    }
    Ok(())
  })
    .await
    .map_err(|caught| AppError::Message(format!("North Star live stream task failed: {caught}")))?
}

#[tauri::command]
pub async fn complete_north_star_live_speech_stream(
  state: State<'_, AppState>,
  session_id: i64,
  request_id: String,
  handler: Channel<NorthStarLiveReplyStreamEvent>,
) -> Result<(), AppError> {
  let state = state.inner().clone();
  async_runtime::spawn_blocking(move || {
    let result = complete_north_star_live_speech_stream_impl(&state, session_id, request_id.clone(), &handler);
    if let Err(error) = result {
      let _ = handler.send(NorthStarLiveReplyStreamEvent {
        request_id,
        phase: "error".into(),
        transcript_text: None,
        reply_text: None,
        reply_mode: None,
        text_chunk: None,
        audio_base64: None,
        audio_slice: None,
        sample_rate: None,
        chunk_index: None,
        part_index: None,
        total_parts: None,
        message: Some(error.to_string()),
      });
    }
  });
  Ok(())
}

#[tauri::command]
pub fn send_north_star_webrtc_signal(
  state: State<'_, AppState>,
  call_id: String,
  signal_kind: String,
  payload_json: String,
) -> Result<(), AppError> {
  let settings = db::load_settings(&state.db_path)?;
  north_star::send_desktop_webrtc_signal(&settings, &call_id, &signal_kind, &payload_json)?;
  state.push_event(format!(
    "Queued North Star WebRTC signal '{}' for call {}.",
    signal_kind,
    call_id
  ));
  Ok(())
}

#[tauri::command]
pub fn pull_north_star_webrtc_signals(
  state: State<'_, AppState>,
  call_id: String,
) -> Result<Vec<NorthStarWebRtcSignal>, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  north_star::pull_desktop_webrtc_signals(&settings, &call_id)
}

#[tauri::command]
pub fn get_north_star_rtc_config(
  state: State<'_, AppState>,
) -> Result<Vec<NorthStarRtcIceServer>, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  north_star::fetch_rtc_config(&settings)
}

#[tauri::command]
pub fn get_voice_snapshot(state: State<'_, AppState>) -> Result<VoiceSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let worker_loaded = state
    .voice_worker
    .lock()
    .map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?
    .is_some();
  voice::voice_snapshot(state.app_data_dir.as_ref().as_path(), &settings, worker_loaded, &state.kokoro_fastapi_runtime)
}

#[tauri::command]
pub fn get_call_session_snapshot(
  state: State<'_, AppState>,
) -> Result<CallSessionSnapshot, AppError> {
  let runtime_active_session_id = *state
    .active_call_session_id
    .lock()
    .map_err(|_| AppError::Message("Call session mutex was poisoned.".into()))?;
  db::call_session_snapshot(&state.db_path, runtime_active_session_id)
}

#[tauri::command]
pub fn get_call_turns_for_session(
  state: State<'_, AppState>,
  session_id: i64,
) -> Result<Vec<CallTurnRecord>, AppError> {
  db::call_turns_for_session(&state.db_path, session_id)
}

#[tauri::command]
pub fn download_kokoro_assets(
  state: State<'_, AppState>,
) -> Result<VoiceSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  voice::download_kokoro_assets(state.app_data_dir.as_ref().as_path(), &settings)?;
  let worker_loaded = state
    .voice_worker
    .lock()
    .map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?
    .is_some();
  let snapshot = voice::voice_snapshot(state.app_data_dir.as_ref().as_path(), &settings, worker_loaded, &state.kokoro_fastapi_runtime)?;
  state.push_event("Downloaded Kokoro voice model files.");
  Ok(snapshot)
}

#[tauri::command]
pub fn prepare_kokoro_runtime(
  state: State<'_, AppState>,
) -> Result<VoiceSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  voice::prepare_python_runtime(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
  )?;
  let snapshot = voice::voice_snapshot(state.app_data_dir.as_ref().as_path(), &settings, true, &state.kokoro_fastapi_runtime)?;
  state.push_event("Prepared Kokoro Python runtime.");
  Ok(snapshot)
}

#[tauri::command]
pub fn setup_local_speech(
  state: State<'_, AppState>,
) -> Result<VoiceSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  voice::setup_local_speech(state.app_data_dir.as_ref().as_path(), &settings, &state.speech_stream_worker)?;
  let worker_loaded = state
    .voice_worker
    .lock()
    .map_err(|_| AppError::Message("Voice worker mutex was poisoned.".into()))?
    .is_some();
  let snapshot = voice::voice_snapshot(state.app_data_dir.as_ref().as_path(), &settings, worker_loaded, &state.kokoro_fastapi_runtime)?;
  state.push_event("Prepared local speech-input runtime.");
  Ok(snapshot)
}

#[tauri::command]
pub fn synthesize_voice_preview(
  state: State<'_, AppState>,
) -> Result<VoiceSynthesisResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = voice::synthesize_test_phrase(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
  )?;
  state.push_event(format!("Synthesized Kokoro voice preview at {}.", result.output_path));
  Ok(result)
}

#[tauri::command]
pub fn synthesize_north_star_phrase(
  state: State<'_, AppState>,
  text: String,
) -> Result<VoiceSynthesisResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = voice::synthesize_phrase(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
    text.trim(),
  )?;
  state.push_event(format!("Synthesized North Star line at {}.", result.output_path));
  Ok(result)
}

#[tauri::command]
pub fn get_speech_stream_snapshot(
  state: State<'_, AppState>,
) -> Result<SpeechStreamSnapshot, AppError> {
  let snapshot = voice::speech_stream_snapshot(&state.speech_stream_worker)?;
  Ok(SpeechStreamSnapshot {
    active: snapshot.active,
    started_at: snapshot.started_at,
    partial_text: snapshot.partial_text,
    final_text: snapshot.final_text,
    status: snapshot.status,
    last_error: snapshot.last_error,
  })
}

#[tauri::command]
pub fn start_speech_stream(
  state: State<'_, AppState>,
  payload: StartSpeechStreamInput,
) -> Result<SpeechStreamSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let call_session_snapshot = db::call_session_snapshot(&state.db_path, Some(payload.session_id))?;
  if call_session_snapshot.active_session.is_none() {
    return Err(AppError::Message("There is no active call session to listen on.".into()));
  }
  let snapshot = voice::start_speech_stream(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.speech_stream_worker,
  )?;
  state.push_event(format!("Started live speech stream for session {}.", payload.session_id));
  Ok(SpeechStreamSnapshot {
    active: snapshot.active,
    started_at: snapshot.started_at,
    partial_text: snapshot.partial_text,
    final_text: snapshot.final_text,
    status: snapshot.status,
    last_error: snapshot.last_error,
  })
}

#[tauri::command]
pub fn stop_speech_stream_and_reply(
  state: State<'_, AppState>,
  payload: StopSpeechStreamInput,
) -> Result<CallTurnResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, Some(payload.session_id))?;
  let session = session_snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active call session to stop.".into()))?;
  let session_context = format!(
    "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nrecent exchange:\n{}",
    session.handoff_kind,
    session.notes,
    session.outcome,
    session.transcript_summary,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  );
  let result = voice::stop_speech_stream_and_reply(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.speech_stream_worker,
    &state.kokoro_fastapi_runtime,
    payload.session_id,
    &session_context,
  )?;
  db::save_call_turn(
    &state.db_path,
    payload.session_id,
    &result.transcript_text,
    &result.reply_text,
    &result.reply_mode,
  )?;
  state.push_event(format!("Stopped live speech stream for session {} and generated a reply.", payload.session_id));
  Ok(result)
}

#[tauri::command]
pub fn push_speech_stream_audio(
  state: State<'_, AppState>,
  payload: PushSpeechStreamAudioInput,
) -> Result<SpeechStreamSnapshot, AppError> {
  let call_session_snapshot = db::call_session_snapshot(&state.db_path, Some(payload.session_id))?;
  if call_session_snapshot.active_session.is_none() {
    return Err(AppError::Message("There is no active call session to feed.".into()));
  }
  let snapshot = voice::push_speech_stream_audio(
    &state.speech_stream_worker,
    payload.session_id,
    &payload.audio_base64,
    payload.sample_rate as i32,
    payload.audio_format.as_deref().unwrap_or("pcm16le"),
  )?;
  Ok(SpeechStreamSnapshot {
    active: snapshot.active,
    started_at: snapshot.started_at,
    partial_text: snapshot.partial_text,
    final_text: snapshot.final_text,
    status: snapshot.status,
    last_error: snapshot.last_error,
  })
}

#[tauri::command]
pub fn run_call_turn(
  state: State<'_, AppState>,
  payload: RunCallTurnInput,
) -> Result<CallTurnResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_snapshot = db::call_session_snapshot(&state.db_path, Some(payload.session_id))?;
  let session = session_snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active call session to use for a spoken turn.".into()))?;
  let session_context = format!(
    "handoff kind: {}\nnotes: {}\noutcome so far: {}\ntranscript summary so far: {}\nrecent exchange:\n{}",
    session.handoff_kind,
    session.notes,
    session.outcome,
    session.transcript_summary,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  );
  let result = voice::run_call_turn(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
    payload.session_id,
    payload.duration_seconds,
    &session_context,
  )?;
  db::save_call_turn(
    &state.db_path,
    payload.session_id,
    &result.transcript_text,
    &result.reply_text,
    &result.reply_mode,
  )?;
  state.push_event(format!(
    "Ran spoken call turn for session {}.",
    payload.session_id
  ));
  Ok(result)
}

#[tauri::command]
pub fn clear_voice_assets(state: State<'_, AppState>) -> Result<VoiceSnapshot, AppError> {
  voice::clear_voice_assets(
    state.app_data_dir.as_ref().as_path(),
    &state.voice_worker,
    &state.speech_stream_worker,
    &state.kokoro_fastapi_runtime,
  )?;
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = voice::voice_snapshot(state.app_data_dir.as_ref().as_path(), &settings, false, &state.kokoro_fastapi_runtime)?;
  state.push_event("Cleared local voice assets.");
  Ok(snapshot)
}

#[tauri::command]
pub fn clear_all_local_data(state: State<'_, AppState>) -> Result<(), AppError> {
  db::clear_all_local_data(&state.db_path)?;
  voice::clear_voice_assets(
    state.app_data_dir.as_ref().as_path(),
    &state.voice_worker,
    &state.speech_stream_worker,
    &state.kokoro_fastapi_runtime,
  )?;
  telegram_user::clear_local_session(state.app_data_dir.as_ref().as_path())?;
  telegram_call::clear_local_state(state.app_data_dir.as_ref().as_path())?;
  state.push_event("Cleared all local app data and voice assets.");
  Ok(())
}

#[tauri::command]
pub fn create_place(
  state: State<'_, AppState>,
  payload: CreatePlaceInput,
) -> Result<Place, AppError> {
  let place = db::create_place(&state.db_path, &payload)?;
  state.push_event(format!("Added place '{}'.", place.label));
  Ok(place)
}

#[tauri::command]
pub fn create_rule(
  state: State<'_, AppState>,
  payload: CreateRuleInput,
) -> Result<ProtectedRule, AppError> {
  let rule = db::create_rule(&state.db_path, &payload)?;
  state.push_event(format!("Added rule '{}'.", rule.rule_kind));
  Ok(rule)
}

#[tauri::command]
pub fn update_place(
  state: State<'_, AppState>,
  payload: UpdatePlaceInput,
) -> Result<Place, AppError> {
  let place = db::update_place(&state.db_path, &payload)?;
  state.push_event(format!("Updated place '{}' review fields.", place.label));
  Ok(place)
}

#[tauri::command]
pub fn update_rule(
  state: State<'_, AppState>,
  payload: UpdateRuleInput,
) -> Result<ProtectedRule, AppError> {
  let rule = db::update_rule(&state.db_path, &payload)?;
  state.push_event(format!("Updated rule '{}' review fields.", rule.rule_kind));
  Ok(rule)
}

#[tauri::command]
pub fn create_reflection(
  state: State<'_, AppState>,
  payload: CreateReflectionInput,
) -> Result<ManualReflection, AppError> {
  let reflection = db::create_reflection(&state.db_path, &payload)?;
  state.push_event(format!("Added reflection '{}'.", reflection.reflection_kind));
  Ok(reflection)
}

#[tauri::command]
pub fn get_memory_growth_snapshot(
  state: State<'_, AppState>,
) -> Result<MemoryGrowthSnapshot, AppError> {
  db::memory_growth_snapshot(&state.db_path)
}

#[tauri::command]
pub fn run_memory_growth_pass(
  state: State<'_, AppState>,
) -> Result<MemoryGrowthSnapshot, AppError> {
  let snapshot = db::run_memory_growth_pass(&state.db_path)?;
  state.push_event("Ran memory growth pass.");
  Ok(snapshot)
}

#[tauri::command]
pub fn update_memory_item(
  state: State<'_, AppState>,
  payload: UpdateMemoryItemInput,
) -> Result<MemoryGrowthSnapshot, AppError> {
  let snapshot = db::update_memory_item(&state.db_path, &payload)?;
  state.push_event(format!(
    "Updated memory item {} with action '{}'.",
    payload.id, payload.action
  ));
  Ok(snapshot)
}

#[tauri::command]
pub fn get_phase_one_snapshot(
  state: State<'_, AppState>,
) -> Result<PhaseOneSnapshot, AppError> {
  db::phase_one_snapshot(&state.db_path)
}

#[tauri::command]
pub fn ingest_location_event(
  state: State<'_, AppState>,
  payload: LocationEventInput,
) -> Result<RawLocationEvent, AppError> {
  let event = db::ingest_location_event(&state.db_path, &payload)?;
  state.push_event(format!(
    "Ingested {} location event at {}, {}.",
    event.movement_state, event.latitude, event.longitude
  ));
  Ok(event)
}

#[tauri::command]
pub fn get_passive_context_snapshot(
  state: State<'_, AppState>,
) -> Result<PassiveContextSnapshot, AppError> {
  db::passive_context_snapshot(&state.db_path)
}

#[tauri::command]
pub fn get_phase_three_snapshot(
  state: State<'_, AppState>,
) -> Result<PhaseThreeSnapshot, AppError> {
  db::phase_three_snapshot(&state.db_path)
}

#[tauri::command]
pub fn send_test_telegram_message(
  state: State<'_, AppState>,
) -> Result<TelegramSendResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  if settings.telegram_bot_token.trim().is_empty() {
    return Err(AppError::Message("Telegram bot token is missing.".into()));
  }
  if settings.telegram_default_chat_id.trim().is_empty() {
    return Err(AppError::Message("Telegram default chat ID is missing.".into()));
  }

  let message_text = "Neural Trainer test message: Telegram connection is live and local logging is enabled.";
  let client = reqwest::blocking::Client::new();
  let response = client
    .post(format!(
      "https://api.telegram.org/bot{}/sendMessage",
      settings.telegram_bot_token
    ))
    .json(&json!({
      "chat_id": settings.telegram_default_chat_id,
      "text": message_text
    }))
    .send()?;

  let body: serde_json::Value = response.json()?;
  let ok = body.get("ok").and_then(|value| value.as_bool()).unwrap_or(false);
  if !ok {
    return Err(AppError::Message(format!(
      "Telegram send failed: {}",
      body
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("unknown error")
    )));
  }

  let message_id = body
    .get("result")
    .and_then(|value| value.get("message_id"))
    .and_then(|value| value.as_i64());
  let chat_id_string = settings.telegram_default_chat_id.clone();
  let outreach_event = db::create_outreach_event(
    &state.db_path,
    None,
    "Manual Telegram connection test.",
    message_text,
    0.99,
    true,
    &json!({
      "chat_id": chat_id_string,
      "telegram_message_id": message_id
    })
    .to_string(),
  )?;

  state.push_event("Sent Telegram test message.");

  Ok(TelegramSendResult {
    outreach_event,
    telegram_chat_id: settings.telegram_default_chat_id,
    telegram_message_id: message_id,
  })
}

#[tauri::command]
pub fn poll_telegram_updates(
  state: State<'_, AppState>,
) -> Result<TelegramConnectionSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  if settings.telegram_bot_token.trim().is_empty() {
    return Err(AppError::Message("Telegram bot token is missing.".into()));
  }

  let client = reqwest::blocking::Client::new();
  let response = client
    .get(format!(
      "https://api.telegram.org/bot{}/getUpdates",
      settings.telegram_bot_token
    ))
    .query(&[
      ("timeout", "1"),
      ("allowed_updates", "[\"message\"]"),
      ("offset", &(settings.telegram_last_update_id + 1).to_string()),
    ])
    .send()?;

  let body: serde_json::Value = response.json()?;
  let ok = body.get("ok").and_then(|value| value.as_bool()).unwrap_or(false);
  if !ok {
    return Err(AppError::Message(format!(
      "Telegram polling failed: {}",
      body
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("unknown error")
    )));
  }

  let mut last_update_id = settings.telegram_last_update_id;
  let mut stored_count = 0;

  if let Some(results) = body.get("result").and_then(|value| value.as_array()) {
    for update in results {
      let update_id = match update.get("update_id").and_then(|value| value.as_i64()) {
        Some(value) => value,
        None => continue,
      };
      last_update_id = last_update_id.max(update_id);

      let message = match update.get("message") {
        Some(value) => value,
        None => continue,
      };
      let chat_id = message
        .get("chat")
        .and_then(|value| value.get("id"))
        .map(|value| {
          value
            .as_i64()
            .map(|number| number.to_string())
            .or_else(|| value.as_str().map(ToOwned::to_owned))
        })
        .flatten()
        .unwrap_or_default();
      let sender_id = message
        .get("from")
        .and_then(|value| value.get("id"))
        .map(|value| {
          value
            .as_i64()
            .map(|number| number.to_string())
            .or_else(|| value.as_str().map(ToOwned::to_owned))
        })
        .flatten();
      let telegram_message_id = message.get("message_id").and_then(|value| value.as_i64());
      let received_at = message
        .get("date")
        .and_then(|value| value.as_i64())
        .and_then(|timestamp| chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0))
        .map(|datetime| datetime.to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
      let mut stored_inbound = false;

      if let Some(location) = message.get("location") {
        if let (Some(latitude), Some(longitude)) = (
          location.get("latitude").and_then(|value| value.as_f64()),
          location.get("longitude").and_then(|value| value.as_f64()),
        ) {
          let accuracy_meters = location
            .get("horizontal_accuracy")
            .and_then(|value| value.as_f64());
          let speed_mps = location.get("speed").and_then(|value| value.as_f64());
          let is_live = message.get("live_period").and_then(|value| value.as_i64()).is_some()
            || location.get("live_period").and_then(|value| value.as_i64()).is_some();
          let source = if is_live {
            "telegram_live_location"
          } else {
            "telegram_location"
          };

          db::ingest_location_event(
            &state.db_path,
            &LocationEventInput {
              occurred_at: received_at.clone(),
              latitude,
              longitude,
              accuracy_meters,
              speed_mps,
              source: source.to_string(),
            },
          )?;

          if db::save_inbound_message(
            &state.db_path,
            update_id,
            telegram_message_id,
            &chat_id,
            sender_id.as_deref(),
            &format!("[location] {latitude:.6}, {longitude:.6}"),
            &received_at,
          )?
          .is_some()
          {
            stored_count += 1;
            stored_inbound = true;
          }
        }
      }

      let text = message.get("text").and_then(|value| value.as_str());
      if !stored_inbound {
        let text = match text {
          Some(value) if !value.trim().is_empty() => value,
          _ => continue,
        };

        if db::save_inbound_message(
          &state.db_path,
          update_id,
          telegram_message_id,
          &chat_id,
          sender_id.as_deref(),
          text,
          &received_at,
        )?
        .is_some()
        {
          stored_count += 1;
        }
      }
    }
  }

  if last_update_id > settings.telegram_last_update_id {
    db::update_telegram_last_update_id(&state.db_path, last_update_id)?;
  }

  state.push_event(format!("Polled Telegram updates and stored {} new replies.", stored_count));
  db::telegram_connection_snapshot(&state.db_path)
}

#[tauri::command]
pub fn get_telegram_connection_snapshot(
  state: State<'_, AppState>,
) -> Result<TelegramConnectionSnapshot, AppError> {
  db::telegram_connection_snapshot(&state.db_path)
}

#[tauri::command]
pub fn get_telegram_user_snapshot(
  state: State<'_, AppState>,
) -> Result<TelegramUserSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  telegram_user::snapshot(state.app_data_dir.as_ref().as_path(), &settings)
}

#[tauri::command]
pub fn get_telegram_call_transport_snapshot(
  state: State<'_, AppState>,
) -> Result<TelegramCallTransportSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  telegram_call::snapshot(state.app_data_dir.as_ref().as_path(), &settings)
}

#[tauri::command]
pub fn prepare_telegram_user_runtime(
  state: State<'_, AppState>,
) -> Result<TelegramUserSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = telegram_user::prepare_runtime(state.app_data_dir.as_ref().as_path(), &settings)?;
  state.push_event("Prepared Telegram user MTProto runtime.");
  Ok(snapshot)
}

#[tauri::command]
pub fn prepare_telegram_call_transport(
  state: State<'_, AppState>,
) -> Result<TelegramCallTransportSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = telegram_call::prepare_runtime(state.app_data_dir.as_ref().as_path(), &settings)?;
  state.push_event("Prepared Telegram private-call transport runtime.");
  Ok(snapshot)
}

#[tauri::command]
pub fn start_telegram_test_call(
  state: State<'_, AppState>,
) -> Result<TelegramCallActionResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = telegram_call::start_test_call(state.app_data_dir.as_ref().as_path(), &settings)?;
  state.push_event("Started Telegram MTProto test call request.");
  Ok(result)
}

#[tauri::command]
pub fn send_telegram_user_login_code(
  state: State<'_, AppState>,
) -> Result<TelegramUserActionResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = telegram_user::send_login_code(state.app_data_dir.as_ref().as_path(), &settings)?;
  state.push_event("Sent Telegram user login code.");
  Ok(result)
}

#[tauri::command]
pub fn complete_telegram_user_login(
  state: State<'_, AppState>,
  payload: CompleteTelegramUserLoginInput,
) -> Result<TelegramUserActionResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = telegram_user::complete_login(state.app_data_dir.as_ref().as_path(), &settings, &payload)?;
  state.push_event("Completed Telegram user login.");
  Ok(result)
}

#[tauri::command]
pub fn logout_telegram_user(
  state: State<'_, AppState>,
) -> Result<TelegramUserActionResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let result = telegram_user::logout(state.app_data_dir.as_ref().as_path(), &settings)?;
  state.push_event("Logged out Telegram user session.");
  Ok(result)
}

#[tauri::command]
pub fn dispatch_drafted_outreach(
  state: State<'_, AppState>,
) -> Result<OutreachDispatchResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  if settings.telegram_bot_token.trim().is_empty() {
    return Err(AppError::Message("Telegram bot token is missing.".into()));
  }
  if settings.telegram_default_chat_id.trim().is_empty() {
    return Err(AppError::Message("Telegram default chat ID is missing.".into()));
  }

  let drafted_events = db::drafted_outreach_events(&state.db_path)?;
  let client = reqwest::blocking::Client::new();
  let mut sent_count = 0;
  let mut failed_count = 0;
  let mut outreach_events = Vec::new();

  if let Some(event) = drafted_events.into_iter().next() {
    let response = client
      .post(format!(
        "https://api.telegram.org/bot{}/sendMessage",
        settings.telegram_bot_token
      ))
      .json(&json!({
        "chat_id": settings.telegram_default_chat_id,
        "text": event.message_text
      }))
      .send();

    match response {
      Ok(response) => {
        let body: serde_json::Value = response.json()?;
        let ok = body.get("ok").and_then(|value| value.as_bool()).unwrap_or(false);
        if ok {
          let message_id = body
            .get("result")
            .and_then(|value| value.get("message_id"))
            .and_then(|value| value.as_i64());
          let updated = db::mark_outreach_event_delivery(
            &state.db_path,
            event.id,
            true,
            "sent",
            &json!({
              "chat_id": settings.telegram_default_chat_id,
              "telegram_message_id": message_id
            })
            .to_string(),
          )?;
          sent_count += 1;
          outreach_events.push(updated);
        } else {
          let updated = db::mark_outreach_event_delivery(
            &state.db_path,
            event.id,
            false,
            "failed",
            &json!({
              "chat_id": settings.telegram_default_chat_id,
              "error": body.get("description").and_then(|value| value.as_str()).unwrap_or("unknown error")
            })
            .to_string(),
          )?;
          failed_count += 1;
          outreach_events.push(updated);
        }
      }
      Err(caught) => {
        let updated = db::mark_outreach_event_delivery(
          &state.db_path,
          event.id,
          false,
          "failed",
          &json!({
            "chat_id": settings.telegram_default_chat_id,
            "error": caught.to_string()
          })
          .to_string(),
        )?;
        failed_count += 1;
        outreach_events.push(updated);
      }
    }
  }

  state.push_event(format!(
    "Dispatched drafted outreach one-at-a-time: {} sent, {} failed.",
    sent_count, failed_count
  ));

  Ok(OutreachDispatchResult {
    sent_count,
    failed_count,
    outreach_events,
  })
}

#[tauri::command]
pub fn start_call_session(
  state: State<'_, AppState>,
  payload: StartCallSessionInput,
) -> Result<CallSessionSnapshot, AppError> {
  let session = db::start_call_session(&state.db_path, &payload)?;
  {
    let mut runtime_active = state
      .active_call_session_id
      .lock()
      .map_err(|_| AppError::Message("Call session mutex was poisoned.".into()))?;
    *runtime_active = Some(session.id);
  }
  state.push_event(format!(
    "Started call session {} with handoff '{}'.",
    session.id, session.handoff_kind
  ));
  db::call_session_snapshot(&state.db_path, Some(session.id))
}

#[tauri::command]
pub fn start_north_star_accepted_call(
  state: State<'_, AppState>,
) -> Result<CallSessionSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let accepted = north_star::latest_accepted_call(&settings)?
    .ok_or_else(|| AppError::Message("No accepted North Star call is waiting yet.".into()))?;

  let session = db::start_call_session(
    &state.db_path,
    &StartCallSessionInput {
      outreach_event_id: None,
      handoff_kind: "north_star_companion".into(),
      notes: format!(
        "Started from North Star accepted call request {}. {}",
        accepted.call_id,
        accepted.note
      )
      .trim()
      .into(),
    },
  )?;

  {
    let mut runtime_active = state
      .active_call_session_id
      .lock()
      .map_err(|_| AppError::Message("Call session mutex was poisoned.".into()))?;
    *runtime_active = Some(session.id);
  }

  state.push_event("Started a local call session from an accepted North Star call.");
  db::call_session_snapshot(&state.db_path, Some(session.id))
}

#[tauri::command]
pub fn end_call_session(
  state: State<'_, AppState>,
  payload: EndCallSessionInput,
) -> Result<CallSessionSnapshot, AppError> {
  voice::stop_speech_stream(&state.speech_stream_worker);
  let session = db::end_call_session(&state.db_path, &payload)?;
  if session.handoff_kind == "north_star_companion" {
    let settings = db::load_settings(&state.db_path)?;
    let _ = north_star::end_latest_accepted_call(&settings);
  }
  {
    let mut runtime_active = state
      .active_call_session_id
      .lock()
      .map_err(|_| AppError::Message("Call session mutex was poisoned.".into()))?;
    if runtime_active.as_ref() == Some(&payload.session_id) {
      *runtime_active = None;
    }
  }
  state.push_event(format!(
    "Ended call session {} with outcome '{}'.",
    session.id, session.outcome
  ));
  db::call_session_snapshot(&state.db_path, None)
}

#[tauri::command]
pub fn run_message_decisions(
  state: State<'_, AppState>,
) -> Result<DecisionRunResult, AppError> {
  let result = db::run_message_decisions(&state.db_path)?;
  state.push_event(format!(
    "Ran message decisions: {} promoted, {} suppressed.",
    result.promoted_count, result.suppressed_count
  ));
  Ok(result)
}

#[tauri::command]
pub fn run_call_request_decisions(
  state: State<'_, AppState>,
) -> Result<DecisionRunResult, AppError> {
  let result = db::run_call_request_decisions(&state.db_path)?;
  state.push_event(format!(
    "Ran call-request decisions: {} promoted, {} suppressed.",
    result.promoted_count, result.suppressed_count
  ));
  Ok(result)
}

#[tauri::command]
pub fn get_decision_snapshot(
  state: State<'_, AppState>,
) -> Result<DecisionSnapshot, AppError> {
  db::decision_snapshot(&state.db_path)
}

#[tauri::command]
pub fn get_mvp_reality_check_snapshot(
  state: State<'_, AppState>,
) -> Result<MvpRealityCheckSnapshot, AppError> {
  db::mvp_reality_check_snapshot(&state.db_path)
}

#[tauri::command]
pub fn seed_mvp_reality_check_scenario(
  state: State<'_, AppState>,
) -> Result<MvpRealityCheckSnapshot, AppError> {
  let snapshot = db::seed_mvp_reality_check_scenario(&state.db_path)?;
  state.push_event("Seeded MVP reality-check scenario.");
  Ok(snapshot)
}

#[tauri::command]
pub fn reset_runtime_data(state: State<'_, AppState>) -> Result<(), AppError> {
  db::reset_runtime_data(&state.db_path)?;
  state.push_event("Cleared runtime data while keeping settings.");
  Ok(())
}

#[tauri::command]
pub fn list_simulation_scenarios() -> Result<Vec<SimulationScenario>, AppError> {
  Ok(db::simulation_scenarios())
}

#[tauri::command]
pub fn run_simulation_scenario(
  state: State<'_, AppState>,
  payload: SimulationRunInput,
) -> Result<SimulationRunResult, AppError> {
  let result = db::run_simulation_scenario(&state.db_path, &payload)?;
  state.push_event(format!("Ran simulation scenario '{}'.", result.scenario_label));
  Ok(result)
}

#[tauri::command]
pub fn run_automated_simulation_suite() -> Result<SimulationSuiteResult, AppError> {
  db::run_automated_simulation_suite()
}

#[tauri::command]
pub fn submit_outreach_feedback(
  state: State<'_, AppState>,
  payload: SubmitFeedbackInput,
) -> Result<TelegramConnectionSnapshot, AppError> {
  let feedback = db::submit_outreach_feedback(&state.db_path, &payload)?;
  state.push_event(format!(
    "Recorded outreach feedback '{}' for event {}.",
    feedback.feedback_kind, feedback.outreach_event_id
  ));
  db::telegram_connection_snapshot(&state.db_path)
}
