use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub timezone: String,
  pub sleep_window_start: String,
  pub sleep_window_end: String,
  pub outreach_preference: String,
  pub emergency_bypass_enabled: bool,
  pub message_cooldown_minutes: i64,
  pub medium_confidence_threshold: f64,
  pub call_requests_enabled: bool,
  pub call_cooldown_minutes: i64,
  pub call_confidence_threshold: f64,
  pub lm_studio_endpoint: String,
  pub lm_studio_api_key: String,
  pub lm_studio_model: String,
  pub tts_provider: String,
  pub tts_endpoint: String,
  pub tts_api_key: String,
  pub tts_model_id: String,
  pub tts_sample_rate: i64,
  pub tts_default_voice: String,
  pub tts_model_path: String,
  pub tts_voices_path: String,
  pub call_transcript_cleanup_prompt: String,
  pub call_outbound_outreach_prompt: String,
  pub call_inbound_main_reply_prompt: String,
  pub call_outbound_main_reply_prompt: String,
  pub call_inbound_streamed_reply_prompt: String,
  pub call_outbound_streamed_reply_prompt: String,
  pub call_inbound_explanation_prompt: String,
  pub call_outbound_explanation_prompt: String,
  pub call_inbound_opener_prompt: String,
  pub call_inbound_opener_fallback: String,
  pub call_opener_prompt: String,
  pub call_outbound_opener_fallback: String,
  pub north_star_endpoint: String,
  pub north_star_user_handle: String,
  pub north_star_display_name: String,
  pub north_star_session_token: String,
  pub north_star_device_token: String,
  pub north_star_last_location_event_id: String,
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      timezone: "UTC".into(),
      sleep_window_start: "23:00".into(),
      sleep_window_end: "07:00".into(),
      outreach_preference: "balanced".into(),
      emergency_bypass_enabled: false,
      message_cooldown_minutes: 180,
      medium_confidence_threshold: 0.6,
      call_requests_enabled: false,
      call_cooldown_minutes: 720,
      call_confidence_threshold: 0.85,
      lm_studio_endpoint: "http://127.0.0.1:1234".into(),
      lm_studio_api_key: String::new(),
      lm_studio_model: "qwen/qwen3.5-9b".into(),
      tts_provider: "kokoro".into(),
      tts_endpoint: "http://127.0.0.1:8880/v1".into(),
      tts_api_key: String::new(),
      tts_model_id: "kokoro-82m".into(),
      tts_sample_rate: 24_000,
      tts_default_voice: "af_heart".into(),
      tts_model_path: String::new(),
      tts_voices_path: String::new(),
      call_transcript_cleanup_prompt: String::new(),
      call_outbound_outreach_prompt: String::new(),
      call_inbound_main_reply_prompt: String::new(),
      call_outbound_main_reply_prompt: String::new(),
      call_inbound_streamed_reply_prompt: String::new(),
      call_outbound_streamed_reply_prompt: String::new(),
      call_inbound_explanation_prompt: String::new(),
      call_outbound_explanation_prompt: String::new(),
      call_inbound_opener_prompt: String::new(),
      call_inbound_opener_fallback: String::new(),
      call_opener_prompt: String::new(),
      call_outbound_opener_fallback: String::new(),
      north_star_endpoint: "http://127.0.0.1:3100".into(),
      north_star_user_handle: String::new(),
      north_star_display_name: String::new(),
      north_star_session_token: String::new(),
      north_star_device_token: String::new(),
      north_star_last_location_event_id: String::new(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarDesktopBinding {
  pub desktop_id: String,
  pub desktop_name: String,
  pub user_handle: String,
  pub device_token: String,
  pub bound_at: String,
  pub last_heartbeat_at: Option<String>,
  pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarPairingCode {
  pub code: String,
  pub user_handle: String,
  pub display_name: String,
  pub desktop_name: String,
  pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarMessage {
  pub message_id: String,
  pub user_handle: String,
  pub source: String,
  pub text: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarLocationEvent {
  pub event_id: String,
  pub user_handle: String,
  pub latitude: f64,
  pub longitude: f64,
  pub accuracy_meters: Option<f64>,
  pub source: String,
  pub captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarCallSession {
  pub call_id: String,
  pub user_handle: String,
  pub desktop_id: String,
  pub desktop_name: String,
  pub device_token: String,
  pub requested_at: String,
  pub responded_at: Option<String>,
  pub status: String,
  pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarCallReview {
  pub review_id: String,
  pub call_id: String,
  pub user_handle: String,
  pub sentiment: String,
  pub notes: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarCallTurn {
  pub turn_id: String,
  pub call_id: String,
  pub user_handle: String,
  pub created_at: String,
  pub source: String,
  pub status: String,
  pub input_audio_base64: String,
  pub transcript_text: Option<String>,
  pub reply_text: Option<String>,
  pub reply_mode: Option<String>,
  pub reply_audio_base64: Option<String>,
  pub sample_rate: Option<i64>,
  pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarWebRtcSignal {
  pub signal_id: String,
  pub call_id: String,
  pub user_handle: String,
  pub source: String,
  pub target: String,
  pub signal_kind: String,
  pub payload_json: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarRtcIceServer {
  pub urls: Vec<String>,
  pub username: Option<String>,
  pub credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarSnapshot {
  pub configured: bool,
  pub session_ready: bool,
  pub desktop_bound: bool,
  pub endpoint: String,
  pub user_handle: String,
  pub display_name: String,
  pub desktop_name: String,
  pub session_token_masked: String,
  pub device_token_masked: String,
  pub desktops: Vec<NorthStarDesktopBinding>,
  pub messages: Vec<NorthStarMessage>,
  pub location_events: Vec<NorthStarLocationEvent>,
  pub call_sessions: Vec<NorthStarCallSession>,
  pub call_reviews: Vec<NorthStarCallReview>,
  pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarRuntimeSnapshot {
  pub configured: bool,
  pub session_ready: bool,
  pub desktop_bound: bool,
  pub call_sessions: Vec<NorthStarCallSession>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarTurnProcessingResult {
  pub processed: bool,
  pub detail: String,
  pub call_id: Option<String>,
  pub turn_id: Option<String>,
  pub reply: Option<CallTurnResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsEntry {
  pub key: String,
  pub value_json: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticStatus {
  pub app_data_dir: String,
  pub db_path: String,
  pub db_exists: bool,
  pub settings_count: usize,
  pub schema_version: i64,
  pub last_initialized_at: String,
  pub recent_events: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
  pub id: i64,
  pub label: String,
  pub latitude: Option<f64>,
  pub longitude: Option<f64>,
  pub radius_meters: i64,
  pub place_kind: String,
  pub meaning_kind: String,
  pub is_user_named: bool,
  pub significance_score: f64,
  pub is_protected: bool,
  pub notes: String,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaceInput {
  pub label: String,
  pub latitude: Option<f64>,
  pub longitude: Option<f64>,
  pub radius_meters: i64,
  pub place_kind: String,
  pub meaning_kind: String,
  pub is_user_named: bool,
  pub is_protected: bool,
  pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlaceInput {
  pub id: i64,
  pub meaning_kind: String,
  pub significance_score: f64,
  pub is_protected: bool,
  pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedRule {
  pub id: i64,
  pub rule_kind: String,
  pub scope_kind: String,
  pub scope_ref_id: Option<i64>,
  pub value_json: String,
  pub is_active: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRuleInput {
  pub rule_kind: String,
  pub scope_kind: String,
  pub scope_ref_id: Option<i64>,
  pub value_json: String,
  pub is_active: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRuleInput {
  pub id: i64,
  pub is_active: bool,
  pub value_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualReflection {
  pub id: i64,
  pub created_at: String,
  pub reflection_kind: String,
  pub text: String,
  pub linked_place_id: Option<i64>,
  pub linked_moment_id: Option<i64>,
  pub weight: f64,
  pub expires_at: Option<String>,
  pub is_sensitive: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReflectionInput {
  pub reflection_kind: String,
  pub text: String,
  pub linked_place_id: Option<i64>,
  pub weight: f64,
  pub expires_at: Option<String>,
  pub is_sensitive: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryOverview {
  pub place_count: usize,
  pub protected_rule_count: usize,
  pub reflection_count: usize,
  pub protected_place_count: usize,
  pub reflection_kind_breakdown: Vec<ReflectionKindCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflectionKindCount {
  pub reflection_kind: String,
  pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseOneSnapshot {
  pub places: Vec<Place>,
  pub rules: Vec<ProtectedRule>,
  pub reflections: Vec<ManualReflection>,
  pub overview: MemoryOverview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
  pub id: i64,
  pub memory_type: String,
  pub content: String,
  pub confidence: f64,
  pub source_kind: String,
  pub source_ref_id: Option<i64>,
  pub status: String,
  pub created_at: String,
  pub updated_at: String,
  pub reinforced_at: Option<String>,
  pub decays_after: Option<String>,
  pub requires_confirmation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryGrowthSnapshot {
  pub memory_items: Vec<MemoryItem>,
  pub active_count: usize,
  pub fading_count: usize,
  pub awaiting_confirmation_count: usize,
  pub archived_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryItemInput {
  pub id: i64,
  pub action: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationEventInput {
  pub occurred_at: String,
  pub latitude: f64,
  pub longitude: f64,
  pub accuracy_meters: Option<f64>,
  pub speed_mps: Option<f64>,
  pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLocationEvent {
  pub id: i64,
  pub occurred_at: String,
  pub latitude: f64,
  pub longitude: f64,
  pub accuracy_meters: Option<f64>,
  pub speed_mps: Option<f64>,
  pub movement_state: String,
  pub source: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceVisit {
  pub id: i64,
  pub place_id: Option<i64>,
  pub started_at: String,
  pub ended_at: Option<String>,
  pub duration_seconds: i64,
  pub arrival_mode: String,
  pub departure_mode: String,
  pub was_stationary: bool,
  pub confidence: f64,
  pub raw_context_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepeatedPlaceSummary {
  pub key: String,
  pub label: String,
  pub visit_count: usize,
  pub total_duration_seconds: i64,
  pub average_duration_seconds: i64,
  pub latitude: f64,
  pub longitude: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferredSleepWindow {
  pub start: String,
  pub end: String,
  pub confidence: f64,
  pub supporting_visit_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PassiveContextSnapshot {
  pub raw_events: Vec<RawLocationEvent>,
  pub visits: Vec<PlaceVisit>,
  pub repeated_places: Vec<RepeatedPlaceSummary>,
  pub inferred_sleep_window: InferredSleepWindow,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMoment {
  pub id: i64,
  pub created_at: String,
  pub visit_id: Option<i64>,
  pub place_id: Option<i64>,
  pub moment_kind: String,
  pub observed_context_json: String,
  pub inferred_significance: String,
  pub confidence: f64,
  pub action_taken: String,
  pub was_promoted_to_outreach: bool,
  pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhythmBaselineEntry {
  pub day_of_week: u32,
  pub hour_bucket: u32,
  pub visit_count: usize,
  pub average_duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseThreeSnapshot {
  pub saved_moments: Vec<SavedMoment>,
  pub rhythm_baseline: Vec<RhythmBaselineEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentMemoryInfluence {
  pub memory_item_id: i64,
  pub memory_key: String,
  pub memory_type: String,
  pub summary: String,
  pub confidence: f64,
  pub salience: f64,
  pub relevance_score: f64,
  pub sensitivity: String,
  pub current_status: Option<String>,
  pub phase_shift_state: Option<String>,
  pub phase_shift_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentDetectorPressure {
  pub detector_type: String,
  pub total_strength: f64,
  pub average_confidence: f64,
  pub sample_count: usize,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentAssessment {
  pub kind: String,
  pub score: f64,
  pub confidence: f64,
  pub summary: String,
  pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentSignal {
  pub kind: String,
  pub score: f64,
  pub confidence: f64,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentOpportunity {
  pub kind: String,
  pub score: f64,
  pub confidence: f64,
  pub timing: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentSafeguard {
  pub kind: String,
  pub score: f64,
  pub confidence: f64,
  pub urgency: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentSituationalSignal {
  pub kind: String,
  pub score: f64,
  pub confidence: f64,
  pub direction: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentRelationalBridge {
  pub title: String,
  pub category_key: String,
  pub score: f64,
  pub confidence: f64,
  pub bridge_kind: String,
  pub recent_contact_state: String,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentContactRhythmOption {
  pub level: String,
  pub score: f64,
  pub confidence: f64,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivedMomentSnapshot {
  pub captured_at: String,
  pub timezone: String,
  pub local_time: String,
  pub local_date: String,
  pub local_day_of_week: String,
  pub time_bucket: String,
  pub is_likely_sleep_window: bool,
  pub rhythm_state: String,
  pub rhythm_confidence: f64,
  pub latest_location_event: Option<RawLocationEvent>,
  pub active_visit: Option<PlaceVisit>,
  pub matched_place: Option<Place>,
  pub repeated_place: Option<RepeatedPlaceSummary>,
  pub recent_saved_moments: Vec<SavedMoment>,
  pub related_memories: Vec<LivedMomentMemoryInfluence>,
  pub detector_pressures: Vec<LivedMomentDetectorPressure>,
  pub dominant_phase_shift_state: String,
  pub dominant_phase_shift_score: f64,
  pub dominant_phase_shift_summary: String,
  pub assessments: Vec<LivedMomentAssessment>,
  pub actionable_signals: Vec<LivedMomentSignal>,
  pub opportunities: Vec<LivedMomentOpportunity>,
  pub safeguards: Vec<LivedMomentSafeguard>,
  pub situational_signals: Vec<LivedMomentSituationalSignal>,
  pub relational_bridges: Vec<LivedMomentRelationalBridge>,
  pub contact_rhythm_options: Vec<LivedMomentContactRhythmOption>,
  pub primary_assessment: String,
  pub recommended_signal: String,
  pub contact_rhythm_hint: String,
  pub recommended_contact_mode: String,
  pub recent_contact_load: f64,
  pub recent_contact_summary: String,
  pub action_bias: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldSignalSourceStatus {
  pub source_key: String,
  pub label: String,
  pub status: String,
  pub detail: String,
  pub checked_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealWorldWeatherSnapshot {
  pub temperature_celsius: Option<f64>,
  pub apparent_temperature_celsius: Option<f64>,
  pub weather_code: Option<i64>,
  pub weather_summary: String,
  pub wind_speed_kph: Option<f64>,
  pub precipitation_probability_percent: Option<f64>,
  pub precipitation_mm: Option<f64>,
  pub is_day: Option<bool>,
  pub caution_level: String,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealWorldDaylightSnapshot {
  pub sunrise_at: Option<String>,
  pub sunset_at: Option<String>,
  pub daylight_state: String,
  pub minutes_until_transition: Option<i64>,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NearbyInterestFilter {
  pub id: i64,
  pub category_key: String,
  pub label: String,
  pub description: String,
  pub tags: Vec<String>,
  pub is_enabled: bool,
  pub display_order: i64,
  pub is_user_defined: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NearbyDiscoveryCandidate {
  pub title: String,
  pub source: String,
  pub category_key: String,
  pub distance_meters: Option<f64>,
  pub score: f64,
  pub tags: Vec<String>,
  pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNearbyInterestFilterInput {
  pub label: String,
  pub description: String,
  pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNearbyInterestFilterInput {
  pub id: i64,
  pub label: String,
  pub description: String,
  pub tags: Vec<String>,
  pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealWorldPresenceSnapshot {
  pub captured_at: String,
  pub timezone: String,
  pub location_available: bool,
  pub latitude: Option<f64>,
  pub longitude: Option<f64>,
  pub location_summary: String,
  pub weather: Option<RealWorldWeatherSnapshot>,
  pub daylight: Option<RealWorldDaylightSnapshot>,
  pub warning_summary: String,
  pub source_statuses: Vec<WorldSignalSourceStatus>,
  pub nearby_interest_filters: Vec<NearbyInterestFilter>,
  pub nearby_candidates: Vec<NearbyDiscoveryCandidate>,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutreachEvent {
  pub id: i64,
  pub created_at: String,
  pub saved_moment_id: Option<i64>,
  pub outreach_kind: String,
  pub channel: String,
  pub reason_summary: String,
  pub message_text: String,
  pub confidence: f64,
  pub was_delivered: bool,
  pub delivery_metadata_json: String,
  pub response_state: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboundMessage {
  pub id: i64,
  pub created_at: String,
  pub outreach_event_id: Option<i64>,
  pub telegram_update_id: i64,
  pub telegram_message_id: Option<i64>,
  pub chat_id: String,
  pub sender_id: Option<String>,
  pub text: String,
  pub received_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallSession {
  pub id: i64,
  pub created_at: String,
  pub outreach_event_id: Option<i64>,
  pub saved_moment_id: Option<i64>,
  pub handoff_kind: String,
  pub session_state: String,
  pub started_at: Option<String>,
  pub ended_at: Option<String>,
  pub outcome: String,
  pub notes: String,
  pub transcript_summary: String,
  pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallTurnRecord {
  pub id: i64,
  pub session_id: i64,
  pub created_at: String,
  pub transcript_text: String,
  pub reply_text: String,
  pub reply_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallSessionSnapshot {
  pub active_session: Option<CallSession>,
  pub active_session_turns: Vec<CallTurnRecord>,
  pub recent_sessions: Vec<CallSession>,
  pub accepted_call_request_count: usize,
  pub active_session_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCallSessionInput {
  pub outreach_event_id: Option<i64>,
  pub handoff_kind: String,
  pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndCallSessionInput {
  pub session_id: i64,
  pub outcome: String,
  pub transcript_summary: String,
  pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentDecision {
  pub id: i64,
  pub saved_moment_id: i64,
  pub decided_at: String,
  pub decision_kind: String,
  pub reason_summary: String,
  pub decision_metadata_json: String,
  pub created_outreach_event_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionSnapshot {
  pub decisions: Vec<MomentDecision>,
  pub outreach_events: Vec<OutreachEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRunResult {
  pub promoted_count: usize,
  pub suppressed_count: usize,
  pub decisions: Vec<MomentDecision>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealityCheckItem {
  pub key: String,
  pub label: String,
  pub passed: bool,
  pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MvpRealityCheckSnapshot {
  pub raw_event_count: usize,
  pub visit_count: usize,
  pub saved_moment_count: usize,
  pub decision_count: usize,
  pub sent_outreach_count: usize,
  pub feedback_count: usize,
  pub draft_outreach_count: usize,
  pub items: Vec<RealityCheckItem>,
  pub next_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationScenario {
  pub key: String,
  pub label: String,
  pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRunInput {
  pub scenario_key: String,
  pub clear_existing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationRunResult {
  pub scenario_key: String,
  pub scenario_label: String,
  pub seeded_event_count: usize,
  pub promoted_count: usize,
  pub suppressed_count: usize,
  pub draft_count: usize,
  pub draft_preview: Option<String>,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSuiteCheck {
  pub key: String,
  pub label: String,
  pub passed: bool,
  pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSuiteResult {
  pub scenario_results: Vec<SimulationRunResult>,
  pub checks: Vec<SimulationSuiteCheck>,
  pub passed_count: usize,
  pub total_count: usize,
  pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftedOutreachDispatchResult {
  pub outreach_event: OutreachEvent,
  pub dispatched_payload: String,
  pub channel: String,
  pub north_star_detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftedOutreachAutoDispatchResult {
  pub dispatched: bool,
  pub dispatch: Option<DraftedOutreachDispatchResult>,
  pub detail: String,
  pub held_outreach_event: Option<OutreachEvent>,
  pub eligibility_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutreachFeedback {
  pub id: i64,
  pub outreach_event_id: i64,
  pub feedback_kind: String,
  pub score: f64,
  pub notes: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitFeedbackInput {
  pub outreach_event_id: i64,
  pub feedback_kind: String,
  pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSnapshot {
  pub provider: String,
  pub model_id: String,
  pub sample_rate: i64,
  pub default_voice: String,
  pub model_path: String,
  pub voices_path: String,
  pub previews_dir: String,
  pub speech_model_path: String,
  pub files_ready: bool,
  pub missing_files: Vec<String>,
  pub runtime_ready: bool,
  pub runtime_detail: String,
  pub managed_runtime: bool,
  pub runtime_endpoint: String,
  pub runtime_root: String,
  pub runtime_stdout_log: String,
  pub runtime_stderr_log: String,
  pub speech_ready: bool,
  pub speech_runtime_ready: bool,
  pub speech_runtime_detail: String,
  pub example_voices: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSynthesisResult {
  pub provider: String,
  pub voice: String,
  pub text: String,
  pub sample_rate: i64,
  pub output_path: String,
  pub audio_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallTurnResult {
  pub session_id: i64,
  pub transcript_text: String,
  pub reply_text: String,
  pub reply_mode: String,
  pub reply_voice: String,
  pub reply_output_path: String,
  pub reply_audio_base64: String,
  pub sample_rate: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NorthStarLiveReplyStreamEvent {
  pub request_id: String,
  pub phase: String,
  pub transcript_text: Option<String>,
  pub reply_text: Option<String>,
  pub reply_mode: Option<String>,
  pub text_chunk: Option<String>,
  pub audio_base64: Option<String>,
  pub audio_slice: Option<String>,
  pub sample_rate: Option<i64>,
  pub chunk_index: Option<usize>,
  pub part_index: Option<usize>,
  pub total_parts: Option<usize>,
  pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechStreamSnapshot {
  pub active: bool,
  pub started_at: Option<String>,
  pub partial_text: String,
  pub final_text: String,
  pub status: String,
  pub last_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSpeechStreamInput {
  pub session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopSpeechStreamInput {
  pub session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSpeechStreamAudioInput {
  pub session_id: i64,
  pub audio_base64: String,
  pub sample_rate: i64,
  pub audio_format: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCallTurnInput {
  pub session_id: i64,
  pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionContextCategory {
  pub key: String,
  pub label: String,
  pub description: String,
  pub icon: String,
  pub display_order: i64,
  pub is_system: bool,
  pub is_deleted: bool,
  pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionContextEntry {
  pub id: i64,
  pub category_key: String,
  pub title: String,
  pub body: String,
  pub tags: Vec<String>,
  pub notes: String,
  pub display_order: i64,
  pub is_active: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionContextSection {
  pub category: CompanionContextCategory,
  pub entries: Vec<CompanionContextEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionContextSnapshot {
  pub categories: Vec<CompanionContextSection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionHomeSnapshot {
  pub categories: Vec<CompanionContextSection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedMemoryItem {
  pub id: i64,
  pub memory_key: String,
  pub source_kind: String,
  pub source_ref_id: Option<i64>,
  pub source_category_key: String,
  pub source_entry_title: String,
  pub memory_type: String,
  pub summary: String,
  pub detail: String,
  pub tags: Vec<String>,
  pub confidence: f64,
  pub salience: f64,
  pub sensitivity: String,
  pub declared_by_user: bool,
  pub status: String,
  pub created_at: String,
  pub updated_at: String,
  pub interpreted_at: String,
  pub last_observed_at: String,
  pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectorRecord {
  pub id: i64,
  pub detector_key: String,
  pub detector_type: String,
  pub target_kind: String,
  pub target_ref_id: Option<i64>,
  pub target_key: String,
  pub direction: String,
  pub strength: f64,
  pub confidence: f64,
  pub duration_seconds: i64,
  pub repeat_count: i64,
  pub summary: String,
  pub evidence_json: String,
  pub created_at: String,
  pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEvolutionState {
  pub id: i64,
  pub memory_item_id: i64,
  pub declared_confidence: f64,
  pub observed_confidence: f64,
  pub detector_balance: f64,
  pub observed_support_score: f64,
  pub observed_challenge_score: f64,
  pub divergence_score: f64,
  pub cumulative_support_score: f64,
  pub cumulative_challenge_score: f64,
  pub cumulative_divergence_score: f64,
  pub support_source_count: i64,
  pub challenge_source_count: i64,
  pub source_coherence_score: f64,
  pub sustained_divergence_score: f64,
  pub phase_shift_score: f64,
  pub phase_shift_state: String,
  pub truth_alignment: String,
  pub current_status: String,
  pub reinforcement_score: f64,
  pub drift_score: f64,
  pub tension_score: f64,
  pub volatility_score: f64,
  pub emergence_score: f64,
  pub protection_score: f64,
  pub declared_truth_summary: String,
  pub observed_truth_summary: String,
  pub observed_evidence_summary: String,
  pub phase_shift_summary: String,
  pub alignment_summary: String,
  pub last_evolved_at: String,
  pub last_confirmed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TectonicTimelineSnapshot {
  pub id: i64,
  pub snapshot_kind: String,
  pub recorded_at: String,
  pub window_start: String,
  pub window_end: String,
  pub total_detector_activity: f64,
  pub active_memory_count: i64,
  pub summary_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySystemCount {
  pub key: String,
  pub count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySystemOverview {
  pub total_memory_count: usize,
  pub active_memory_count: usize,
  pub historical_memory_count: usize,
  pub detector_count: usize,
  pub tectonic_snapshot_count: usize,
  pub last_pass_at: Option<String>,
  pub memory_type_breakdown: Vec<MemorySystemCount>,
  pub detector_type_breakdown: Vec<MemorySystemCount>,
  pub evolution_status_breakdown: Vec<MemorySystemCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySystemSnapshot {
  pub memory_items: Vec<InterpretedMemoryItem>,
  pub detector_records: Vec<DetectorRecord>,
  pub evolution_states: Vec<MemoryEvolutionState>,
  pub tectonic_timeline: Vec<TectonicTimelineSnapshot>,
  pub overview: MemorySystemOverview,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompanionContextEntryInput {
  pub category_key: String,
  pub title: String,
  pub body: String,
  pub tags: Vec<String>,
  pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompanionContextEntryInput {
  pub id: i64,
  pub title: String,
  pub body: String,
  pub tags: Vec<String>,
  pub notes: String,
  pub is_active: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderCompanionContextEntriesInput {
  pub category_key: String,
  pub entry_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCompanionContextCategoryInput {
  pub category_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompanionContextCategoryInput {
  pub label: String,
  pub description: String,
  pub icon: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompanionContextCategoryIconInput {
  pub category_key: String,
  pub icon: String,
}
