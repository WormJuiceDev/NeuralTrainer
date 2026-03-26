use std::{env, path::PathBuf};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use crate::{
  db,
  error::AppError,
  models::{
    AppSettings, CallTurnResult, LocationEventInput, NorthStarCallReview, NorthStarCallSession, NorthStarCallTurn,
    NorthStarDesktopBinding, NorthStarLocationEvent, NorthStarMessage, NorthStarSnapshot, NorthStarTurnProcessingResult,
  },
};

#[derive(Debug, Deserialize)]
struct RawNorthStarDesktopBinding {
  desktop_id: String,
  desktop_name: String,
  user_handle: String,
  device_token: String,
  bound_at: String,
  last_heartbeat_at: Option<String>,
  status: String,
}

#[derive(Debug, Deserialize)]
struct RawNorthStarMessage {
  message_id: String,
  user_handle: String,
  source: String,
  text: String,
  created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawNorthStarLocationEvent {
  event_id: String,
  user_handle: String,
  latitude: f64,
  longitude: f64,
  accuracy_meters: Option<f64>,
  source: String,
  captured_at: String,
}

#[derive(Debug, Deserialize)]
struct RawNorthStarCallSession {
  call_id: String,
  user_handle: String,
  desktop_id: String,
  desktop_name: String,
  device_token: String,
  requested_at: String,
  responded_at: Option<String>,
  status: String,
  note: String,
}

#[derive(Debug, Deserialize)]
struct RawNorthStarCallReview {
  review_id: String,
  call_id: String,
  user_handle: String,
  sentiment: String,
  notes: String,
  created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawNorthStarCallTurn {
  turn_id: String,
  call_id: String,
  user_handle: String,
  created_at: String,
  source: String,
  status: String,
  input_audio_base64: String,
  transcript_text: Option<String>,
  reply_text: Option<String>,
  reply_mode: Option<String>,
  reply_audio_base64: Option<String>,
  sample_rate: Option<i64>,
  completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SessionResponse {
  session_token: String,
  user_handle: String,
  display_name: String,
}

#[derive(Debug, Deserialize)]
struct BindDesktopResponse {
  desktop_id: String,
  device_token: String,
  status: String,
}

#[derive(Debug, Deserialize)]
struct CompanionStateResponse {
  desktops: Vec<RawNorthStarDesktopBinding>,
}

#[derive(Debug, Deserialize)]
struct MessagesResponse {
  messages: Vec<RawNorthStarMessage>,
}

#[derive(Debug, Deserialize)]
struct LocationEventsResponse {
  events: Vec<RawNorthStarLocationEvent>,
}

#[derive(Debug, Deserialize)]
struct CallSessionsResponse {
  calls: Vec<RawNorthStarCallSession>,
}

#[derive(Debug, Deserialize)]
struct CallReviewsResponse {
  reviews: Vec<RawNorthStarCallReview>,
}

#[derive(Debug, Deserialize)]
struct CallTurnsResponse {
  turns: Vec<RawNorthStarCallTurn>,
}

#[derive(Debug, Serialize)]
struct BindDesktopRequest {
  desktop_name: String,
}

#[derive(Debug, Serialize)]
struct DesktopHeartbeatRequest {
  device_token: String,
  status: String,
  location_capability: DesktopLocationCapability,
}

#[derive(Debug, Serialize)]
struct DesktopLocationCapability {
  permission_state: String,
  location_supported: bool,
  background_supported: bool,
  last_known_accuracy_meters: Option<f64>,
  last_location_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateSessionRequest {
  user_handle: String,
  display_name: String,
}

#[derive(Debug, Serialize)]
struct DesktopMessageRequest {
  device_token: String,
  text: String,
}

#[derive(Debug, Serialize)]
struct DesktopCallRequest {
  device_token: String,
  note: String,
}

#[derive(Debug, Serialize)]
struct CallResponseRequest {
  call_id: String,
  action: String,
}

#[derive(Debug, Serialize)]
struct CompleteDesktopCallTurnRequest {
  device_token: String,
  turn_id: String,
  transcript_text: String,
  reply_text: String,
  reply_mode: String,
  reply_audio_base64: String,
  sample_rate: i64,
}

impl From<RawNorthStarDesktopBinding> for NorthStarDesktopBinding {
  fn from(value: RawNorthStarDesktopBinding) -> Self {
    Self {
      desktop_id: value.desktop_id,
      desktop_name: value.desktop_name,
      user_handle: value.user_handle,
      device_token: value.device_token,
      bound_at: value.bound_at,
      last_heartbeat_at: value.last_heartbeat_at,
      status: value.status,
    }
  }
}

impl From<RawNorthStarMessage> for NorthStarMessage {
  fn from(value: RawNorthStarMessage) -> Self {
    Self {
      message_id: value.message_id,
      user_handle: value.user_handle,
      source: value.source,
      text: value.text,
      created_at: value.created_at,
    }
  }
}

impl From<RawNorthStarLocationEvent> for NorthStarLocationEvent {
  fn from(value: RawNorthStarLocationEvent) -> Self {
    Self {
      event_id: value.event_id,
      user_handle: value.user_handle,
      latitude: value.latitude,
      longitude: value.longitude,
      accuracy_meters: value.accuracy_meters,
      source: value.source,
      captured_at: value.captured_at,
    }
  }
}

impl From<RawNorthStarCallSession> for NorthStarCallSession {
  fn from(value: RawNorthStarCallSession) -> Self {
    Self {
      call_id: value.call_id,
      user_handle: value.user_handle,
      desktop_id: value.desktop_id,
      desktop_name: value.desktop_name,
      device_token: value.device_token,
      requested_at: value.requested_at,
      responded_at: value.responded_at,
      status: value.status,
      note: value.note,
    }
  }
}

impl From<RawNorthStarCallReview> for NorthStarCallReview {
  fn from(value: RawNorthStarCallReview) -> Self {
    Self {
      review_id: value.review_id,
      call_id: value.call_id,
      user_handle: value.user_handle,
      sentiment: value.sentiment,
      notes: value.notes,
      created_at: value.created_at,
    }
  }
}

impl From<RawNorthStarCallTurn> for NorthStarCallTurn {
  fn from(value: RawNorthStarCallTurn) -> Self {
    Self {
      turn_id: value.turn_id,
      call_id: value.call_id,
      user_handle: value.user_handle,
      created_at: value.created_at,
      source: value.source,
      status: value.status,
      input_audio_base64: value.input_audio_base64,
      transcript_text: value.transcript_text,
      reply_text: value.reply_text,
      reply_mode: value.reply_mode,
      reply_audio_base64: value.reply_audio_base64,
      sample_rate: value.sample_rate,
      completed_at: value.completed_at,
    }
  }
}

fn client() -> Client {
  Client::new()
}

fn endpoint(settings: &AppSettings) -> Result<String, AppError> {
  let base = settings.north_star_endpoint.trim().trim_end_matches('/').to_string();
  if base.is_empty() {
    return Err(AppError::Message("North Star endpoint is missing.".into()));
  }
  Ok(base)
}

fn desktop_name() -> String {
  env::var("COMPUTERNAME")
    .or_else(|_| env::var("HOSTNAME"))
    .unwrap_or_else(|_| "NeuralTrainer Desktop".into())
}

fn mask_token(value: &str) -> String {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  if trimmed.len() <= 8 {
    return "****".into();
  }
  format!("{}…{}", &trimmed[..4], &trimmed[trimmed.len() - 4..])
}

fn ensure_session_config(settings: &AppSettings) -> Result<(), AppError> {
  if settings.north_star_user_handle.trim().is_empty() {
    return Err(AppError::Message("North Star user handle is missing.".into()));
  }
  if settings.north_star_display_name.trim().is_empty() {
    return Err(AppError::Message("North Star display name is missing.".into()));
  }
  Ok(())
}

fn auth_request(
  client: &Client,
  settings: &AppSettings,
  method: reqwest::Method,
  path: &str,
) -> Result<reqwest::blocking::RequestBuilder, AppError> {
  if settings.north_star_session_token.trim().is_empty() {
    return Err(AppError::Message("North Star session is not ready yet.".into()));
  }
  let url = format!("{}{}", endpoint(settings)?, path);
  Ok(client
    .request(method, url)
    .header("x-northstar-session", settings.north_star_session_token.as_str()))
}

pub fn create_session(settings: &mut AppSettings) -> Result<NorthStarSnapshot, AppError> {
  ensure_session_config(settings)?;
  let response = client()
    .post(format!("{}/api/auth/dev-session", endpoint(settings)?))
    .json(&CreateSessionRequest {
      user_handle: settings.north_star_user_handle.clone(),
      display_name: settings.north_star_display_name.clone(),
    })
    .send()?
    .error_for_status()?
    .json::<SessionResponse>()?;

  settings.north_star_session_token = response.session_token;
  settings.north_star_user_handle = response.user_handle;
  settings.north_star_display_name = response.display_name;

  fetch_snapshot(settings, Some("North Star session is ready.".into()))
}

pub fn bind_desktop(settings: &mut AppSettings) -> Result<NorthStarSnapshot, AppError> {
  if settings.north_star_session_token.trim().is_empty() {
    return Err(AppError::Message("Create a North Star session first.".into()));
  }

  let response = auth_request(&client(), settings, reqwest::Method::POST, "/api/companion/bind-desktop")?
    .json(&BindDesktopRequest {
      desktop_name: desktop_name(),
    })
    .send()?
    .error_for_status()?
    .json::<BindDesktopResponse>()?;

  settings.north_star_device_token = response.device_token;

  fetch_snapshot(
    settings,
    Some(format!("Desktop bound to North Star as {}.", response.status)),
  )
}

pub fn send_heartbeat(settings: &AppSettings) -> Result<NorthStarSnapshot, AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }

  client()
    .post(format!("{}/api/companion/desktop-heartbeat", endpoint(settings)?))
    .json(&DesktopHeartbeatRequest {
      device_token: settings.north_star_device_token.clone(),
      status: "online".into(),
      location_capability: DesktopLocationCapability {
        permission_state: "unsupported".into(),
        location_supported: false,
        background_supported: false,
        last_known_accuracy_meters: None,
        last_location_at: None,
      },
    })
    .send()?
    .error_for_status()?;

  fetch_snapshot(settings, Some("Sent desktop heartbeat to North Star.".into()))
}

pub fn send_desktop_message(
  settings: &AppSettings,
  text: &str,
) -> Result<NorthStarSnapshot, AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }
  let trimmed = text.trim();
  if trimmed.is_empty() {
    return Err(AppError::Message("North Star message text is empty.".into()));
  }

  client()
    .post(format!("{}/api/companion/messages/from-desktop", endpoint(settings)?))
    .json(&DesktopMessageRequest {
      device_token: settings.north_star_device_token.clone(),
      text: trimmed.into(),
    })
    .send()?
    .error_for_status()?;

  fetch_snapshot(settings, Some("Sent a desktop companion message.".into()))
}

pub fn send_call_request(
  settings: &AppSettings,
  note: &str,
) -> Result<NorthStarSnapshot, AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }

  client()
    .post(format!("{}/api/companion/call-sessions/from-desktop", endpoint(settings)?))
    .json(&DesktopCallRequest {
      device_token: settings.north_star_device_token.clone(),
      note: note.trim().into(),
    })
    .send()?
    .error_for_status()?;

  fetch_snapshot(settings, Some("Sent a North Star call request.".into()))
}

pub fn pull_location_events(
  db_path: &PathBuf,
  settings: &mut AppSettings,
) -> Result<NorthStarSnapshot, AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }

  let url = format!(
    "{}/api/companion/location-events/desktop-pull?device_token={}",
    endpoint(settings)?,
    settings.north_star_device_token
  );

  let response = client()
    .get(url)
    .send()?
    .error_for_status()?
    .json::<LocationEventsResponse>()?;

  let mut imported = 0usize;
  let last_seen = settings.north_star_last_location_event_id.clone();
  let mut batch = Vec::new();

  for event in response
    .events
    .into_iter()
    .map(NorthStarLocationEvent::from)
  {
    if !last_seen.is_empty() && event.event_id == last_seen {
      break;
    }
    batch.push(event);
  }

  batch.reverse();
  for event in &batch {
    db::ingest_location_event(
      db_path,
      &LocationEventInput {
        occurred_at: event.captured_at.clone(),
        latitude: event.latitude,
        longitude: event.longitude,
        accuracy_meters: event.accuracy_meters,
        speed_mps: None,
        source: format!("north_star:{}", event.source),
      },
    )?;
    imported += 1;
  }

  if let Some(newest) = batch.last() {
    settings.north_star_last_location_event_id = newest.event_id.clone();
  }

  let detail = if imported == 0 {
    "No new North Star location events were waiting.".into()
  } else {
    format!("Imported {} North Star location event(s).", imported)
  };

  fetch_snapshot(settings, Some(detail))
}

pub fn fetch_snapshot(
  settings: &AppSettings,
  detail_override: Option<String>,
) -> Result<NorthStarSnapshot, AppError> {
  let endpoint_value = settings.north_star_endpoint.trim().to_string();
  let configured = !endpoint_value.is_empty() && !settings.north_star_user_handle.trim().is_empty();

  if !configured {
    return Ok(NorthStarSnapshot {
      configured: false,
      session_ready: false,
      desktop_bound: false,
      endpoint: endpoint_value,
      user_handle: settings.north_star_user_handle.clone(),
      display_name: settings.north_star_display_name.clone(),
      desktop_name: desktop_name(),
      session_token_masked: String::new(),
      device_token_masked: String::new(),
      desktops: Vec::new(),
      messages: Vec::new(),
      location_events: Vec::new(),
      call_sessions: Vec::new(),
      call_reviews: Vec::new(),
      detail: detail_override.unwrap_or_else(|| "North Star is not configured yet.".into()),
    });
  }

  if settings.north_star_session_token.trim().is_empty() {
    return Ok(NorthStarSnapshot {
      configured: true,
      session_ready: false,
      desktop_bound: !settings.north_star_device_token.trim().is_empty(),
      endpoint: endpoint_value,
      user_handle: settings.north_star_user_handle.clone(),
      display_name: settings.north_star_display_name.clone(),
      desktop_name: desktop_name(),
      session_token_masked: String::new(),
      device_token_masked: mask_token(&settings.north_star_device_token),
      desktops: Vec::new(),
      messages: Vec::new(),
      location_events: Vec::new(),
      call_sessions: Vec::new(),
      call_reviews: Vec::new(),
      detail: detail_override.unwrap_or_else(|| "North Star session has not been created yet.".into()),
    });
  }

  let state = auth_request(&client(), settings, reqwest::Method::GET, "/api/companion/state")?
    .send()?
    .error_for_status()?
    .json::<CompanionStateResponse>()?;

  let messages = auth_request(&client(), settings, reqwest::Method::GET, "/api/companion/messages")?
    .send()?
    .error_for_status()?
    .json::<MessagesResponse>()?;

  let locations = auth_request(&client(), settings, reqwest::Method::GET, "/api/companion/location-events")?
    .send()?
    .error_for_status()?
    .json::<LocationEventsResponse>()?;

  let calls = auth_request(&client(), settings, reqwest::Method::GET, "/api/companion/call-sessions")?
    .send()?
    .error_for_status()?
    .json::<CallSessionsResponse>()?;

  let reviews = auth_request(&client(), settings, reqwest::Method::GET, "/api/companion/call-reviews")?
    .send()?
    .error_for_status()?
    .json::<CallReviewsResponse>()?;

  Ok(NorthStarSnapshot {
    configured: true,
    session_ready: true,
    desktop_bound: !settings.north_star_device_token.trim().is_empty(),
    endpoint: endpoint_value,
    user_handle: settings.north_star_user_handle.clone(),
    display_name: settings.north_star_display_name.clone(),
    desktop_name: desktop_name(),
    session_token_masked: mask_token(&settings.north_star_session_token),
    device_token_masked: mask_token(&settings.north_star_device_token),
    desktops: state.desktops.into_iter().map(Into::into).collect(),
    messages: messages.messages.into_iter().map(Into::into).collect(),
    location_events: locations.events.into_iter().map(Into::into).collect(),
    call_sessions: calls.calls.into_iter().map(Into::into).collect(),
    call_reviews: reviews.reviews.into_iter().map(Into::into).collect(),
    detail: detail_override.unwrap_or_else(|| "North Star desktop link is ready.".into()),
  })
}

pub fn latest_accepted_call(settings: &AppSettings) -> Result<Option<NorthStarCallSession>, AppError> {
  let snapshot = fetch_snapshot(settings, None)?;
  Ok(snapshot
    .call_sessions
    .into_iter()
    .find(|call| call.status == "accepted"))
}

pub fn end_latest_accepted_call(settings: &AppSettings) -> Result<(), AppError> {
  let Some(call) = latest_accepted_call(settings)? else {
    return Ok(());
  };
  auth_request(&client(), settings, reqwest::Method::POST, "/api/companion/call-sessions/respond")?
    .json(&CallResponseRequest {
      call_id: call.call_id,
      action: "end".into(),
    })
    .send()?
    .error_for_status()?;
  Ok(())
}

pub fn pull_pending_call_turn(
  settings: &AppSettings,
  call_id: &str,
) -> Result<Option<NorthStarCallTurn>, AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }
  let url = format!(
    "{}/api/companion/call-turns/desktop-pull?device_token={}&call_id={}",
    endpoint(settings)?,
    settings.north_star_device_token,
    call_id,
  );
  let response = client()
    .get(url)
    .send()?
    .error_for_status()?
    .json::<CallTurnsResponse>()?;
  Ok(response.turns.into_iter().map(Into::into).next())
}

pub fn complete_call_turn(
  settings: &AppSettings,
  turn_id: &str,
  result: &CallTurnResult,
) -> Result<(), AppError> {
  if settings.north_star_device_token.trim().is_empty() {
    return Err(AppError::Message("Bind the desktop to North Star first.".into()));
  }
  client()
    .post(format!(
      "{}/api/companion/call-turns/desktop-complete",
      endpoint(settings)?
    ))
    .json(&CompleteDesktopCallTurnRequest {
      device_token: settings.north_star_device_token.clone(),
      turn_id: turn_id.to_string(),
      transcript_text: result.transcript_text.clone(),
      reply_text: result.reply_text.clone(),
      reply_mode: result.reply_mode.clone(),
      reply_audio_base64: result.reply_audio_base64.clone(),
      sample_rate: result.sample_rate,
    })
    .send()?
    .error_for_status()?;
  Ok(())
}

pub fn process_next_pending_turn<F>(
  settings: &AppSettings,
  mut processor: F,
) -> Result<NorthStarTurnProcessingResult, AppError>
where
  F: FnMut(&NorthStarCallSession, &NorthStarCallTurn) -> Result<CallTurnResult, AppError>,
{
  let Some(call) = latest_accepted_call(settings)? else {
    return Ok(NorthStarTurnProcessingResult {
      processed: false,
      detail: "No accepted North Star call is ready for a remote speech turn.".into(),
      call_id: None,
      turn_id: None,
      reply: None,
    });
  };

  let Some(turn) = pull_pending_call_turn(settings, &call.call_id)? else {
    return Ok(NorthStarTurnProcessingResult {
      processed: false,
      detail: "No pending North Star speech turn is waiting right now.".into(),
      call_id: Some(call.call_id),
      turn_id: None,
      reply: None,
    });
  };

  let reply = processor(&call, &turn)?;
  complete_call_turn(settings, &turn.turn_id, &reply)?;

  Ok(NorthStarTurnProcessingResult {
    processed: true,
    detail: "Processed the next North Star spoken turn and returned a reply.".into(),
    call_id: Some(call.call_id),
    turn_id: Some(turn.turn_id),
    reply: Some(reply),
  })
}
