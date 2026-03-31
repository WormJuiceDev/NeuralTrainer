use std::{
    collections::HashMap,
    env,
    fs,
    net::SocketAddr,
    str::FromStr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes128Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use futures::stream::StreamExt;
use hkdf::Hkdf;
use p256::ecdsa::{signature::Signer, Signature, SigningKey};
use p256::{
    ecdh::EphemeralSecret,
    elliptic_curve::sec1::ToEncodedPoint,
    PublicKey,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    store: Arc<RwLock<PersistedStore>>,
    state_path: Arc<PathBuf>,
    broadcaster: broadcast::Sender<CompanionEvent>,
    http_client: reqwest::Client,
    vapid_key: Arc<Mutex<SigningKey>>,
    vapid_public_b64: String,
    vapid_subject: String,
}

#[derive(Debug, Clone)]
struct RuntimeConfig {
    bind_addr: SocketAddr,
    state_path: PathBuf,
    vapid_subject: String,
    allowed_origins: Vec<HeaderValue>,
    rtc_ice_servers: Vec<IceServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IceServerConfig {
    urls: Vec<String>,
    username: Option<String>,
    credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedStore {
    sessions: HashMap<String, UserSession>,
    desktops: HashMap<String, DesktopBinding>,
    messages: Vec<CompanionMessage>,
    location_events: Vec<LocationEvent>,
    location_pulse_requests: Vec<LocationPulseRequest>,
    call_sessions: Vec<CompanionCallSession>,
    call_reviews: Vec<CallReviewRecord>,
    call_turns: Vec<CompanionCallTurn>,
    webrtc_signals: Vec<WebRtcSignal>,
    push_subscriptions: Vec<PushSubscriptionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserSession {
    session_token: String,
    user_handle: String,
    display_name: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DesktopBinding {
    desktop_id: Uuid,
    desktop_name: String,
    user_handle: String,
    device_token: String,
    bound_at: DateTime<Utc>,
    last_heartbeat_at: Option<DateTime<Utc>>,
    status: DesktopStatus,
    location_capability: LocationCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DesktopStatus {
    Bound,
    Online,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocationCapability {
    permission_state: String,
    location_supported: bool,
    background_supported: bool,
    last_known_accuracy_meters: Option<f64>,
    last_location_at: Option<DateTime<Utc>>,
}

impl Default for LocationCapability {
    fn default() -> Self {
        Self {
            permission_state: "unknown".to_string(),
            location_supported: false,
            background_supported: false,
            last_known_accuracy_meters: None,
            last_location_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CompanionMessage {
    message_id: Uuid,
    user_handle: String,
    source: MessageSource,
    text: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MessageSource {
    User,
    Desktop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocationEvent {
    event_id: Uuid,
    user_handle: String,
    latitude: f64,
    longitude: f64,
    accuracy_meters: Option<f64>,
    source: String,
    captured_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocationPulseRequest {
    pulse_id: Uuid,
    user_handle: String,
    device_token: String,
    requested_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    status: LocationPulseStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum LocationPulseStatus {
    Pending,
    Fulfilled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CompanionCallSession {
    call_id: Uuid,
    user_handle: String,
    desktop_id: Uuid,
    desktop_name: String,
    device_token: String,
    requested_at: DateTime<Utc>,
    responded_at: Option<DateTime<Utc>>,
    status: CallStatus,
    note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CallReviewRecord {
    review_id: Uuid,
    call_id: Uuid,
    user_handle: String,
    sentiment: CallReviewSentiment,
    notes: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CallReviewSentiment {
    Helpful,
    Welcome,
    Mistimed,
    Intrusive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CallStatus {
    Pending,
    Accepted,
    Declined,
    Ended,
    Missed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CompanionCallTurn {
    turn_id: Uuid,
    call_id: Uuid,
    user_handle: String,
    created_at: DateTime<Utc>,
    source: String,
    status: String,
    input_audio_base64: String,
    transcript_text: Option<String>,
    reply_text: Option<String>,
    reply_mode: Option<String>,
    reply_audio_base64: Option<String>,
    sample_rate: Option<i64>,
    completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum CompanionEvent {
    DesktopBound {
        desktop_id: Uuid,
        desktop_name: String,
        user_handle: String,
        at: DateTime<Utc>,
    },
    HeartbeatReceived {
        desktop_id: Uuid,
        status: DesktopStatus,
        at: DateTime<Utc>,
    },
    LocationCapabilityUpdated {
        desktop_id: Uuid,
        permission_state: String,
        location_supported: bool,
        background_supported: bool,
        at: DateTime<Utc>,
    },
    MessageCreated {
        message_id: Uuid,
        user_handle: String,
        source: MessageSource,
        at: DateTime<Utc>,
    },
    LocationUploaded {
        event_id: Uuid,
        user_handle: String,
        at: DateTime<Utc>,
    },
    LocationPulseRequested {
        pulse_id: Uuid,
        user_handle: String,
        at: DateTime<Utc>,
    },
    LocationPulseFulfilled {
        pulse_id: Uuid,
        user_handle: String,
        at: DateTime<Utc>,
    },
    CallRequested {
        call_id: Uuid,
        user_handle: String,
        desktop_name: String,
        at: DateTime<Utc>,
    },
    CallUpdated {
        call_id: Uuid,
        user_handle: String,
        status: CallStatus,
        at: DateTime<Utc>,
    },
    CallReviewCreated {
        review_id: Uuid,
        call_id: Uuid,
        user_handle: String,
        sentiment: CallReviewSentiment,
        at: DateTime<Utc>,
    },
    WebRtcSignalQueued {
        signal_id: Uuid,
        call_id: Uuid,
        user_handle: String,
        target: SignalTarget,
        at: DateTime<Utc>,
    },
    PushSubscriptionUpdated {
        user_handle: String,
        subscriptions: usize,
        at: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SignalTarget {
    Desktop,
    Mobile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebRtcSignal {
    signal_id: Uuid,
    call_id: Uuid,
    user_handle: String,
    source: SignalTarget,
    target: SignalTarget,
    signal_kind: String,
    payload_json: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushSubscriptionRecord {
    subscription_id: Uuid,
    user_handle: String,
    endpoint: String,
    p256dh: String,
    auth: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct CreateSessionRequest {
    user_handle: String,
    display_name: String,
}

#[derive(Debug, Serialize)]
struct SessionResponse {
    session_token: String,
    user_handle: String,
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct BindDesktopRequest {
    desktop_name: String,
}

#[derive(Debug, Serialize)]
struct BindDesktopResponse {
    desktop_id: Uuid,
    device_token: String,
    status: DesktopStatus,
}

#[derive(Debug, Deserialize)]
struct HeartbeatRequest {
    device_token: String,
    status: DesktopStatus,
    location_capability: Option<LocationCapability>,
}

#[derive(Debug, Serialize)]
struct CompanionStateResponse {
    desktops: Vec<DesktopBinding>,
    server_time: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct StateQuery {
    user_handle: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateMessageRequest {
    text: String,
}

#[derive(Debug, Serialize)]
struct MessagesResponse {
    messages: Vec<CompanionMessage>,
}

#[derive(Debug, Deserialize)]
struct DesktopMessageRequest {
    device_token: String,
    text: String,
}

#[derive(Debug, Serialize)]
struct LocationEventsResponse {
    events: Vec<LocationEvent>,
}

#[derive(Debug, Serialize)]
struct LocationPulseResponse {
    requests: Vec<LocationPulseRequest>,
}

#[derive(Debug, Deserialize)]
struct UploadLocationRequest {
    latitude: f64,
    longitude: f64,
    accuracy_meters: Option<f64>,
    source: String,
}

#[derive(Debug, Deserialize)]
struct DesktopCallRequest {
    device_token: String,
    note: String,
}

#[derive(Debug, Deserialize)]
struct DesktopLocationPulseRequest {
    device_token: String,
}

#[derive(Debug, Deserialize)]
struct CompleteLocationPulseRequest {
    pulse_id: String,
}

#[derive(Debug, Deserialize)]
struct MobileCallRequest {
    note: String,
}

#[derive(Debug, Deserialize)]
struct CallResponseRequest {
    call_id: String,
    action: String,
}

#[derive(Debug, Deserialize)]
struct DesktopPullQuery {
    device_token: String,
}

#[derive(Debug, Serialize)]
struct CallSessionsResponse {
    calls: Vec<CompanionCallSession>,
}

#[derive(Debug, Deserialize)]
struct CreateCallReviewRequest {
    call_id: String,
    sentiment: String,
    notes: String,
}

#[derive(Debug, Serialize)]
struct CallReviewsResponse {
    reviews: Vec<CallReviewRecord>,
}

#[derive(Debug, Deserialize)]
struct CreateWebRtcSignalRequest {
    call_id: String,
    signal_kind: String,
    payload_json: String,
}

#[derive(Debug, Deserialize)]
struct DesktopSignalRequest {
    device_token: String,
    call_id: String,
    signal_kind: String,
    payload_json: String,
}

#[derive(Debug, Deserialize)]
struct WebRtcSignalQuery {
    call_id: String,
}

#[derive(Debug, Deserialize)]
struct DesktopWebRtcSignalQuery {
    device_token: String,
    call_id: String,
}

#[derive(Debug, Serialize)]
struct WebRtcSignalsResponse {
    signals: Vec<WebRtcSignal>,
}

#[derive(Debug, Serialize)]
struct RtcConfigResponse {
    ice_servers: Vec<IceServerConfig>,
}

#[derive(Debug, Deserialize)]
struct CreateMobileCallTurnRequest {
    call_id: String,
    audio_base64: String,
}

#[derive(Debug, Deserialize)]
struct DesktopPullCallTurnQuery {
    device_token: String,
    call_id: String,
}

#[derive(Debug, Deserialize)]
struct CompleteDesktopCallTurnRequest {
    device_token: String,
    turn_id: String,
    transcript_text: String,
    reply_text: String,
    reply_mode: String,
    reply_audio_base64: String,
    sample_rate: i64,
}

#[derive(Debug, Deserialize)]
struct CallTurnsQuery {
    call_id: String,
}

#[derive(Debug, Serialize)]
struct CallTurnsResponse {
    turns: Vec<CompanionCallTurn>,
}

#[derive(Debug, Deserialize)]
struct PushSubscriptionRequest {
    endpoint: String,
    keys: PushSubscriptionKeys,
}

#[derive(Debug, Deserialize)]
struct PushSubscriptionKeys {
    p256dh: String,
    auth: String,
}

#[derive(Debug, Serialize)]
struct PushStatusResponse {
    vapid_public_key: String,
    registered_subscriptions: usize,
    push_supported: bool,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    service: &'static str,
    status: &'static str,
    server_time: DateTime<Utc>,
}

#[tokio::main]
async fn main() {
    let config = load_runtime_config();
    let state_path = Arc::new(config.state_path.clone());
    let store = Arc::new(RwLock::new(load_store(&state_path)));
    let (broadcaster, _) = broadcast::channel(256);
    let (vapid_key, vapid_public_b64) = load_or_generate_vapid_key(&state_path);

    let state = AppState {
        store,
        state_path,
        broadcaster,
        http_client: reqwest::Client::new(),
        vapid_key: Arc::new(Mutex::new(vapid_key)),
        vapid_public_b64,
        vapid_subject: config.vapid_subject.clone(),
    };

    let cors = if config.allowed_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(config.allowed_origins)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers(Any)
    };

    let static_root = "/usr/local/www/northstar-ui";
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/dev-session", post(create_session))
        .route("/api/companion/bind-desktop", post(bind_desktop))
        .route("/api/companion/desktop-heartbeat", post(desktop_heartbeat))
        .route("/api/companion/state", get(companion_state))
        .route("/api/companion/events", get(companion_events))
        .route("/api/companion/messages", get(list_messages).post(create_message))
        .route("/api/companion/messages/from-desktop", post(create_desktop_message))
        .route("/api/companion/location-events", get(list_location_events).post(upload_location_event))
        .route("/api/companion/location-events/desktop-pull", get(desktop_pull_location_events))
        .route("/api/companion/location-pulses", get(list_pending_location_pulses))
        .route("/api/companion/location-pulses/from-desktop", post(request_location_pulse_from_desktop))
        .route("/api/companion/location-pulses/complete", post(complete_location_pulse))
        .route("/api/companion/call-sessions", get(list_call_sessions))
        .route("/api/companion/call-sessions/from-desktop", post(create_desktop_call_request))
        .route("/api/companion/call-sessions/from-mobile", post(create_mobile_call_request))
        .route("/api/companion/call-sessions/respond", post(respond_to_call_request))
        .route("/api/companion/call-reviews", get(list_call_reviews).post(create_call_review))
        .route("/api/companion/call-turns", get(list_call_turns))
        .route("/api/companion/call-turns/from-mobile", post(create_mobile_call_turn))
        .route("/api/companion/call-turns/desktop-pull", get(pull_desktop_call_turn))
        .route("/api/companion/call-turns/desktop-complete", post(complete_desktop_call_turn))
        .route("/api/companion/push-subscriptions", get(get_push_status).post(upsert_push_subscription))
        .route("/api/companion/rtc-config", get(get_rtc_config))
        .route("/api/companion/webrtc-signals", get(list_mobile_webrtc_signals).post(create_mobile_webrtc_signal))
        .route("/api/companion/webrtc-signals/from-desktop", post(create_desktop_webrtc_signal))
        .route("/api/companion/webrtc-signals/desktop-pull", get(list_desktop_webrtc_signals))
        .fallback_service(
            ServeDir::new(static_root).fallback(ServeFile::new(format!("{static_root}/index.html"))),
        )
        .layer(cors)
        .with_state(state);

    println!("North Star backend listening on {}", config.bind_addr);
    let listener = tokio::net::TcpListener::bind(config.bind_addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn load_runtime_config() -> RuntimeConfig {
    let bind_addr = env::var("NORTHSTAR_BIND_ADDR")
        .ok()
        .and_then(|value| SocketAddr::from_str(&value).ok())
        .unwrap_or_else(|| SocketAddr::from(([0, 0, 0, 0], 3100)));

    let state_path = env::var("NORTHSTAR_STATE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("northstar_state.json"));

    let vapid_subject = env::var("NORTHSTAR_VAPID_SUBJECT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "mailto:northstar@youworld.app".to_string());

    let allowed_origins = env::var("NORTHSTAR_ALLOWED_ORIGINS")
        .ok()
        .map(|value| {
            value
                .split(',')
                .filter_map(|origin| {
                    let trimmed = origin.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        HeaderValue::from_str(trimmed).ok()
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut rtc_ice_servers = vec![
        IceServerConfig {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            username: None,
            credential: None,
        },
        IceServerConfig {
            urls: vec!["stun:stun.cloudflare.com:3478".to_string()],
            username: None,
            credential: None,
        },
    ];

    let turn_urls = env::var("NORTHSTAR_TURN_URLS")
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !turn_urls.is_empty() {
        rtc_ice_servers.push(IceServerConfig {
            urls: turn_urls,
            username: env::var("NORTHSTAR_TURN_USERNAME").ok().filter(|value| !value.trim().is_empty()),
            credential: env::var("NORTHSTAR_TURN_CREDENTIAL").ok().filter(|value| !value.trim().is_empty()),
        });
    }

    RuntimeConfig {
        bind_addr,
        state_path,
        vapid_subject,
        allowed_origins,
        rtc_ice_servers,
    }
}

fn resolve_vapid_key_path(state_path: &Path) -> PathBuf {
    match state_path.parent() {
        Some(parent) => parent.join("northstar_vapid.key"),
        None => PathBuf::from("northstar_vapid.key"),
    }
}

fn load_or_generate_vapid_key(state_path: &Path) -> (SigningKey, String) {
    let file_path = resolve_vapid_key_path(state_path);

    if let Ok(bytes) = fs::read(&file_path) {
        if bytes.len() == 32 {
            let key = SigningKey::from_slice(&bytes).expect("Invalid North Star VAPID key file");
            let pub_key = key.verifying_key().to_encoded_point(false);
            let b64 = URL_SAFE_NO_PAD.encode(pub_key.as_bytes());
            return (key, b64);
        }
    }

    let key = SigningKey::random(&mut OsRng);
    let bytes = key.to_bytes();
    let _ = fs::write(&file_path, &bytes);

    let pub_key = key.verifying_key().to_encoded_point(false);
    let b64 = URL_SAFE_NO_PAD.encode(pub_key.as_bytes());
    (key, b64)
}

fn load_store(path: &Path) -> PersistedStore {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => PersistedStore::default(),
    }
}

fn persist_store(path: &Path, store: &PersistedStore) -> Result<(), AppError> {
    let contents = serde_json::to_string_pretty(store).map_err(AppError::internal)?;
    fs::write(path, contents).map_err(AppError::internal)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "north_star",
        status: "ok",
        server_time: Utc::now(),
    })
}

async fn create_session(
    State(state): State<AppState>,
    Json(request): Json<CreateSessionRequest>,
) -> Result<Json<SessionResponse>, AppError> {
    let session = UserSession {
        session_token: Uuid::new_v4().to_string(),
        user_handle: request.user_handle,
        display_name: request.display_name,
        created_at: Utc::now(),
    };

    {
        let mut store = state.store.write().await;
        store
            .sessions
            .insert(session.session_token.clone(), session.clone());
        persist_store(&state.state_path, &store)?;
    }

    Ok(Json(SessionResponse {
        session_token: session.session_token,
        user_handle: session.user_handle,
        display_name: session.display_name,
    }))
}

async fn bind_desktop(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindDesktopRequest>,
) -> Result<Json<BindDesktopResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let desktop_id = Uuid::new_v4();
    let device_token = Uuid::new_v4().to_string();
    let binding = DesktopBinding {
        desktop_id,
        desktop_name: request.desktop_name,
        user_handle: session.user_handle.clone(),
        device_token: device_token.clone(),
        bound_at: Utc::now(),
        last_heartbeat_at: None,
        status: DesktopStatus::Bound,
        location_capability: LocationCapability::default(),
    };

    {
        let mut store = state.store.write().await;
        store
            .desktops
            .insert(device_token.clone(), binding.clone());
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::DesktopBound {
        desktop_id,
        desktop_name: binding.desktop_name.clone(),
        user_handle: binding.user_handle.clone(),
        at: binding.bound_at,
    });

    Ok(Json(BindDesktopResponse {
        desktop_id,
        device_token,
        status: DesktopStatus::Bound,
    }))
}

async fn desktop_heartbeat(
    State(state): State<AppState>,
    Json(request): Json<HeartbeatRequest>,
) -> Result<StatusCode, AppError> {
    let (desktop_id, status, location_update) = {
        let mut store = state.store.write().await;
        let desktop = store
            .desktops
            .get_mut(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?;

        desktop.status = request.status.clone();
        desktop.last_heartbeat_at = Some(Utc::now());

        let mut location_update = None;
        if let Some(location) = request.location_capability.clone() {
            desktop.location_capability = location.clone();
            location_update = Some(location);
        }

        let desktop_id = desktop.desktop_id;
        let status = desktop.status.clone();
        persist_store(&state.state_path, &store)?;
        (desktop_id, status, location_update)
    };

    if let Some(location) = location_update {
        let _ = state.broadcaster.send(CompanionEvent::LocationCapabilityUpdated {
            desktop_id,
            permission_state: location.permission_state,
            location_supported: location.location_supported,
            background_supported: location.background_supported,
            at: Utc::now(),
        });
    }

    let _ = state.broadcaster.send(CompanionEvent::HeartbeatReceived {
        desktop_id,
        status,
        at: Utc::now(),
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn companion_state(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<StateQuery>,
) -> Result<Json<CompanionStateResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let desktops = state.store.read().await;
    let requested_handle = query.user_handle.unwrap_or(session.user_handle);
    let mut list: Vec<DesktopBinding> = desktops
        .desktops
        .values()
        .filter(|desktop| desktop.user_handle == requested_handle)
        .cloned()
        .collect();
    list.sort_by(|left, right| {
        let left_seen = left.last_heartbeat_at.unwrap_or(left.bound_at);
        let right_seen = right.last_heartbeat_at.unwrap_or(right.bound_at);
        right_seen
            .cmp(&left_seen)
            .then_with(|| right.bound_at.cmp(&left.bound_at))
            .then_with(|| left.desktop_name.cmp(&right.desktop_name))
    });

    Ok(Json(CompanionStateResponse {
        desktops: list,
        server_time: Utc::now(),
    }))
}

async fn companion_events(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<MessagesResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let messages = store
        .messages
        .iter()
        .filter(|message| message.user_handle == session.user_handle)
        .cloned()
        .collect();
    Ok(Json(MessagesResponse { messages }))
}

async fn create_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateMessageRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    create_message_for_user(&state, &session.user_handle, MessageSource::User, request.text).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn create_desktop_message(
    State(state): State<AppState>,
    Json(request): Json<DesktopMessageRequest>,
) -> Result<StatusCode, AppError> {
    let user_handle = {
        let store = state.store.read().await;
        let desktop = store
            .desktops
            .get(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?;
        desktop.user_handle.clone()
    };
    create_message_for_user(&state, &user_handle, MessageSource::Desktop, request.text).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_location_events(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LocationEventsResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let events = store
        .location_events
        .iter()
        .filter(|event| event.user_handle == session.user_handle)
        .cloned()
        .collect();
    Ok(Json(LocationEventsResponse { events }))
}

async fn upload_location_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UploadLocationRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let event = LocationEvent {
        event_id: Uuid::new_v4(),
        user_handle: session.user_handle.clone(),
        latitude: request.latitude,
        longitude: request.longitude,
        accuracy_meters: request.accuracy_meters,
        source: request.source,
        captured_at: Utc::now(),
    };

    {
        let mut store = state.store.write().await;
        store.location_events.push(event.clone());
        store
            .location_events
            .sort_by_key(|saved| std::cmp::Reverse(saved.captured_at));
        if store.location_events.len() > 200 {
            store.location_events.truncate(200);
        }
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::LocationUploaded {
        event_id: event.event_id,
        user_handle: event.user_handle,
        at: event.captured_at,
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn desktop_pull_location_events(
    State(state): State<AppState>,
    Query(query): Query<DesktopPullQuery>,
) -> Result<Json<LocationEventsResponse>, AppError> {
    let store = state.store.read().await;
    let desktop = store
        .desktops
        .get(&query.device_token)
        .ok_or_else(|| AppError::not_found("Unknown device token"))?;
    let events = store
        .location_events
        .iter()
        .filter(|event| event.user_handle == desktop.user_handle)
        .take(50)
        .cloned()
        .collect();
    Ok(Json(LocationEventsResponse { events }))
}

async fn list_pending_location_pulses(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LocationPulseResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let requests = store
        .location_pulse_requests
        .iter()
        .filter(|pulse| pulse.user_handle == session.user_handle && pulse.status == LocationPulseStatus::Pending)
        .cloned()
        .collect();
    Ok(Json(LocationPulseResponse { requests }))
}

async fn request_location_pulse_from_desktop(
    State(state): State<AppState>,
    Json(request): Json<DesktopLocationPulseRequest>,
) -> Result<StatusCode, AppError> {
    let pulse = {
        let mut store = state.store.write().await;
        let desktop = store
            .desktops
            .get(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?
            .clone();

        let pulse = LocationPulseRequest {
            pulse_id: Uuid::new_v4(),
            user_handle: desktop.user_handle.clone(),
            device_token: desktop.device_token.clone(),
            requested_at: Utc::now(),
            completed_at: None,
            status: LocationPulseStatus::Pending,
        };

        store.location_pulse_requests.push(pulse.clone());
        store
            .location_pulse_requests
            .sort_by_key(|saved| std::cmp::Reverse(saved.requested_at));
        if store.location_pulse_requests.len() > 120 {
            store.location_pulse_requests.truncate(120);
        }
        persist_store(&state.state_path, &store)?;
        pulse
    };

    let _ = state.broadcaster.send(CompanionEvent::LocationPulseRequested {
        pulse_id: pulse.pulse_id,
        user_handle: pulse.user_handle.clone(),
        at: pulse.requested_at,
    });

    let push_payload = serde_json::json!({
        "title": "North Star wants a location pulse",
        "body": "Opening a quick background pulse request from NeuralTrainer.",
        "text": "Opening a quick background pulse request from NeuralTrainer.",
        "type": "LOCATION_PULSE",
        "id": pulse.pulse_id,
        "pulseId": pulse.pulse_id,
        "tag": "northstar-location-pulse",
        "requireInteraction": false,
        "url": "/?navType=LOCATION_PULSE"
    })
    .to_string();
    send_notification_to_user(&pulse.user_handle, &push_payload, &state).await;

    Ok(StatusCode::NO_CONTENT)
}

async fn complete_location_pulse(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CompleteLocationPulseRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let pulse_id = Uuid::parse_str(request.pulse_id.trim())
        .map_err(|_| AppError::internal("Pulse id is invalid."))?;
    let completed_at = Utc::now();

    {
        let mut store = state.store.write().await;
        let pulse = store
            .location_pulse_requests
            .iter_mut()
            .find(|pulse| pulse.pulse_id == pulse_id && pulse.user_handle == session.user_handle)
            .ok_or_else(|| AppError::not_found("Unknown location pulse"))?;

        pulse.status = LocationPulseStatus::Fulfilled;
        pulse.completed_at = Some(completed_at);
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::LocationPulseFulfilled {
        pulse_id,
        user_handle: session.user_handle,
        at: completed_at,
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn list_call_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<CallSessionsResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let calls = store
        .call_sessions
        .iter()
        .filter(|call| call.user_handle == session.user_handle)
        .cloned()
        .collect();
    Ok(Json(CallSessionsResponse { calls }))
}

async fn create_desktop_call_request(
    State(state): State<AppState>,
    Json(request): Json<DesktopCallRequest>,
) -> Result<StatusCode, AppError> {
    let call = {
        let mut store = state.store.write().await;
        let desktop = store
            .desktops
            .get(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?
            .clone();

        let call = CompanionCallSession {
            call_id: Uuid::new_v4(),
            user_handle: desktop.user_handle.clone(),
            desktop_id: desktop.desktop_id,
            desktop_name: desktop.desktop_name.clone(),
            device_token: desktop.device_token.clone(),
            requested_at: Utc::now(),
            responded_at: None,
            status: CallStatus::Pending,
            note: request.note,
        };

        store.call_sessions.push(call.clone());
        store
            .call_sessions
            .sort_by_key(|saved| std::cmp::Reverse(saved.requested_at));
        if store.call_sessions.len() > 100 {
            store.call_sessions.truncate(100);
        }
        persist_store(&state.state_path, &store)?;
        call
    };

    let push_user_handle = call.user_handle.clone();
    let push_desktop_name = call.desktop_name.clone();

    let _ = state.broadcaster.send(CompanionEvent::CallRequested {
        call_id: call.call_id,
        user_handle: call.user_handle.clone(),
        desktop_name: call.desktop_name.clone(),
        at: call.requested_at,
    });

    let push_payload = notification_payload(
        "Incoming North Star call",
        &format!("{} wants to talk for a moment.", push_desktop_name),
        "CALL",
        call.call_id,
        &format!("northstar-call-{}", call.call_id),
        true,
    );
    send_notification_to_user(&push_user_handle, &push_payload, &state).await;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_mobile_call_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<MobileCallRequest>,
) -> Result<Json<CompanionCallSession>, AppError> {
    let session = require_session(&state, &headers).await?;
    let now = Utc::now();

    let call = {
        let mut store = state.store.write().await;
        let desktop = store
            .desktops
            .values()
            .filter(|desktop| desktop.user_handle == session.user_handle)
            .max_by_key(|desktop| desktop.last_heartbeat_at.unwrap_or(desktop.bound_at))
            .cloned()
            .ok_or_else(|| AppError::not_found("No linked desktop is ready for North Star yet"))?;

        let call = CompanionCallSession {
            call_id: Uuid::new_v4(),
            user_handle: session.user_handle.clone(),
            desktop_id: desktop.desktop_id,
            desktop_name: desktop.desktop_name.clone(),
            device_token: desktop.device_token.clone(),
            requested_at: now,
            responded_at: Some(now),
            status: CallStatus::Accepted,
            note: request.note.trim().to_string(),
        };

        store.call_sessions.push(call.clone());
        store
            .call_sessions
            .sort_by_key(|saved| std::cmp::Reverse(saved.requested_at));
        if store.call_sessions.len() > 100 {
            store.call_sessions.truncate(100);
        }
        persist_store(&state.state_path, &store)?;
        call
    };

    let _ = state.broadcaster.send(CompanionEvent::CallUpdated {
        call_id: call.call_id,
        user_handle: call.user_handle.clone(),
        status: CallStatus::Accepted,
        at: now,
    });

    Ok(Json(call))
}

async fn respond_to_call_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CallResponseRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let requested_id = Uuid::parse_str(&request.call_id)
        .map_err(|_| AppError::not_found("Invalid call request id"))?;

    let next_status = match request.action.as_str() {
        "accept" => CallStatus::Accepted,
        "decline" => CallStatus::Declined,
        "missed" => CallStatus::Missed,
        "end" => CallStatus::Ended,
        _ => return Err(AppError::not_found("Unknown call action")),
    };

    {
        let mut store = state.store.write().await;
        let call = store
            .call_sessions
            .iter_mut()
            .find(|call| call.call_id == requested_id && call.user_handle == session.user_handle)
            .ok_or_else(|| AppError::not_found("Unknown call request"))?;
        call.status = next_status.clone();
        call.responded_at = Some(Utc::now());
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::CallUpdated {
        call_id: requested_id,
        user_handle: session.user_handle.clone(),
        status: next_status,
        at: Utc::now(),
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn list_call_reviews(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<CallReviewsResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let reviews = store
        .call_reviews
        .iter()
        .filter(|review| review.user_handle == session.user_handle)
        .cloned()
        .collect();
    Ok(Json(CallReviewsResponse { reviews }))
}

async fn create_call_review(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateCallReviewRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let call_id =
        Uuid::parse_str(&request.call_id).map_err(|_| AppError::not_found("Invalid call id"))?;
    let sentiment = match request.sentiment.as_str() {
        "helpful" => CallReviewSentiment::Helpful,
        "welcome" => CallReviewSentiment::Welcome,
        "mistimed" => CallReviewSentiment::Mistimed,
        "intrusive" => CallReviewSentiment::Intrusive,
        _ => return Err(AppError::not_found("Unknown call review sentiment")),
    };

    let review = {
        let mut store = state.store.write().await;
        let call_exists = store
            .call_sessions
            .iter()
            .any(|call| call.call_id == call_id && call.user_handle == session.user_handle);
        if !call_exists {
            return Err(AppError::not_found("Unknown call for review"));
        }

        store
            .call_reviews
            .retain(|review| !(review.call_id == call_id && review.user_handle == session.user_handle));

        let review = CallReviewRecord {
            review_id: Uuid::new_v4(),
            call_id,
            user_handle: session.user_handle.clone(),
            sentiment: sentiment.clone(),
            notes: request.notes.trim().to_string(),
            created_at: Utc::now(),
        };

        store.call_reviews.push(review.clone());
        store
            .call_reviews
            .sort_by_key(|saved| std::cmp::Reverse(saved.created_at));
        if store.call_reviews.len() > 200 {
            store.call_reviews.truncate(200);
        }
        persist_store(&state.state_path, &store)?;
        review
    };

    let _ = state.broadcaster.send(CompanionEvent::CallReviewCreated {
        review_id: review.review_id,
        call_id: review.call_id,
        user_handle: review.user_handle.clone(),
        sentiment: review.sentiment.clone(),
        at: review.created_at,
    });

    Ok(StatusCode::NO_CONTENT)
}

async fn list_call_turns(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CallTurnsQuery>,
) -> Result<Json<CallTurnsResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let call_id =
        Uuid::parse_str(&query.call_id).map_err(|_| AppError::not_found("Invalid call id"))?;
    let store = state.store.read().await;
    let turns = store
        .call_turns
        .iter()
        .filter(|turn| turn.user_handle == session.user_handle && turn.call_id == call_id)
        .cloned()
        .collect();
    Ok(Json(CallTurnsResponse { turns }))
}

async fn create_mobile_call_turn(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateMobileCallTurnRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let call_id =
        Uuid::parse_str(&request.call_id).map_err(|_| AppError::not_found("Invalid call id"))?;
    {
        let mut store = state.store.write().await;
        let call = store
            .call_sessions
            .iter()
            .find(|call| call.call_id == call_id && call.user_handle == session.user_handle)
            .ok_or_else(|| AppError::not_found("Unknown call"))?;
        if !matches!(call.status, CallStatus::Accepted | CallStatus::Ended) {
            return Err(AppError::not_found("Call is not ready for spoken turns"));
        }

        let turn = CompanionCallTurn {
            turn_id: Uuid::new_v4(),
            call_id,
            user_handle: session.user_handle.clone(),
            created_at: Utc::now(),
            source: "mobile".to_string(),
            status: "pending".to_string(),
            input_audio_base64: request.audio_base64.trim().to_string(),
            transcript_text: None,
            reply_text: None,
            reply_mode: None,
            reply_audio_base64: None,
            sample_rate: None,
            completed_at: None,
        };

        store.call_turns.push(turn.clone());
        store
            .call_turns
            .sort_by_key(|saved| std::cmp::Reverse(saved.created_at));
        if store.call_turns.len() > 300 {
            store.call_turns.truncate(300);
        }
        persist_store(&state.state_path, &store)?;
    };

    Ok(StatusCode::NO_CONTENT)
}

async fn pull_desktop_call_turn(
    State(state): State<AppState>,
    Query(query): Query<DesktopPullCallTurnQuery>,
) -> Result<Json<CallTurnsResponse>, AppError> {
    let call_id =
        Uuid::parse_str(&query.call_id).map_err(|_| AppError::not_found("Invalid call id"))?;
    let store = state.store.read().await;
    let desktop = store
        .desktops
        .get(&query.device_token)
        .ok_or_else(|| AppError::not_found("Unknown device token"))?;
    let turns = store
        .call_turns
        .iter()
        .filter(|turn| {
            turn.user_handle == desktop.user_handle
                && turn.call_id == call_id
                && turn.status == "pending"
        })
        .take(1)
        .cloned()
        .collect();
    Ok(Json(CallTurnsResponse { turns }))
}

async fn complete_desktop_call_turn(
    State(state): State<AppState>,
    Json(request): Json<CompleteDesktopCallTurnRequest>,
) -> Result<StatusCode, AppError> {
    let turn_id =
        Uuid::parse_str(&request.turn_id).map_err(|_| AppError::not_found("Invalid turn id"))?;
    {
        let mut store = state.store.write().await;
        let desktop = store
            .desktops
            .get(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?
            .clone();
        let turn = store
            .call_turns
            .iter_mut()
            .find(|turn| turn.turn_id == turn_id && turn.user_handle == desktop.user_handle)
            .ok_or_else(|| AppError::not_found("Unknown call turn"))?;

        turn.status = "completed".to_string();
        turn.transcript_text = Some(request.transcript_text.trim().to_string());
        turn.reply_text = Some(request.reply_text.trim().to_string());
        turn.reply_mode = Some(request.reply_mode.trim().to_string());
        turn.reply_audio_base64 = Some(request.reply_audio_base64.trim().to_string());
        turn.sample_rate = Some(request.sample_rate);
        turn.completed_at = Some(Utc::now());
        persist_store(&state.state_path, &store)?;
    };

    Ok(StatusCode::NO_CONTENT)
}

async fn get_push_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PushStatusResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let store = state.store.read().await;
    let registered_subscriptions = store
        .push_subscriptions
        .iter()
        .filter(|subscription| subscription.user_handle == session.user_handle)
        .count();

    Ok(Json(PushStatusResponse {
        vapid_public_key: state.vapid_public_b64.clone(),
        registered_subscriptions,
        push_supported: true,
    }))
}

async fn upsert_push_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PushSubscriptionRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let subscriptions = {
        let mut store = state.store.write().await;
        if let Some(existing) = store
            .push_subscriptions
            .iter_mut()
            .find(|subscription| {
                subscription.user_handle == session.user_handle
                    && subscription.endpoint == request.endpoint
            })
        {
            existing.p256dh = request.keys.p256dh;
            existing.auth = request.keys.auth;
            existing.updated_at = Utc::now();
        } else {
            store.push_subscriptions.push(PushSubscriptionRecord {
                subscription_id: Uuid::new_v4(),
                user_handle: session.user_handle.clone(),
                endpoint: request.endpoint,
                p256dh: request.keys.p256dh,
                auth: request.keys.auth,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            });
        }

        store
            .push_subscriptions
            .sort_by_key(|saved| std::cmp::Reverse(saved.updated_at));
        if store.push_subscriptions.len() > 100 {
            store.push_subscriptions.truncate(100);
        }

        let subscriptions = store
            .push_subscriptions
            .iter()
            .filter(|subscription| subscription.user_handle == session.user_handle)
            .count();
        persist_store(&state.state_path, &store)?;
        subscriptions
    };

    let _ = state
        .broadcaster
        .send(CompanionEvent::PushSubscriptionUpdated {
            user_handle: session.user_handle,
            subscriptions,
            at: Utc::now(),
        });

    Ok(StatusCode::NO_CONTENT)
}

async fn create_mobile_webrtc_signal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateWebRtcSignalRequest>,
) -> Result<StatusCode, AppError> {
    let session = require_session(&state, &headers).await?;
    let call_id = Uuid::parse_str(&request.call_id)
        .map_err(|_| AppError::not_found("Invalid call id"))?;

    create_signal(
        &state,
        call_id,
        &session.user_handle,
        SignalTarget::Mobile,
        SignalTarget::Desktop,
        request.signal_kind,
        request.payload_json,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn create_desktop_webrtc_signal(
    State(state): State<AppState>,
    Json(request): Json<DesktopSignalRequest>,
) -> Result<StatusCode, AppError> {
    let call_id = Uuid::parse_str(&request.call_id)
        .map_err(|_| AppError::not_found("Invalid call id"))?;

    let user_handle = {
        let store = state.store.read().await;
        let desktop = store
            .desktops
            .get(&request.device_token)
            .ok_or_else(|| AppError::not_found("Unknown device token"))?;
        desktop.user_handle.clone()
    };

    create_signal(
        &state,
        call_id,
        &user_handle,
        SignalTarget::Desktop,
        SignalTarget::Mobile,
        request.signal_kind,
        request.payload_json,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_mobile_webrtc_signals(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<WebRtcSignalQuery>,
) -> Result<Json<WebRtcSignalsResponse>, AppError> {
    let session = require_session(&state, &headers).await?;
    let call_id = Uuid::parse_str(&query.call_id)
        .map_err(|_| AppError::not_found("Invalid call id"))?;
    let store = state.store.read().await;
    let signals = store
        .webrtc_signals
        .iter()
        .filter(|signal| {
            signal.call_id == call_id
                && signal.user_handle == session.user_handle
                && matches!(signal.target, SignalTarget::Mobile)
        })
        .cloned()
        .collect();
    Ok(Json(WebRtcSignalsResponse { signals }))
}

async fn list_desktop_webrtc_signals(
    State(state): State<AppState>,
    Query(query): Query<DesktopWebRtcSignalQuery>,
) -> Result<Json<WebRtcSignalsResponse>, AppError> {
    let call_id = Uuid::parse_str(&query.call_id)
        .map_err(|_| AppError::not_found("Invalid call id"))?;
    let store = state.store.read().await;
    let desktop = store
        .desktops
        .get(&query.device_token)
        .ok_or_else(|| AppError::not_found("Unknown device token"))?;
    let signals = store
        .webrtc_signals
        .iter()
        .filter(|signal| {
            signal.call_id == call_id
                && signal.user_handle == desktop.user_handle
                && matches!(signal.target, SignalTarget::Desktop)
        })
        .cloned()
        .collect();
    Ok(Json(WebRtcSignalsResponse { signals }))
}

async fn create_signal(
    state: &AppState,
    call_id: Uuid,
    user_handle: &str,
    source: SignalTarget,
    target: SignalTarget,
    signal_kind: String,
    payload_json: String,
) -> Result<(), AppError> {
    let signal = WebRtcSignal {
        signal_id: Uuid::new_v4(),
        call_id,
        user_handle: user_handle.to_string(),
        source,
        target: target.clone(),
        signal_kind,
        payload_json,
        created_at: Utc::now(),
    };

    {
        let mut store = state.store.write().await;
        store.webrtc_signals.push(signal.clone());
        store
            .webrtc_signals
            .sort_by_key(|saved| std::cmp::Reverse(saved.created_at));
        if store.webrtc_signals.len() > 400 {
            store.webrtc_signals.truncate(400);
        }
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::WebRtcSignalQueued {
        signal_id: signal.signal_id,
        call_id: signal.call_id,
        user_handle: signal.user_handle,
        target,
        at: signal.created_at,
    });

    Ok(())
}

async fn get_rtc_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RtcConfigResponse>, AppError> {
    let _ = require_session(&state, &headers).await?;
    let config = load_runtime_config();
    Ok(Json(RtcConfigResponse {
        ice_servers: config.rtc_ice_servers,
    }))
}

async fn create_message_for_user(
    state: &AppState,
    user_handle: &str,
    source: MessageSource,
    text: String,
) -> Result<(), AppError> {
    let push_text = text.clone();
    let message = CompanionMessage {
        message_id: Uuid::new_v4(),
        user_handle: user_handle.to_string(),
        source: source.clone(),
        text,
        created_at: Utc::now(),
    };

    {
        let mut store = state.store.write().await;
        store.messages.push(message.clone());
        store.messages.sort_by_key(|saved| saved.created_at);
        if store.messages.len() > 200 {
            let overflow = store.messages.len() - 200;
            store.messages.drain(0..overflow);
        }
        persist_store(&state.state_path, &store)?;
    }

    let _ = state.broadcaster.send(CompanionEvent::MessageCreated {
        message_id: message.message_id,
        user_handle: message.user_handle.clone(),
        source: source.clone(),
        at: message.created_at,
    });

    if matches!(source, MessageSource::Desktop) {
        let push_payload = notification_payload(
            "New message from NeuralTrainer",
            &push_text,
            "CHAT",
            message.message_id,
            "northstar-chat",
            false,
        );
        send_notification_to_user(&message.user_handle, &push_payload, state).await;
    }

    Ok(())
}

fn encrypt_payload(user_p256dh: &str, user_auth: &str, plaintext: &str) -> Result<Vec<u8>, String> {
    let user_pub_bytes = URL_SAFE_NO_PAD
        .decode(user_p256dh)
        .map_err(|_| "Invalid p256dh".to_string())?;
    let user_auth_bytes = URL_SAFE_NO_PAD
        .decode(user_auth)
        .map_err(|_| "Invalid auth".to_string())?;
    let user_pub_key =
        PublicKey::from_sec1_bytes(&user_pub_bytes).map_err(|_| "Invalid key".to_string())?;

    let server_secret = EphemeralSecret::random(&mut OsRng);
    let server_public = server_secret.public_key();
    let server_pub_bytes = server_public.to_encoded_point(false);

    let shared_secret = server_secret.diffie_hellman(&user_pub_key);
    let shared_secret_bytes = shared_secret.raw_secret_bytes();

    let mut ikm_info = Vec::new();
    ikm_info.extend_from_slice(b"WebPush: info\0");
    ikm_info.extend_from_slice(&user_pub_bytes);
    ikm_info.extend_from_slice(server_pub_bytes.as_bytes());

    let ikm_hkdf = Hkdf::<Sha256>::new(Some(&user_auth_bytes), shared_secret_bytes.as_slice());
    let mut ikm = [0u8; 32];
    ikm_hkdf
        .expand(&ikm_info, &mut ikm)
        .map_err(|_| "HKDF IKM failed".to_string())?;

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);

    let cek_hkdf = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut cek = [0u8; 16];
    cek_hkdf
        .expand(b"Content-Encoding: aes128gcm\0", &mut cek)
        .map_err(|_| "HKDF CEK failed".to_string())?;

    let mut nonce_bytes = [0u8; 12];
    cek_hkdf
        .expand(b"Content-Encoding: nonce\0", &mut nonce_bytes)
        .map_err(|_| "HKDF Nonce failed".to_string())?;

    let mut padded_body = plaintext.as_bytes().to_vec();
    padded_body.push(0x02);

    let cipher = Aes128Gcm::new(&cek.into());
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: &padded_body,
                aad: &[],
            },
        )
        .map_err(|_| "Encryption failed".to_string())?;

    let mut body = Vec::new();
    body.extend_from_slice(&salt);
    body.extend_from_slice(&4096u32.to_be_bytes());
    body.push(server_pub_bytes.as_bytes().len() as u8);
    body.extend_from_slice(server_pub_bytes.as_bytes());
    body.extend_from_slice(&ciphertext);

    Ok(body)
}

fn notification_payload(
    title: &str,
    body: &str,
    kind: &str,
    id: Uuid,
    tag: &str,
    require_interaction: bool,
) -> String {
    serde_json::json!({
        "title": title,
        "body": body,
        "text": body,
        "type": kind,
        "id": id,
        "tag": tag,
        "requireInteraction": require_interaction,
        "url": format!("/?navType={kind}&navId={id}")
    })
    .to_string()
}

async fn send_notification_to_user(user_handle: &str, content: &str, state: &AppState) {
    let subs = {
        let store = state.store.read().await;
        store
            .push_subscriptions
            .iter()
            .filter(|sub| sub.user_handle == user_handle)
            .cloned()
            .collect::<Vec<_>>()
    };

    if subs.is_empty() {
        return;
    }

    for sub in subs {
        let endpoint = sub.endpoint.clone();
        let aud = if endpoint.contains("fcm.googleapis.com") {
            "https://fcm.googleapis.com".to_string()
        } else if endpoint.contains("push.apple.com") {
            "https://web.push.apple.com".to_string()
        } else {
            let parts: Vec<&str> = endpoint.split('/').collect();
            if parts.len() >= 3 {
                parts[0..3].join("/")
            } else {
                "https://fcm.googleapis.com".to_string()
            }
        };

        let now = Utc::now().timestamp();
        let claims = serde_json::json!({
            "aud": aud,
            "exp": now + (12 * 3600),
            "sub": state.vapid_subject
        });

        let header = "{\"alg\":\"ES256\",\"typ\":\"JWT\"}";
        let unsigned = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header),
            URL_SAFE_NO_PAD.encode(claims.to_string())
        );
        let signature = {
            let signer = state.vapid_key.lock().unwrap();
            let sig: Signature = signer.sign(unsigned.as_bytes());
            URL_SAFE_NO_PAD.encode(sig.to_bytes())
        };
        let token = format!("{}.{}", unsigned, signature);
        let auth_header = format!("vapid t={}, k={}", token, state.vapid_public_b64);

        let payload_body = match encrypt_payload(&sub.p256dh, &sub.auth, content) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };

        let client = state.http_client.clone();
        let state_clone = state.clone();
        let endpoint_clone = endpoint.clone();
        tokio::spawn(async move {
            let result = client
                .post(&endpoint_clone)
                .header("Authorization", auth_header)
                .header("TTL", "43200")
                .header("Urgency", "high")
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .body(payload_body)
                .send()
                .await;

            match result {
                Ok(response) if response.status() == 410 || response.status() == 404 => {
                    let mut store = state_clone.store.write().await;
                    store
                        .push_subscriptions
                        .retain(|saved| saved.endpoint != endpoint_clone);
                    let _ = persist_store(&state_clone.state_path, &store);
                }
                _ => {}
            }
        });
    }
}

async fn require_session(state: &AppState, headers: &HeaderMap) -> Result<UserSession, AppError> {
    let token = headers
        .get("x-northstar-session")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::unauthorized("Missing North Star session"))?;

    let store = state.store.read().await;
    store
        .sessions
        .get(token)
        .cloned()
        .ok_or_else(|| AppError::unauthorized("Unknown North Star session"))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.broadcaster.subscribe();
    while let Ok(event) = rx.recv().await {
        let payload = match serde_json::to_string(&event) {
            Ok(payload) => payload,
            Err(_) => continue,
        };
        if socket.send(Message::Text(payload)).await.is_err() {
            break;
        }
        while let Ok(Some(message)) =
            tokio::time::timeout(std::time::Duration::from_millis(1), socket.next()).await
        {
            if matches!(message, Ok(Message::Close(_))) {
                return;
            }
        }
    }
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn not_found(message: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.to_string(),
        }
    }

    fn unauthorized(message: &str) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.to_string(),
        }
    }

    fn internal<E: std::fmt::Display>(error: E) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: error.to_string(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status, Json(ErrorResponse { error: self.message })).into_response()
    }
}
