use std::{
  thread,
  time::Duration,
};

use base64::Engine as _;
use tauri::{async_runtime, ipc::Channel, AppHandle, Emitter, State};

use crate::{
  db,
  error::AppError,
  models::{
    AppSettings, CallSession, CallSessionSnapshot, CallTurnRecord, CallTurnResult, CreateNearbyInterestFilterInput, CreatePlaceInput, CreateReflectionInput, CreateRuleInput, DiagnosticStatus,
    CompanionContextCategory, CompanionContextEntry, CompanionContextSnapshot, CompanionHomeSnapshot, CreateCompanionContextCategoryInput, CreateCompanionContextEntryInput, DeleteCompanionContextCategoryInput, ReorderCompanionContextEntriesInput, UpdateCompanionContextCategoryIconInput,
    DecisionRunResult, DecisionSnapshot, DraftedOutreachAutoDispatchResult, DraftedOutreachDispatchResult, EndCallSessionInput, LocationEventInput, ManualReflection,
    LivedMomentSnapshot, MemoryGrowthSnapshot, MemorySystemSnapshot, MvpRealityCheckSnapshot, NearbyInterestFilter, NorthStarLiveReplyStreamEvent, NorthStarPairingCode, NorthStarSnapshot, NorthStarTurnProcessingResult, RealWorldPresenceSnapshot, SimulationRunInput, SimulationRunResult, SimulationScenario,
    NorthStarRuntimeSnapshot, SimulationSuiteResult, PassiveContextSnapshot, PhaseOneSnapshot, NorthStarRtcIceServer, NorthStarWebRtcSignal,
    PhaseThreeSnapshot, Place, PushSpeechStreamAudioInput, SpeechStreamSnapshot, StartSpeechStreamInput, StopSpeechStreamInput, VoiceSnapshot, VoiceSynthesisResult,
    ProtectedRule, RawLocationEvent, RunCallTurnInput, SettingsEntry, StartCallSessionInput, UpdateCompanionContextEntryInput, UpdateMemoryItemInput,
    UpdateNearbyInterestFilterInput, UpdatePlaceInput, UpdateRuleInput,
  },
  north_star,
  state::AppState,
  voice,
};

const NORTH_STAR_PHONE_OUTBOUND_NOTE: &str = "North Star is calling from your phone.";

fn session_note_field(notes: &str, key: &str) -> Option<String> {
  notes
    .lines()
    .find_map(|line| line.trim().strip_prefix(key).map(|value| value.trim().to_string()))
    .filter(|value| !value.is_empty())
}

fn infer_north_star_call_origin_and_purpose(raw_note: &str) -> (&'static str, String) {
  let trimmed = raw_note.trim();
  if trimmed.eq_ignore_ascii_case(NORTH_STAR_PHONE_OUTBOUND_NOTE) {
    (
      "user_initiated_from_phone",
      "The user initiated this call from North Star and is looking to talk with you now.".into(),
    )
  } else if trimmed.is_empty() {
    (
      "desktop_outreach",
      "You initiated this outreach call because something meaningful suggested it was a good moment to gently check in.".into(),
    )
  } else {
    ("desktop_outreach", trimmed.into())
  }
}

fn build_north_star_session_notes(remote_call_id: &str, raw_note: &str) -> String {
  let (call_origin, outreach_purpose) = infer_north_star_call_origin_and_purpose(raw_note);
  format!(
    "remote_call_id: {remote_call_id}\ncall_origin: {call_origin}\noutreach_purpose: {outreach_purpose}\nraw_note: {}",
    raw_note.trim()
  )
}

fn build_north_star_session_context(state: &AppState, session: &CallSession) -> Result<String, AppError> {
  let call_origin = session_note_field(&session.notes, "call_origin:")
    .unwrap_or_else(|| infer_north_star_call_origin_and_purpose(&session.notes).0.to_string());
  let outreach_purpose = session_note_field(&session.notes, "outreach_purpose:")
    .unwrap_or_else(|| infer_north_star_call_origin_and_purpose(&session.notes).1);
  let raw_note = session_note_field(&session.notes, "raw_note:")
    .unwrap_or_else(|| session.notes.trim().to_string());
  let remote_call_id = session_note_field(&session.notes, "remote_call_id:")
    .unwrap_or_else(|| "unknown".into());
  let location_context = build_north_star_location_context(state)?;
  Ok(format!(
    "call mode: {}\noutreach purpose: {}\nremote call id: {}\nraw call note: {}\nhandoff kind: {}\noutcome so far: {}\ntranscript summary so far: {}\nlocation context:\n{}\nrecent exchange:\n{}",
    call_origin,
    outreach_purpose,
    remote_call_id,
    raw_note,
    session.handoff_kind,
    session.outcome,
    session.transcript_summary,
    location_context,
    db::build_call_turn_context(&state.db_path, session.id, 3)?,
  ))
}

fn build_north_star_location_context(state: &AppState) -> Result<String, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let lived_moment = db::lived_moment_snapshot(&state.db_path, &settings.timezone)?;
  let mut lines = Vec::new();

  lines.push("grounded world facts available right now:".into());
  lines.push(format!("- {}", db::current_location_context_summary(&state.db_path)?));

  if let Some(location) = lived_moment.latest_location_event.as_ref() {
    let accuracy = location
      .accuracy_meters
      .map(|value| format!("{value:.0}m"))
      .unwrap_or_else(|| "unknown".into());
    lines.push(format!(
      "- latest phone location fix: {} / {:.5}, {:.5} / movement {} / accuracy {} / source {}",
      location.occurred_at,
      location.latitude,
      location.longitude,
      location.movement_state,
      accuracy,
      location.source,
    ));
  } else {
    lines.push("- latest phone location fix: none available".into());
  }

  if let Some(place) = lived_moment.matched_place.as_ref() {
    lines.push(format!(
      "- matched meaningful place: {} ({})",
      place.label,
      place.place_kind,
    ));
  } else if let Some(place) = lived_moment.repeated_place.as_ref() {
    lines.push(format!(
      "- repeated place pattern: {} / {} visits",
      place.label,
      place.visit_count,
    ));
  } else {
    lines.push("- matched meaningful place: none".into());
  }

  lines.push(format!("- lived moment summary: {}", lived_moment.summary));
  lines.push("boundary: if a world fact is not explicitly listed above, treat it as unavailable rather than implied.".into());
  Ok(lines.join("\n"))
}

fn refresh_north_star_call_location_context_impl(
  state: &AppState,
  reason: &str,
) -> Result<(), AppError> {
  let mut settings = db::load_settings(&state.db_path)?;
  if settings.north_star_user_handle.trim().is_empty() || settings.north_star_device_token.trim().is_empty() {
    return Ok(());
  }

  match north_star::request_location_pulse(&settings) {
    Ok(_) => state.push_event(format!("Asked North Star for a fresh location pulse for {reason}.")),
    Err(caught) => {
      state.push_event(format!("North Star call location pulse could not be requested for {reason}: {caught}"));
      return Ok(());
    }
  }

  for attempt in 0..3 {
    thread::sleep(Duration::from_millis(1800));
    match north_star::pull_location_events(&state.db_path, &mut settings) {
      Ok(snapshot) => {
        db::save_settings(&state.db_path, &settings)?;
      state.push_event(format!("North Star call location refresh ({reason}): {}", snapshot.detail));
      let _ = db::get_real_world_presence_snapshot(&state.db_path);
      if !snapshot.detail.starts_with("No new North Star location events") || attempt == 2 {
        break;
      }
      }
      Err(caught) => {
        state.push_event(format!(
          "North Star call location pull attempt {} failed for {reason}: {}",
          attempt + 1,
          caught,
        ));
      }
    }
  }

  Ok(())
}

fn schedule_north_star_call_location_refresh(state: &AppState, reason: &str) {
  let state = state.clone();
  let reason = reason.to_string();
  async_runtime::spawn(async move {
    let refresh_state = state.clone();
    let refresh_reason = reason.clone();
    let _ = async_runtime::spawn_blocking(move || refresh_north_star_call_location_context_impl(&refresh_state, &refresh_reason)).await;
  });
}

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
pub fn get_companion_context_snapshot(
  state: State<'_, AppState>,
) -> Result<CompanionContextSnapshot, AppError> {
  db::companion_context_snapshot(&state.db_path)
}

#[tauri::command]
pub fn get_companion_home_snapshot(
  state: State<'_, AppState>,
) -> Result<CompanionHomeSnapshot, AppError> {
  db::companion_home_snapshot(&state.db_path)
}

#[tauri::command]
pub fn create_companion_context_entry(
  state: State<'_, AppState>,
  payload: CreateCompanionContextEntryInput,
) -> Result<CompanionContextEntry, AppError> {
  let entry = db::create_companion_context_entry(&state.db_path, &payload)?;
  state.push_event(format!(
    "Added companion context entry '{}' to {}.",
    entry.title, entry.category_key
  ));
  Ok(entry)
}

#[tauri::command]
pub fn create_companion_context_category(
  state: State<'_, AppState>,
  payload: CreateCompanionContextCategoryInput,
) -> Result<CompanionContextCategory, AppError> {
  let category = db::create_companion_context_category(&state.db_path, &payload)?;
  state.push_event(format!("Added companion context category '{}'.", category.label));
  Ok(category)
}

#[tauri::command]
pub fn update_companion_context_category_icon(
  state: State<'_, AppState>,
  payload: UpdateCompanionContextCategoryIconInput,
) -> Result<CompanionContextCategory, AppError> {
  let category = db::update_companion_context_category_icon(&state.db_path, &payload)?;
  state.push_event(format!("Updated companion context category icon for '{}'.", category.label));
  Ok(category)
}

#[tauri::command]
pub fn update_companion_context_entry(
  state: State<'_, AppState>,
  payload: UpdateCompanionContextEntryInput,
) -> Result<CompanionContextEntry, AppError> {
  let entry = db::update_companion_context_entry(&state.db_path, &payload)?;
  state.push_event(format!("Updated companion context entry '{}'.", entry.title));
  Ok(entry)
}

#[tauri::command]
pub fn archive_companion_context_entry(
  state: State<'_, AppState>,
  id: i64,
) -> Result<CompanionContextEntry, AppError> {
  let entry = db::archive_companion_context_entry(&state.db_path, id)?;
  state.push_event(format!("Archived companion context entry '{}'.", entry.title));
  Ok(entry)
}

#[tauri::command]
pub fn reorder_companion_context_entries(
  state: State<'_, AppState>,
  payload: ReorderCompanionContextEntriesInput,
) -> Result<CompanionContextSnapshot, AppError> {
  let snapshot = db::reorder_companion_context_entries(&state.db_path, &payload)?;
  state.push_event(format!(
    "Reordered companion context entries for {}.",
    payload.category_key
  ));
  Ok(snapshot)
}

#[tauri::command]
pub fn delete_companion_context_category(
  state: State<'_, AppState>,
  payload: DeleteCompanionContextCategoryInput,
) -> Result<CompanionContextSnapshot, AppError> {
  let snapshot = db::delete_companion_context_category(&state.db_path, &payload)?;
  state.push_event(format!("Deleted companion context category '{}'.", payload.category_key));
  Ok(snapshot)
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
pub fn create_north_star_pairing_code(
  state: State<'_, AppState>,
) -> Result<NorthStarPairingCode, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let pairing = north_star::create_pairing_code(&settings)?;
  state.push_event("Created a North Star phone pairing code.");
  Ok(pairing)
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
pub fn request_north_star_location_pulse(
  state: State<'_, AppState>,
) -> Result<NorthStarSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let snapshot = north_star::request_location_pulse(&settings)?;
  state.push_event("Requested a fresh North Star location pulse.");
  Ok(snapshot)
}

#[tauri::command]
pub fn dispatch_drafted_outreach(
  state: State<'_, AppState>,
  outreach_event_id: i64,
) -> Result<DraftedOutreachDispatchResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let (outreach, payload, detail) =
    db::build_dispatch_payload_for_outreach(&state.db_path, outreach_event_id)?;

  match outreach.outreach_kind.as_str() {
    "call_request" => {
      north_star::send_call_request(&settings, &payload)?;
    }
    _ => {
      north_star::send_desktop_message(&settings, &payload)?;
    }
  }

  let updated_outreach =
    db::mark_outreach_event_dispatched(&state.db_path, outreach_event_id, &payload, &detail)?;
  state.push_event(format!(
    "Dispatched drafted {} {} through North Star.",
    updated_outreach.channel, updated_outreach.outreach_kind
  ));

  Ok(DraftedOutreachDispatchResult {
    outreach_event: updated_outreach,
    dispatched_payload: payload,
    channel: "north_star".into(),
    north_star_detail: detail,
  })
}

#[tauri::command]
pub fn dispatch_next_drafted_outreach(
  state: State<'_, AppState>,
) -> Result<DraftedOutreachAutoDispatchResult, AppError> {
  let next = db::next_drafted_outreach_event(&state.db_path)?;
  let Some(outreach) = next else {
    return Ok(DraftedOutreachAutoDispatchResult {
      dispatched: false,
      dispatch: None,
      detail: "No drafted outreach is waiting to dispatch.".into(),
      held_outreach_event: None,
      eligibility_reason: None,
    });
  };

  let dispatch = dispatch_drafted_outreach(state, outreach.id)?;
  Ok(DraftedOutreachAutoDispatchResult {
    dispatched: true,
    detail: dispatch.north_star_detail.clone(),
    dispatch: Some(dispatch),
    held_outreach_event: None,
    eligibility_reason: None,
  })
}

#[tauri::command]
pub fn auto_dispatch_eligible_outreach(
  state: State<'_, AppState>,
) -> Result<DraftedOutreachAutoDispatchResult, AppError> {
  let drafted = db::drafted_outreach_events(&state.db_path)?;
  if drafted.is_empty() {
    return Ok(DraftedOutreachAutoDispatchResult {
      dispatched: false,
      dispatch: None,
      detail: "No drafted outreach is waiting to send automatically.".into(),
      held_outreach_event: None,
      eligibility_reason: None,
    });
  }

  let (candidate, held, reason) = db::next_auto_dispatchable_outreach_event(&state.db_path)?;
  if let Some(outreach) = candidate {
    let dispatch = dispatch_drafted_outreach(state, outreach.id)?;
    return Ok(DraftedOutreachAutoDispatchResult {
      dispatched: true,
      detail: format!("Sent the next low-friction draft automatically. {}", dispatch.north_star_detail),
      dispatch: Some(dispatch),
      held_outreach_event: None,
      eligibility_reason: None,
    });
  }

  Ok(DraftedOutreachAutoDispatchResult {
    dispatched: false,
    dispatch: None,
    detail: reason
      .clone()
      .unwrap_or_else(|| "No drafted outreach was ready to send automatically.".into()),
    held_outreach_event: held,
    eligibility_reason: reason,
  })
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
  let imported = db::store_north_star_call_reviews(&state.db_path, &snapshot.call_reviews)?;
  let mut reflected = 0usize;

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
      reflected += 1;
    }
  }

  state.push_event(format!(
    "Imported {} North Star call review(s) into local review evidence and {} reflection(s).",
    imported,
    reflected
  ));

  north_star::fetch_snapshot(
    &settings,
    Some(if imported == 0 && reflected == 0 {
      "No new North Star call reviews needed importing.".into()
    } else {
      format!(
        "Imported {} North Star call review(s) into local review evidence and {} reflection(s).",
        imported, reflected
      )
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

  let session_context = build_north_star_session_context(state, &session)?;

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

  let session_context = build_north_star_session_context(state, &session)?;

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

  let session_context = build_north_star_session_context(state, &session)?;

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
pub fn synthesize_north_star_opening(
  state: State<'_, AppState>,
  fallback_text: String,
) -> Result<VoiceSynthesisResult, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  let session_id = state
    .active_call_session_id
    .lock()
    .map_err(|_| AppError::Message("Call session mutex was poisoned.".into()))?
    .to_owned()
    .ok_or_else(|| AppError::Message("There is no active North Star call session.".into()))?;
  let snapshot = db::call_session_snapshot(&state.db_path, Some(session_id))?;
  let session = snapshot
    .active_session
    .ok_or_else(|| AppError::Message("There is no active North Star call session.".into()))?;
  if session.handoff_kind != "north_star_companion" {
    return Err(AppError::Message("The active session is not a North Star call.".into()));
  }
  let session_context = build_north_star_session_context(&state, &session)?;
  let result = voice::synthesize_north_star_opening(
    state.app_data_dir.as_ref().as_path(),
    &settings,
    &state.voice_worker,
    &state.kokoro_fastapi_runtime,
    &session_context,
    fallback_text.trim(),
  )?;
  state.push_event(format!("Synthesized North Star opening at {}.", result.output_path));
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
pub fn get_memory_system_snapshot(
  state: State<'_, AppState>,
) -> Result<MemorySystemSnapshot, AppError> {
  db::memory_system_snapshot(&state.db_path)
}

#[tauri::command]
pub fn run_context_memory_pass(
  state: State<'_, AppState>,
) -> Result<MemorySystemSnapshot, AppError> {
  let snapshot = db::run_context_memory_pass(&state.db_path)?;
  state.push_event("Ran context-to-memory interpretation pass.");
  Ok(snapshot)
}

#[tauri::command]
pub fn seed_context_memory_example(
  state: State<'_, AppState>,
  scenario_key: String,
) -> Result<MemorySystemSnapshot, AppError> {
  let snapshot = db::seed_context_memory_example(&state.db_path, &scenario_key)?;
  state.push_event(format!("Seeded context-memory example '{}'.", scenario_key));
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
pub fn get_lived_moment_snapshot(
  state: State<'_, AppState>,
) -> Result<LivedMomentSnapshot, AppError> {
  let settings = db::load_settings(&state.db_path)?;
  db::lived_moment_snapshot(&state.db_path, &settings.timezone)
}

#[tauri::command]
pub fn get_real_world_presence_snapshot(
  state: State<'_, AppState>,
) -> Result<RealWorldPresenceSnapshot, AppError> {
  db::get_real_world_presence_snapshot(&state.db_path)
}

#[tauri::command]
pub fn list_nearby_interest_filters(
  state: State<'_, AppState>,
) -> Result<Vec<NearbyInterestFilter>, AppError> {
  db::list_nearby_interest_filters(&state.db_path)
}

#[tauri::command]
pub fn create_nearby_interest_filter(
  state: State<'_, AppState>,
  payload: CreateNearbyInterestFilterInput,
) -> Result<Vec<NearbyInterestFilter>, AppError> {
  let filters = db::create_nearby_interest_filter(&state.db_path, &payload)?;
  state.push_event(format!("Added nearby-interest filter '{}'.", payload.label));
  Ok(filters)
}

#[tauri::command]
pub fn update_nearby_interest_filter(
  state: State<'_, AppState>,
  payload: UpdateNearbyInterestFilterInput,
) -> Result<Vec<NearbyInterestFilter>, AppError> {
  let filters = db::update_nearby_interest_filter(&state.db_path, &payload)?;
  state.push_event(format!("Updated nearby-interest filter '{}'.", payload.label));
  Ok(filters)
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
  if session.handoff_kind == "north_star_companion" {
    schedule_north_star_call_location_refresh(&state, "north_star_call_start");
  }
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
          notes: build_north_star_session_notes(&accepted.call_id, &accepted.note),
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
  schedule_north_star_call_location_refresh(&state, "accepted_north_star_call_start");
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
  state.push_event("Cleared generated runtime data while keeping settings and manual context.");
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
