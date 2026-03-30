use std::{
  collections::{HashMap, HashSet},
  fs,
  path::PathBuf,
};

use chrono::{DateTime, Datelike, Duration, NaiveTime, Timelike, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::json;

use crate::{
  error::AppError,
  models::{
    AppSettings, CallSession, CallSessionSnapshot, CallTurnRecord, CreatePlaceInput, CreateReflectionInput, CreateRuleInput, DecisionRunResult,
    CompanionContextCategory, CompanionContextEntry, CompanionContextSection, CompanionContextSnapshot, CompanionHomeSnapshot,
    CreateCompanionContextCategoryInput, CreateCompanionContextEntryInput, DeleteCompanionContextCategoryInput, ReorderCompanionContextEntriesInput, UpdateCompanionContextCategoryIconInput, UpdateCompanionContextEntryInput,
    DetectorRecord, InterpretedMemoryItem, MemoryEvolutionState, MemorySystemCount, MemorySystemOverview, MemorySystemSnapshot, TectonicTimelineSnapshot,
    DecisionSnapshot, DiagnosticStatus, EndCallSessionInput, InboundMessage, InferredSleepWindow,
    LivedMomentAssessment, LivedMomentContactRhythmOption, LivedMomentDetectorPressure, LivedMomentMemoryInfluence, LivedMomentOpportunity, LivedMomentRelationalBridge, LivedMomentSafeguard, LivedMomentSignal, LivedMomentSituationalSignal, LivedMomentSnapshot,
    LocationEventInput, ManualReflection, MemoryOverview, MomentDecision, OutreachEvent,
    MemoryGrowthSnapshot, MemoryItem, OutreachFeedback, PassiveContextSnapshot, PhaseOneSnapshot, PhaseThreeSnapshot, Place,
    NorthStarCallReview,
    PlaceVisit, ProtectedRule, RawLocationEvent, ReflectionKindCount,
    RepeatedPlaceSummary, RealityCheckItem, RhythmBaselineEntry, SavedMoment, SettingsEntry,
    SimulationRunInput, SimulationRunResult, SimulationScenario, SimulationSuiteCheck,
    SimulationSuiteResult, StartCallSessionInput, SubmitFeedbackInput, UpdateMemoryItemInput,
    UpdatePlaceInput, UpdateRuleInput, MvpRealityCheckSnapshot,
  },
};

pub const SCHEMA_VERSION: i64 = 18;

const COMPANION_CONTEXT_CATEGORY_DEFS: [(&str, &str, &str, &str); 11] = [
    ("friends", "Friends", "The people you lean toward, miss, trust, or feel alive around.", "users"),
    ("family", "Family", "Family ties, emotional anchors, and the people whose presence shapes your life.", "family"),
    ("favorite_places", "Favorite Places", "Places that feel meaningful, alive, restorative, familiar, or important.", "map"),
    ("career", "Career", "Work identity, responsibilities, ambitions, and the shape your work life takes.", "briefcase"),
    ("home_location", "Home Location", "What home means, where it is, and what the space represents in daily life.", "home"),
    ("goals", "Goals", "What you are reaching toward right now, whether practical, personal, or long-term.", "target"),
    ("favorite_food", "Favorite Food", "Comfort foods, rituals, cravings, or things that genuinely feel like you.", "food"),
    ("hobbies", "Hobbies", "Activities, crafts, interests, and the ways you naturally spend attention and time.", "spark"),
    ("pet", "Pet", "Animals, companions, routines, and emotional bonds that matter in day-to-day life.", "paw"),
    ("life_principles", "Life Principles", "Values, lines you do not want to cross, and truths you try to live by.", "compass"),
    ("music", "Music", "Artists, sounds, moods, or songs that carry identity, memory, and feeling.", "music"),
  ];

pub fn init_storage() -> Result<(PathBuf, PathBuf, String), AppError> {
  let base_dir = dirs::data_local_dir().ok_or(AppError::MissingAppDataDir)?;
  let app_dir = base_dir.join("NeuralTrainer");
  fs::create_dir_all(&app_dir)?;

  let db_path = app_dir.join("neural_trainer.sqlite");
  let connection = Connection::open(&db_path)?;
  apply_schema(&connection)?;

  let initialized_at = Utc::now().to_rfc3339();

  Ok((app_dir, db_path, initialized_at))
}

fn init_storage_at_path(db_path: &PathBuf) -> Result<(), AppError> {
  if let Some(parent) = db_path.parent() {
    fs::create_dir_all(parent)?;
  }
  let connection = Connection::open(db_path)?;
  apply_schema(&connection)?;
  Ok(())
}

pub fn load_settings(db_path: &PathBuf) -> Result<AppSettings, AppError> {
  let connection = Connection::open(db_path)?;
  let mut settings = AppSettings::default();

  let mut statement = connection.prepare("SELECT key, value_json FROM settings")?;
  let rows = statement.query_map([], |row| {
    let key: String = row.get(0)?;
    let value_json: String = row.get(1)?;
    Ok((key, value_json))
  })?;

  for row in rows {
    let (key, value_json) = row?;
    match key.as_str() {
      "timezone" => settings.timezone = serde_json::from_str(&value_json)?,
      "sleep_window_start" => settings.sleep_window_start = serde_json::from_str(&value_json)?,
      "sleep_window_end" => settings.sleep_window_end = serde_json::from_str(&value_json)?,
      "outreach_preference" => {
        settings.outreach_preference = serde_json::from_str(&value_json)?
      }
      "emergency_bypass_enabled" => {
        settings.emergency_bypass_enabled = serde_json::from_str(&value_json)?
      }
      "message_cooldown_minutes" => {
        settings.message_cooldown_minutes = serde_json::from_str(&value_json)?
      }
      "medium_confidence_threshold" => {
        settings.medium_confidence_threshold = serde_json::from_str(&value_json)?
      }
      "call_requests_enabled" => {
        settings.call_requests_enabled = serde_json::from_str(&value_json)?
      }
      "call_cooldown_minutes" => {
        settings.call_cooldown_minutes = serde_json::from_str(&value_json)?
      }
      "call_confidence_threshold" => {
        settings.call_confidence_threshold = serde_json::from_str(&value_json)?
      }
      "lm_studio_endpoint" => settings.lm_studio_endpoint = serde_json::from_str(&value_json)?,
      "lm_studio_api_key" => settings.lm_studio_api_key = serde_json::from_str(&value_json)?,
      "lm_studio_model" => settings.lm_studio_model = serde_json::from_str(&value_json)?,
      "tts_provider" => settings.tts_provider = serde_json::from_str(&value_json)?,
      "tts_endpoint" => settings.tts_endpoint = serde_json::from_str(&value_json)?,
      "tts_api_key" => settings.tts_api_key = serde_json::from_str(&value_json)?,
      "tts_model_id" => settings.tts_model_id = serde_json::from_str(&value_json)?,
      "tts_sample_rate" => settings.tts_sample_rate = serde_json::from_str(&value_json)?,
      "tts_default_voice" => settings.tts_default_voice = serde_json::from_str(&value_json)?,
      "tts_model_path" => settings.tts_model_path = serde_json::from_str(&value_json)?,
      "tts_voices_path" => settings.tts_voices_path = serde_json::from_str(&value_json)?,
      "call_transcript_cleanup_prompt" => {
        settings.call_transcript_cleanup_prompt = serde_json::from_str(&value_json)?
      }
      "call_outbound_outreach_prompt" => {
        settings.call_outbound_outreach_prompt = serde_json::from_str(&value_json)?
      }
      "call_inbound_main_reply_prompt" => {
        settings.call_inbound_main_reply_prompt = serde_json::from_str(&value_json)?
      }
      "call_outbound_main_reply_prompt" => {
        settings.call_outbound_main_reply_prompt = serde_json::from_str(&value_json)?
      }
      "call_inbound_streamed_reply_prompt" => {
        settings.call_inbound_streamed_reply_prompt = serde_json::from_str(&value_json)?
      }
      "call_outbound_streamed_reply_prompt" => {
        settings.call_outbound_streamed_reply_prompt = serde_json::from_str(&value_json)?
      }
      "call_inbound_explanation_prompt" => {
        settings.call_inbound_explanation_prompt = serde_json::from_str(&value_json)?
      }
      "call_outbound_explanation_prompt" => {
        settings.call_outbound_explanation_prompt = serde_json::from_str(&value_json)?
      }
      "call_opener_prompt" => {
        settings.call_opener_prompt = serde_json::from_str(&value_json)?
      }
      "north_star_endpoint" => settings.north_star_endpoint = serde_json::from_str(&value_json)?,
      "north_star_user_handle" => settings.north_star_user_handle = serde_json::from_str(&value_json)?,
      "north_star_display_name" => settings.north_star_display_name = serde_json::from_str(&value_json)?,
      "north_star_session_token" => settings.north_star_session_token = serde_json::from_str(&value_json)?,
      "north_star_device_token" => settings.north_star_device_token = serde_json::from_str(&value_json)?,
      "north_star_last_location_event_id" => settings.north_star_last_location_event_id = serde_json::from_str(&value_json)?,
      _ => {}
    }
  }

  Ok(settings)
}

pub fn save_settings(
  db_path: &PathBuf,
  payload: &AppSettings,
) -> Result<Vec<SettingsEntry>, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();
  let transaction = connection.unchecked_transaction()?;

  let rows = vec![
    ("timezone", serde_json::to_string(&payload.timezone)?),
    (
      "sleep_window_start",
      serde_json::to_string(&payload.sleep_window_start)?,
    ),
    ("sleep_window_end", serde_json::to_string(&payload.sleep_window_end)?),
    (
      "outreach_preference",
      serde_json::to_string(&payload.outreach_preference)?,
    ),
    (
      "emergency_bypass_enabled",
      serde_json::to_string(&payload.emergency_bypass_enabled)?,
    ),
    (
      "message_cooldown_minutes",
      serde_json::to_string(&payload.message_cooldown_minutes)?,
    ),
    (
      "medium_confidence_threshold",
      serde_json::to_string(&payload.medium_confidence_threshold)?,
    ),
    (
      "call_requests_enabled",
      serde_json::to_string(&payload.call_requests_enabled)?,
    ),
    (
      "call_cooldown_minutes",
      serde_json::to_string(&payload.call_cooldown_minutes)?,
    ),
    (
      "call_confidence_threshold",
      serde_json::to_string(&payload.call_confidence_threshold)?,
    ),
    (
      "lm_studio_endpoint",
      serde_json::to_string(&payload.lm_studio_endpoint)?,
    ),
    (
      "lm_studio_api_key",
      serde_json::to_string(&payload.lm_studio_api_key)?,
    ),
    (
      "lm_studio_model",
      serde_json::to_string(&payload.lm_studio_model)?,
    ),
    (
      "tts_provider",
      serde_json::to_string(&payload.tts_provider)?,
    ),
    (
      "tts_endpoint",
      serde_json::to_string(&payload.tts_endpoint)?,
    ),
    (
      "tts_api_key",
      serde_json::to_string(&payload.tts_api_key)?,
    ),
    (
      "tts_model_id",
      serde_json::to_string(&payload.tts_model_id)?,
    ),
    (
      "tts_sample_rate",
      serde_json::to_string(&payload.tts_sample_rate)?,
    ),
    (
      "tts_default_voice",
      serde_json::to_string(&payload.tts_default_voice)?,
    ),
    (
      "tts_model_path",
      serde_json::to_string(&payload.tts_model_path)?,
    ),
    (
      "tts_voices_path",
      serde_json::to_string(&payload.tts_voices_path)?,
    ),
    (
      "call_transcript_cleanup_prompt",
      serde_json::to_string(&payload.call_transcript_cleanup_prompt)?,
    ),
    (
      "call_outbound_outreach_prompt",
      serde_json::to_string(&payload.call_outbound_outreach_prompt)?,
    ),
    (
      "call_inbound_main_reply_prompt",
      serde_json::to_string(&payload.call_inbound_main_reply_prompt)?,
    ),
    (
      "call_outbound_main_reply_prompt",
      serde_json::to_string(&payload.call_outbound_main_reply_prompt)?,
    ),
    (
      "call_inbound_streamed_reply_prompt",
      serde_json::to_string(&payload.call_inbound_streamed_reply_prompt)?,
    ),
    (
      "call_outbound_streamed_reply_prompt",
      serde_json::to_string(&payload.call_outbound_streamed_reply_prompt)?,
    ),
    (
      "call_inbound_explanation_prompt",
      serde_json::to_string(&payload.call_inbound_explanation_prompt)?,
    ),
    (
      "call_outbound_explanation_prompt",
      serde_json::to_string(&payload.call_outbound_explanation_prompt)?,
    ),
    (
      "call_opener_prompt",
      serde_json::to_string(&payload.call_opener_prompt)?,
    ),
    (
      "north_star_endpoint",
      serde_json::to_string(&payload.north_star_endpoint)?,
    ),
    (
      "north_star_user_handle",
      serde_json::to_string(&payload.north_star_user_handle)?,
    ),
    (
      "north_star_display_name",
      serde_json::to_string(&payload.north_star_display_name)?,
    ),
    (
      "north_star_session_token",
      serde_json::to_string(&payload.north_star_session_token)?,
    ),
    (
      "north_star_device_token",
      serde_json::to_string(&payload.north_star_device_token)?,
    ),
    (
      "north_star_last_location_event_id",
      serde_json::to_string(&payload.north_star_last_location_event_id)?,
    ),
  ];

  for (key, value_json) in &rows {
    transaction.execute(
      r#"
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      "#,
      params![key, value_json, timestamp],
    )?;
  }

  transaction.commit()?;

  Ok(
    rows
      .into_iter()
      .map(|(key, value_json)| SettingsEntry {
        key: key.to_string(),
        value_json,
        updated_at: timestamp.clone(),
      })
      .collect(),
  )
}

pub fn diagnostics(
  app_data_dir: &PathBuf,
  db_path: &PathBuf,
  last_initialized_at: &str,
  recent_events: Vec<String>,
) -> Result<DiagnosticStatus, AppError> {
  let connection = Connection::open(db_path)?;
  let settings_count = connection.query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))?;
  let schema_version = connection.query_row("SELECT version FROM app_meta LIMIT 1", [], |row| row.get(0))?;

  Ok(DiagnosticStatus {
    app_data_dir: app_data_dir.display().to_string(),
    db_path: db_path.display().to_string(),
    db_exists: db_path.exists(),
    settings_count,
    schema_version,
    last_initialized_at: last_initialized_at.to_string(),
    recent_events,
  })
}

fn slugify_companion_context_label(label: &str) -> String {
  let mut slug = String::new();
  let mut last_was_separator = false;
  for ch in label.chars() {
    if ch.is_ascii_alphanumeric() {
      slug.push(ch.to_ascii_lowercase());
      last_was_separator = false;
    } else if !last_was_separator {
      slug.push('_');
      last_was_separator = true;
    }
  }
  slug.trim_matches('_').to_string()
}

fn table_columns(connection: &Connection, table_name: &str) -> Result<Vec<String>, AppError> {
  let pragma = format!("PRAGMA table_info({table_name})");
  let mut statement = connection.prepare(&pragma)?;
  let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn companion_context_category_exists(connection: &Connection, category_key: &str) -> Result<bool, AppError> {
  let count: i64 = connection.query_row(
    "SELECT COUNT(*) FROM companion_context_categories WHERE key = ?1",
    params![category_key],
    |row| row.get(0),
  )?;

  let category_columns = table_columns(connection, "companion_context_categories")?;
  if !category_columns.iter().any(|column| column == "icon") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'spark'",
      [],
    )?;
  }
  if !category_columns.iter().any(|column| column == "is_deleted") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
      [],
    )?;
  }
  if !category_columns.iter().any(|column| column == "deleted_at") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN deleted_at TEXT",
      [],
    )?;
  }

  let entry_columns = table_columns(connection, "companion_context_entries")?;
  if !entry_columns.iter().any(|column| column == "deleted_at") {
    connection.execute(
      "ALTER TABLE companion_context_entries ADD COLUMN deleted_at TEXT",
      [],
    )?;
  }
  Ok(count > 0)
}

fn is_valid_companion_context_category(connection: &Connection, category_key: &str) -> Result<bool, AppError> {
  let count: i64 = connection.query_row(
    "SELECT COUNT(*) FROM companion_context_categories WHERE key = ?1 AND is_deleted = 0",
    params![category_key],
    |row| row.get(0),
  )?;
  Ok(count > 0)
}

fn row_to_companion_context_entry(row: &rusqlite::Row<'_>) -> Result<CompanionContextEntry, rusqlite::Error> {
  let tags_json: String = row.get("tags_json")?;
  Ok(CompanionContextEntry {
    id: row.get("id")?,
    category_key: row.get("category_key")?,
    title: row.get("title")?,
    body: row.get("body")?,
    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
    notes: row.get("notes")?,
    display_order: row.get("display_order")?,
    is_active: row.get("is_active")?,
    created_at: row.get("created_at")?,
    updated_at: row.get("updated_at")?,
  })
}

fn list_companion_context_entries(connection: &Connection) -> Result<Vec<CompanionContextEntry>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        category_key,
        title,
        body,
        tags_json,
        notes,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM companion_context_entries
      ORDER BY category_key ASC, display_order ASC, updated_at DESC, id DESC
    "#,
  )?;
  let rows = statement.query_map([], row_to_companion_context_entry)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn build_companion_context_snapshot_with_filter(
  connection: &Connection,
  active_only: bool,
) -> Result<Vec<CompanionContextSection>, AppError> {
  let entries = list_companion_context_entries(connection)?;
  let categories = companion_context_categories_with_visibility(connection)?;
  Ok(
      categories
        .into_iter()
        .filter(|category| !category.is_deleted)
        .map(|category| {
          let filtered_entries = entries
            .iter()
          .filter(|entry| entry.category_key == category.key && (!active_only || entry.is_active))
          .cloned()
          .collect::<Vec<_>>();
        CompanionContextSection {
          category,
          entries: filtered_entries,
        }
      })
      .collect(),
  )
}

fn companion_context_categories_with_visibility(connection: &Connection) -> Result<Vec<CompanionContextCategory>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        key,
        label,
        description,
        icon,
        display_order,
        is_system,
        is_deleted,
        deleted_at
      FROM companion_context_categories
      ORDER BY display_order ASC, key ASC
    "#,
  )?;
  let rows = statement.query_map([], |row| {
    Ok(CompanionContextCategory {
      key: row.get("key")?,
      label: row.get("label")?,
      description: row.get("description")?,
      icon: row.get("icon")?,
      display_order: row.get("display_order")?,
      is_system: row.get("is_system")?,
      is_deleted: row.get("is_deleted")?,
      deleted_at: row.get("deleted_at")?,
    })
  })?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn get_companion_context_entry_by_id(
  connection: &Connection,
  id: i64,
) -> Result<CompanionContextEntry, AppError> {
  connection.query_row(
    r#"
      SELECT
        id,
        category_key,
        title,
        body,
        tags_json,
        notes,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM companion_context_entries
      WHERE id = ?1
    "#,
    params![id],
    row_to_companion_context_entry,
  ).map_err(AppError::from)
}

pub fn companion_context_snapshot(db_path: &PathBuf) -> Result<CompanionContextSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  Ok(CompanionContextSnapshot {
    categories: build_companion_context_snapshot_with_filter(&connection, false)?,
  })
}

pub fn companion_home_snapshot(db_path: &PathBuf) -> Result<CompanionHomeSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  Ok(CompanionHomeSnapshot {
    categories: build_companion_context_snapshot_with_filter(&connection, true)?,
  })
}

pub fn create_companion_context_entry(
  db_path: &PathBuf,
  payload: &CreateCompanionContextEntryInput,
) -> Result<CompanionContextEntry, AppError> {
  let connection = Connection::open(db_path)?;
  if !is_valid_companion_context_category(&connection, &payload.category_key)? {
    return Err(AppError::Message(format!(
      "Unknown companion context category '{}'.",
      payload.category_key
    )));
  }
  let timestamp = Utc::now().to_rfc3339();
  let display_order = connection.query_row(
    "SELECT COALESCE(MAX(display_order) + 1, 0) FROM companion_context_entries WHERE category_key = ?1",
    params![payload.category_key],
    |row| row.get::<_, i64>(0),
  )?;

  connection.execute(
    r#"
      INSERT INTO companion_context_entries (
        category_key,
        title,
        body,
        tags_json,
        notes,
        display_order,
        is_active,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)
    "#,
    params![
      payload.category_key,
      payload.title.trim(),
      payload.body.trim(),
      serde_json::to_string(&payload.tags)?,
      payload.notes.trim(),
      display_order,
      timestamp,
      timestamp,
    ],
  )?;

  get_companion_context_entry_by_id(&connection, connection.last_insert_rowid())
}

pub fn update_companion_context_entry(
  db_path: &PathBuf,
  payload: &UpdateCompanionContextEntryInput,
) -> Result<CompanionContextEntry, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      UPDATE companion_context_entries
      SET title = ?2,
          body = ?3,
          tags_json = ?4,
          notes = ?5,
          is_active = ?6,
          updated_at = ?7
      WHERE id = ?1
    "#,
    params![
      payload.id,
      payload.title.trim(),
      payload.body.trim(),
      serde_json::to_string(&payload.tags)?,
      payload.notes.trim(),
      payload.is_active,
      Utc::now().to_rfc3339(),
    ],
  )?;
  get_companion_context_entry_by_id(&connection, payload.id)
}

pub fn archive_companion_context_entry(
  db_path: &PathBuf,
  id: i64,
) -> Result<CompanionContextEntry, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      UPDATE companion_context_entries
      SET is_active = 0,
          updated_at = ?2
      WHERE id = ?1
    "#,
    params![id, Utc::now().to_rfc3339()],
  )?;
  get_companion_context_entry_by_id(&connection, id)
}

pub fn reorder_companion_context_entries(
  db_path: &PathBuf,
  payload: &ReorderCompanionContextEntriesInput,
) -> Result<CompanionContextSnapshot, AppError> {
  let mut connection = Connection::open(db_path)?;
  if !is_valid_companion_context_category(&connection, &payload.category_key)? {
    return Err(AppError::Message(format!(
      "Unknown companion context category '{}'.",
      payload.category_key
    )));
  }
  let transaction = connection.transaction()?;
  let updated_at = Utc::now().to_rfc3339();

  for (index, entry_id) in payload.entry_ids.iter().enumerate() {
    transaction.execute(
      r#"
        UPDATE companion_context_entries
        SET display_order = ?3,
            updated_at = ?4
        WHERE id = ?1 AND category_key = ?2
      "#,
      params![entry_id, payload.category_key, index as i64, updated_at],
    )?;
  }

  transaction.commit()?;
  companion_context_snapshot(db_path)
}

pub fn delete_companion_context_category(
  db_path: &PathBuf,
  payload: &DeleteCompanionContextCategoryInput,
) -> Result<CompanionContextSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  if !is_valid_companion_context_category(&connection, &payload.category_key)? {
    return Err(AppError::Message(format!(
      "Unknown companion context category '{}'.",
      payload.category_key
    )));
  }
  let timestamp = Utc::now().to_rfc3339();
  connection.execute(
    r#"
      UPDATE companion_context_categories
      SET is_deleted = 1,
          deleted_at = ?2,
          updated_at = ?2
      WHERE key = ?1
    "#,
    params![payload.category_key, timestamp],
  )?;
  connection.execute(
    r#"
      UPDATE companion_context_entries
      SET is_active = 0,
          deleted_at = ?2,
          updated_at = ?2
      WHERE category_key = ?1
    "#,
    params![payload.category_key, timestamp],
  )?;

  companion_context_snapshot(db_path)
}

pub fn create_companion_context_category(
  db_path: &PathBuf,
  payload: &CreateCompanionContextCategoryInput,
) -> Result<CompanionContextCategory, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();
  let base_key = slugify_companion_context_label(payload.label.trim());
  let icon = if payload.icon.trim().is_empty() {
    "spark"
  } else {
    payload.icon.trim()
  };
  if base_key.is_empty() {
    return Err(AppError::Message("Category label needs at least one letter or number.".into()));
  }

  let mut key = base_key.clone();
  let mut suffix = 2;
  while companion_context_category_exists(&connection, &key)? {
    key = format!("{base_key}_{suffix}");
    suffix += 1;
  }

  let display_order = connection.query_row(
    "SELECT COALESCE(MAX(display_order) + 1, 0) FROM companion_context_categories",
    [],
    |row| row.get::<_, i64>(0),
  )?;

  connection.execute(
    r#"
        INSERT INTO companion_context_categories (
          key,
          label,
          description,
          icon,
          display_order,
          is_system,
          is_deleted,
          deleted_at,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, NULL, ?6, ?7)
      "#,
      params![
        key,
        payload.label.trim(),
        payload.description.trim(),
        icon,
        display_order,
        timestamp,
        timestamp,
    ],
  )?;

  connection.query_row(
    r#"
        SELECT key, label, description, icon, display_order, is_system, is_deleted, deleted_at
        FROM companion_context_categories
        WHERE key = ?1
      "#,
      params![key],
      |row| {
        Ok(CompanionContextCategory {
          key: row.get("key")?,
          label: row.get("label")?,
          description: row.get("description")?,
          icon: row.get("icon")?,
          display_order: row.get("display_order")?,
          is_system: row.get("is_system")?,
          is_deleted: row.get("is_deleted")?,
          deleted_at: row.get("deleted_at")?,
        })
      },
  ).map_err(AppError::from)
}

pub fn update_companion_context_category_icon(
  db_path: &PathBuf,
  payload: &UpdateCompanionContextCategoryIconInput,
) -> Result<CompanionContextCategory, AppError> {
  let connection = Connection::open(db_path)?;
  if !is_valid_companion_context_category(&connection, &payload.category_key)? {
    return Err(AppError::Message(format!(
      "Unknown companion context category '{}'.",
      payload.category_key
    )));
  }

  let icon = if payload.icon.trim().is_empty() {
    "spark"
  } else {
    payload.icon.trim()
  };

  connection.execute(
    r#"
      UPDATE companion_context_categories
      SET icon = ?2,
          updated_at = ?3
      WHERE key = ?1
    "#,
    params![payload.category_key, icon, Utc::now().to_rfc3339()],
  )?;

  connection.query_row(
    r#"
      SELECT key, label, description, icon, display_order, is_system, is_deleted, deleted_at
      FROM companion_context_categories
      WHERE key = ?1
    "#,
    params![payload.category_key],
    |row| {
      Ok(CompanionContextCategory {
        key: row.get("key")?,
        label: row.get("label")?,
        description: row.get("description")?,
        icon: row.get("icon")?,
        display_order: row.get("display_order")?,
        is_system: row.get("is_system")?,
        is_deleted: row.get("is_deleted")?,
        deleted_at: row.get("deleted_at")?,
      })
    },
  ).map_err(AppError::from)
}

#[derive(Debug, Clone)]
struct MemoryCandidate {
  memory_key: String,
  source_ref_id: i64,
  source_category_key: String,
  source_entry_title: String,
  memory_type: String,
  summary: String,
  detail: String,
  tags: Vec<String>,
  confidence: f64,
  salience: f64,
  sensitivity: String,
}

#[derive(Debug, Clone)]
struct DetectorSignal<'a> {
  detector_type: &'a str,
  target_kind: &'a str,
  target_ref_id: Option<i64>,
  target_key: String,
  direction: &'a str,
  strength: f64,
  confidence: f64,
  duration_seconds: i64,
  summary: String,
  evidence_json: String,
}

fn normalize_whitespace(value: &str) -> String {
  value
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string()
}

fn clamp_score(value: f64) -> f64 {
  value.clamp(0.0, 1.0)
}

fn text_has_any_keyword(text: &str, keywords: &[&str]) -> bool {
  let lowered = text.to_ascii_lowercase();
  keywords.iter().any(|keyword| lowered.contains(keyword))
}

fn cleaned_match_tokens(text: &str) -> Vec<String> {
  text
    .to_ascii_lowercase()
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
    .collect::<String>()
    .split_whitespace()
    .filter(|token| token.len() >= 3)
    .map(|token| token.to_string())
    .collect()
}

fn memory_observation_terms(item: &InterpretedMemoryItem) -> Vec<String> {
  let mut terms = Vec::new();
  let title = normalize_whitespace(&item.source_entry_title).to_ascii_lowercase();
  if title.len() >= 3 {
    terms.push(title);
  }
  let title_tokens = cleaned_match_tokens(&item.source_entry_title);
  for token in &title_tokens {
    if !terms.iter().any(|term| term == token) {
      terms.push(token.clone());
    }
  }
  for window in title_tokens.windows(2) {
    let phrase = window.join(" ");
    if phrase.len() >= 3 && !terms.iter().any(|term| term == &phrase) {
      terms.push(phrase);
    }
  }
  for tag in &item.tags {
    let normalized = normalize_whitespace(tag).to_ascii_lowercase();
    if normalized.len() >= 3 && !terms.iter().any(|term| term == &normalized) {
      terms.push(normalized);
    }
  }
  terms
}

fn text_mentions_memory(text: &str, item: &InterpretedMemoryItem) -> bool {
  let lowered = text.to_ascii_lowercase();
  memory_observation_terms(item)
    .into_iter()
    .any(|term| lowered.contains(&term))
}

fn text_signals_memory_challenge(text: &str) -> bool {
  text_has_any_keyword(
    text,
    &[
      "not anymore",
      "no longer",
      "used to",
      "don't",
      "doesn't",
      "never",
      "stopped",
      "quit",
      "avoid",
      "hard to",
      "can't stand",
      "cannot stand",
      "less now",
      "pulling away",
    ],
  )
}

fn text_signals_memory_support(text: &str) -> bool {
  text_has_any_keyword(
    text,
    &[
      "still",
      "always",
      "again",
      "love",
      "care about",
      "important",
      "steady",
      "grounded",
      "helps",
      "matters",
      "keeps",
      "return to",
    ],
  )
}

fn review_sentiment_signals_support(sentiment: &str) -> bool {
  text_has_any_keyword(
    sentiment,
    &["warm", "good", "positive", "supportive", "gentle", "grounded", "helpful", "close"],
  )
}

fn review_sentiment_signals_challenge(sentiment: &str) -> bool {
  text_has_any_keyword(
    sentiment,
    &["hard", "bad", "negative", "cold", "distant", "tense", "awkward", "painful", "off"],
  )
}

fn category_primary_memory_type(category_key: &str) -> &'static str {
  match category_key {
    "friends" | "family" | "pet" => "relational_memory",
    "life_principles" | "goals" => "value_memory",
    "favorite_food" | "music" => "preference_memory",
    "career" | "hobbies" => "behavioral_memory",
    "favorite_places" | "home_location" => "factual_memory",
    _ => "factual_memory",
  }
}

fn category_secondary_memory_type(category_key: &str) -> Option<&'static str> {
  match category_key {
    "friends" | "family" | "pet" => Some("emotional_meaning_memory"),
    "career" | "hobbies" | "music" => Some("identity_memory"),
    "favorite_places" | "home_location" => Some("emotional_meaning_memory"),
    "goals" => Some("temporal_phase_memory"),
    _ => None,
  }
}

fn candidate_summary_for_memory_type(memory_type: &str, title: &str, body: &str) -> String {
  let body = normalize_whitespace(body);
  let title = normalize_whitespace(title);
  match memory_type {
    "relational_memory" => format!("{title} is someone the user chose to place in living context. {body}"),
    "value_memory" => format!("{title} reflects something the user is actively reaching toward or trying to live by. {body}"),
    "preference_memory" => format!("{title} appears as a declared affinity or source of comfort. {body}"),
    "behavioral_memory" => format!("{title} is part of how the user tends to spend time, effort, or attention. {body}"),
    "emotional_meaning_memory" => format!("{title} carries stated meaning in the user's life. {body}"),
    "temporal_phase_memory" => format!("{title} points to a current phase or directional movement. {body}"),
    "identity_memory" => format!("{title} looks identity-relevant because the user chose it as self-description. {body}"),
    _ => format!("{title}: {body}"),
  }
}

fn candidate_detail(entry: &CompanionContextEntry) -> String {
  let body = normalize_whitespace(&entry.body);
  let notes = normalize_whitespace(&entry.notes);
  if notes.is_empty() {
    body
  } else {
    format!("{body} Notes: {notes}")
  }
}

fn find_companion_context_entry_by_category_and_title(
  connection: &Connection,
  category_key: &str,
  title: &str,
) -> Result<Option<CompanionContextEntry>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        category_key,
        title,
        body,
        tags_json,
        notes,
        display_order,
        is_active,
        deleted_at,
        created_at,
        updated_at
      FROM companion_context_entries
      WHERE category_key = ?1 AND title = ?2
      ORDER BY id DESC
      LIMIT 1
    "#,
  )?;

  statement
    .query_row(params![category_key, title], row_to_companion_context_entry)
    .optional()
    .map_err(AppError::from)
}

fn entry_sensitivity(entry: &CompanionContextEntry, memory_type: &str) -> String {
  let joined = format!(
    "{} {} {} {}",
    entry.title,
    entry.body,
    entry.notes,
    entry.tags.join(" ")
  );
  if text_has_any_keyword(
    &joined,
    &[
      "private",
      "sensitive",
      "protect",
      "boundary",
      "medical",
      "trauma",
      "grief",
      "pain",
    ],
  ) || memory_type == "sensitive_memory"
  {
    "high".into()
  } else if text_has_any_keyword(&joined, &["family", "home", "relationship"]) {
    "guarded".into()
  } else {
    "normal".into()
  }
}

fn build_memory_candidates(entry: &CompanionContextEntry) -> Vec<MemoryCandidate> {
  let primary_type = category_primary_memory_type(&entry.category_key);
  let mut memory_types = vec![primary_type.to_string()];
  if let Some(secondary) = category_secondary_memory_type(&entry.category_key) {
    memory_types.push(secondary.to_string());
  }

  let detail = candidate_detail(entry);
  let base_text = format!("{} {} {}", entry.title, entry.body, entry.notes);
  let is_sensitive = text_has_any_keyword(
    &base_text,
    &["private", "sensitive", "boundary", "medical", "trauma", "grief"],
  );

  memory_types
    .into_iter()
    .enumerate()
    .map(|(index, memory_type)| {
      let confidence = if index == 0 { 0.84 } else { 0.72 };
      let salience_boost = (entry.tags.len() as f64 * 0.04) + if !entry.notes.trim().is_empty() { 0.08 } else { 0.0 };
      let sensitivity = if is_sensitive && index > 0 {
        "high".into()
      } else {
        entry_sensitivity(entry, &memory_type)
      };
      MemoryCandidate {
        memory_key: format!("context-entry-{}-{}", entry.id, memory_type),
        source_ref_id: entry.id,
        source_category_key: entry.category_key.clone(),
        source_entry_title: entry.title.clone(),
        memory_type: memory_type.clone(),
        summary: candidate_summary_for_memory_type(&memory_type, &entry.title, &entry.body),
        detail: detail.clone(),
        tags: entry.tags.clone(),
        confidence,
        salience: clamp_score(0.58 + salience_boost + if index == 0 { 0.08 } else { 0.0 }),
        sensitivity,
      }
    })
    .collect()
}

fn row_to_interpreted_memory_item(row: &rusqlite::Row<'_>) -> Result<InterpretedMemoryItem, rusqlite::Error> {
  let tags_json: String = row.get("tags_json")?;
  Ok(InterpretedMemoryItem {
    id: row.get("id")?,
    memory_key: row.get("memory_key")?,
    source_kind: row.get("source_kind")?,
    source_ref_id: row.get("source_ref_id")?,
    source_category_key: row.get("source_category_key")?,
    source_entry_title: row.get("source_entry_title")?,
    memory_type: row.get("memory_type")?,
    summary: row.get("summary")?,
    detail: row.get("detail")?,
    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
    confidence: row.get("confidence")?,
    salience: row.get("salience")?,
    sensitivity: row.get("sensitivity")?,
    declared_by_user: row.get("declared_by_user")?,
    status: row.get("status")?,
    created_at: row.get("created_at")?,
    updated_at: row.get("updated_at")?,
    interpreted_at: row.get("interpreted_at")?,
    last_observed_at: row.get("last_observed_at")?,
    archived_at: row.get("archived_at")?,
  })
}

fn row_to_detector_record(row: &rusqlite::Row<'_>) -> Result<DetectorRecord, rusqlite::Error> {
  Ok(DetectorRecord {
    id: row.get("id")?,
    detector_key: row.get("detector_key")?,
    detector_type: row.get("detector_type")?,
    target_kind: row.get("target_kind")?,
    target_ref_id: row.get("target_ref_id")?,
    target_key: row.get("target_key")?,
    direction: row.get("direction")?,
    strength: row.get("strength")?,
    confidence: row.get("confidence")?,
    duration_seconds: row.get("duration_seconds")?,
    repeat_count: row.get("repeat_count")?,
    summary: row.get("summary")?,
    evidence_json: row.get("evidence_json")?,
    created_at: row.get("created_at")?,
    last_seen_at: row.get("last_seen_at")?,
  })
}

fn row_to_memory_evolution_state(row: &rusqlite::Row<'_>) -> Result<MemoryEvolutionState, rusqlite::Error> {
  Ok(MemoryEvolutionState {
    id: row.get("id")?,
    memory_item_id: row.get("memory_item_id")?,
    declared_confidence: row.get("declared_confidence")?,
    observed_confidence: row.get("observed_confidence")?,
    detector_balance: row.get("detector_balance")?,
    observed_support_score: row.get("observed_support_score")?,
    observed_challenge_score: row.get("observed_challenge_score")?,
    divergence_score: row.get("divergence_score")?,
    cumulative_support_score: row.get("cumulative_support_score")?,
    cumulative_challenge_score: row.get("cumulative_challenge_score")?,
    cumulative_divergence_score: row.get("cumulative_divergence_score")?,
    support_source_count: row.get("support_source_count")?,
    challenge_source_count: row.get("challenge_source_count")?,
    source_coherence_score: row.get("source_coherence_score")?,
    sustained_divergence_score: row.get("sustained_divergence_score")?,
    phase_shift_score: row.get("phase_shift_score")?,
    phase_shift_state: row.get("phase_shift_state")?,
    truth_alignment: row.get("truth_alignment")?,
    current_status: row.get("current_status")?,
    reinforcement_score: row.get("reinforcement_score")?,
    drift_score: row.get("drift_score")?,
    tension_score: row.get("tension_score")?,
    volatility_score: row.get("volatility_score")?,
    emergence_score: row.get("emergence_score")?,
    protection_score: row.get("protection_score")?,
    declared_truth_summary: row.get("declared_truth_summary")?,
    observed_truth_summary: row.get("observed_truth_summary")?,
    observed_evidence_summary: row.get("observed_evidence_summary")?,
    phase_shift_summary: row.get("phase_shift_summary")?,
    alignment_summary: row.get("alignment_summary")?,
    last_evolved_at: row.get("last_evolved_at")?,
    last_confirmed_at: row.get("last_confirmed_at")?,
  })
}

fn row_to_tectonic_timeline_snapshot(row: &rusqlite::Row<'_>) -> Result<TectonicTimelineSnapshot, rusqlite::Error> {
  Ok(TectonicTimelineSnapshot {
    id: row.get("id")?,
    snapshot_kind: row.get("snapshot_kind")?,
    recorded_at: row.get("recorded_at")?,
    window_start: row.get("window_start")?,
    window_end: row.get("window_end")?,
    total_detector_activity: row.get("total_detector_activity")?,
    active_memory_count: row.get("active_memory_count")?,
    summary_json: row.get("summary_json")?,
  })
}

#[derive(Debug, Clone)]
struct StoredNorthStarCallReview {
  id: i64,
  review_id: String,
  call_id: String,
  user_handle: String,
  sentiment: String,
  notes: String,
  created_at: String,
  imported_at: String,
}

#[derive(Debug, Clone)]
struct MemoryEvolutionHistoryPoint {
  divergence_score: f64,
  source_coherence_score: f64,
  observed_confidence: f64,
}

fn row_to_stored_north_star_call_review(
  row: &rusqlite::Row<'_>,
) -> Result<StoredNorthStarCallReview, rusqlite::Error> {
  Ok(StoredNorthStarCallReview {
    id: row.get("id")?,
    review_id: row.get("review_id")?,
    call_id: row.get("call_id")?,
    user_handle: row.get("user_handle")?,
    sentiment: row.get("sentiment")?,
    notes: row.get("notes")?,
    created_at: row.get("created_at")?,
    imported_at: row.get("imported_at")?,
  })
}

fn list_interpreted_memory_items(connection: &Connection) -> Result<Vec<InterpretedMemoryItem>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        memory_key,
        source_kind,
        source_ref_id,
        source_category_key,
        source_entry_title,
        memory_type,
        summary,
        detail,
        tags_json,
        confidence,
        salience,
        sensitivity,
        declared_by_user,
        status,
        created_at,
        updated_at,
        interpreted_at,
        last_observed_at,
        archived_at
      FROM companion_memory_items
      ORDER BY
        CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END,
        salience DESC,
        updated_at DESC,
        id DESC
    "#,
  )?;
  let rows = statement.query_map([], row_to_interpreted_memory_item)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_detector_records(connection: &Connection) -> Result<Vec<DetectorRecord>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        detector_key,
        detector_type,
        target_kind,
        target_ref_id,
        target_key,
        direction,
        strength,
        confidence,
        duration_seconds,
        repeat_count,
        summary,
        evidence_json,
        created_at,
        last_seen_at
      FROM memory_detector_records
      ORDER BY last_seen_at DESC, strength DESC, id DESC
    "#,
  )?;
  let rows = statement.query_map([], row_to_detector_record)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_memory_evolution_states(connection: &Connection) -> Result<Vec<MemoryEvolutionState>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        memory_item_id,
        declared_confidence,
        observed_confidence,
        detector_balance,
        observed_support_score,
        observed_challenge_score,
        divergence_score,
        cumulative_support_score,
        cumulative_challenge_score,
        cumulative_divergence_score,
        support_source_count,
        challenge_source_count,
        source_coherence_score,
        sustained_divergence_score,
        phase_shift_score,
        phase_shift_state,
        truth_alignment,
        current_status,
        reinforcement_score,
        drift_score,
        tension_score,
        volatility_score,
        emergence_score,
        protection_score,
        declared_truth_summary,
        observed_truth_summary,
        observed_evidence_summary,
        phase_shift_summary,
        alignment_summary,
        last_evolved_at,
        last_confirmed_at
      FROM memory_evolution_state
      ORDER BY last_evolved_at DESC, id DESC
    "#,
  )?;
  let rows = statement.query_map([], row_to_memory_evolution_state)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_tectonic_timeline_snapshots(connection: &Connection, limit: usize) -> Result<Vec<TectonicTimelineSnapshot>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        snapshot_kind,
        recorded_at,
        window_start,
        window_end,
        total_detector_activity,
        active_memory_count,
        summary_json
      FROM tectonic_timeline_snapshots
      ORDER BY recorded_at DESC, id DESC
      LIMIT ?1
    "#,
  )?;
  let rows = statement.query_map(params![limit as i64], row_to_tectonic_timeline_snapshot)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_north_star_call_reviews(connection: &Connection) -> Result<Vec<StoredNorthStarCallReview>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        review_id,
        call_id,
        user_handle,
        sentiment,
        notes,
        created_at,
        imported_at
      FROM north_star_call_reviews
      ORDER BY created_at DESC, id DESC
    "#,
  )?;
  let rows = statement.query_map([], row_to_stored_north_star_call_review)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn upsert_north_star_call_review(
  connection: &Connection,
  review: &NorthStarCallReview,
  imported_at: &str,
) -> Result<bool, AppError> {
  let existing_id = connection
    .query_row(
      "SELECT id FROM north_star_call_reviews WHERE review_id = ?1",
      params![review.review_id],
      |row| row.get::<_, i64>(0),
    )
    .optional()?;

  if let Some(id) = existing_id {
    connection.execute(
      r#"
        UPDATE north_star_call_reviews
        SET
          call_id = ?2,
          user_handle = ?3,
          sentiment = ?4,
          notes = ?5,
          created_at = ?6,
          imported_at = ?7
        WHERE id = ?1
      "#,
      params![
        id,
        review.call_id,
        review.user_handle,
        review.sentiment,
        review.notes,
        review.created_at,
        imported_at,
      ],
    )?;
    Ok(false)
  } else {
    connection.execute(
      r#"
        INSERT INTO north_star_call_reviews (
          review_id,
          call_id,
          user_handle,
          sentiment,
          notes,
          created_at,
          imported_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      "#,
      params![
        review.review_id,
        review.call_id,
        review.user_handle,
        review.sentiment,
        review.notes,
        review.created_at,
        imported_at,
      ],
    )?;
    Ok(true)
  }
}

fn build_count_breakdown(values: Vec<String>) -> Vec<MemorySystemCount> {
  let mut counts: HashMap<String, usize> = HashMap::new();
  for value in values {
    *counts.entry(value).or_insert(0) += 1;
  }
  let mut items = counts
    .into_iter()
    .map(|(key, count)| MemorySystemCount { key, count })
    .collect::<Vec<_>>();
  items.sort_by(|left, right| right.count.cmp(&left.count).then_with(|| left.key.cmp(&right.key)));
  items
}

fn tectonic_region_seed(target_kind: &str, index: usize) -> (f64, f64, f64) {
  match target_kind {
    "interaction_field" => (-26.0, -124.0, 138.0),
    "interaction_boundary" => (28.0, -108.0, 126.0),
    "conversation_theme" => (6.0, -42.0, 132.0),
    "outreach_path" => (42.0, 28.0, 124.0),
    "memory_item" => (-36.0, 18.0, 142.0),
    "category" => (18.0, 72.0, 116.0),
    _ => (-32.0 + (index as f64 * 24.0), -120.0 + (index as f64 * 36.0), 128.0),
  }
}

fn latest_tectonic_region_state(connection: &Connection) -> Result<HashMap<String, (i64, f64)>, AppError> {
  let previous_summary = connection
    .query_row(
      "SELECT summary_json FROM tectonic_timeline_snapshots ORDER BY recorded_at DESC, id DESC LIMIT 1",
      [],
      |row| row.get::<_, String>(0),
    )
    .optional()?;

  let mut state = HashMap::new();
  if let Some(summary_json) = previous_summary {
    let parsed = serde_json::from_str::<serde_json::Value>(&summary_json).unwrap_or_else(|_| json!({}));
    if let Some(regions) = parsed.get("regionContinuity").and_then(|value| value.as_array()) {
      for region in regions {
        if let Some(region_id) = region.get("regionId").and_then(|value| value.as_str()) {
          let persistence_frames = region
            .get("persistenceFrames")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
          let activity = region
            .get("activity")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
          state.insert(region_id.to_string(), (persistence_frames, activity));
        }
      }
    }
  }

  Ok(state)
}

fn build_tectonic_region_continuity(
  connection: &Connection,
  detector_records: &[DetectorRecord],
  evolution_states: &[MemoryEvolutionState],
) -> Result<Vec<serde_json::Value>, AppError> {
  let previous_state = latest_tectonic_region_state(connection)?;
  let mut grouped: HashMap<String, Vec<&DetectorRecord>> = HashMap::new();
  for record in detector_records {
    grouped.entry(record.target_kind.clone()).or_default().push(record);
  }

  let mut target_kinds = grouped.keys().cloned().collect::<Vec<_>>();
  target_kinds.sort();

  let mut regions = Vec::new();
  for (index, target_kind) in target_kinds.into_iter().enumerate() {
    let Some(records) = grouped.get(&target_kind) else {
      continue;
    };

    let region_id = format!("region:{target_kind}");
    let detector_activity = records.iter().map(|record| record.strength).sum::<f64>();
    let detector_count = records.len();
    let divergence_pressure = if target_kind == "memory_item" {
      evolution_states
        .iter()
        .map(|state| state.cumulative_divergence_score + (state.source_coherence_score * 0.45))
        .sum::<f64>()
    } else {
      0.0
    };
    let activity = detector_activity + (divergence_pressure * 0.35);

    let direction_counts = build_count_breakdown(records.iter().map(|record| record.direction.clone()).collect());
    let dominant_direction = direction_counts
      .first()
      .map(|item| item.key.clone())
      .unwrap_or_else(|| "steadying".to_string());

    let detector_types = build_count_breakdown(records.iter().map(|record| record.detector_type.clone()).collect());
    let dominant_detector_type = detector_types
      .first()
      .map(|item| item.key.clone())
      .unwrap_or_else(|| "quiet".to_string());

    let (previous_frames, previous_activity) = previous_state.get(&region_id).copied().unwrap_or((0, 0.0));
    let persistence_frames = previous_frames + 1;
    let activity_delta = activity - previous_activity;
    let (center_latitude, longitude_start, longitude_end) = tectonic_region_seed(&target_kind, index);

    regions.push(json!({
      "regionId": region_id,
      "targetKind": target_kind,
      "dominantDirection": dominant_direction,
      "dominantDetectorType": dominant_detector_type,
      "activity": activity,
      "activityDelta": activity_delta,
      "divergencePressure": divergence_pressure,
      "detectorCount": detector_count,
      "persistenceFrames": persistence_frames,
      "centerLatitude": center_latitude,
      "longitudeStart": longitude_start,
      "longitudeEnd": longitude_end,
    }));
  }

  regions.sort_by(|left, right| {
    let right_activity = right.get("activity").and_then(|value| value.as_f64()).unwrap_or(0.0);
    let left_activity = left.get("activity").and_then(|value| value.as_f64()).unwrap_or(0.0);
    right_activity
      .partial_cmp(&left_activity)
      .unwrap_or(std::cmp::Ordering::Equal)
  });
  Ok(regions)
}

fn build_memory_system_snapshot(connection: &Connection) -> Result<MemorySystemSnapshot, AppError> {
  let memory_items = list_interpreted_memory_items(connection)?;
  let detector_records = list_detector_records(connection)?;
  let evolution_states = list_memory_evolution_states(connection)?;
  let mut tectonic_timeline = list_tectonic_timeline_snapshots(connection, 168)?;
  tectonic_timeline.reverse();

  let total_memory_count = memory_items.len();
  let active_memory_count = memory_items.iter().filter(|item| item.archived_at.is_none()).count();
  let historical_memory_count = memory_items.iter().filter(|item| item.archived_at.is_some()).count();
  let detector_count = detector_records.len();
  let tectonic_snapshot_count = tectonic_timeline.len();
  let last_pass_at = tectonic_timeline.last().map(|snapshot| snapshot.recorded_at.clone());

  Ok(MemorySystemSnapshot {
    overview: MemorySystemOverview {
      total_memory_count,
      active_memory_count,
      historical_memory_count,
      detector_count,
      tectonic_snapshot_count,
      last_pass_at,
      memory_type_breakdown: build_count_breakdown(memory_items.iter().map(|item| item.memory_type.clone()).collect()),
      detector_type_breakdown: build_count_breakdown(detector_records.iter().map(|item| item.detector_type.clone()).collect()),
      evolution_status_breakdown: build_count_breakdown(evolution_states.iter().map(|item| item.current_status.clone()).collect()),
    },
    memory_items,
    detector_records,
    evolution_states,
    tectonic_timeline,
  })
}

fn detector_signal_key(signal: &DetectorSignal<'_>) -> String {
  format!("{}:{}:{}", signal.detector_type, signal.target_kind, signal.target_key)
}

fn upsert_detector_signal(connection: &Connection, signal: &DetectorSignal<'_>, now: &str) -> Result<(), AppError> {
  let detector_key = detector_signal_key(signal);
  let existing = connection
    .query_row(
      r#"
        SELECT id, repeat_count
        FROM memory_detector_records
        WHERE detector_key = ?1
      "#,
      params![detector_key],
      |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )
    .optional()?;

  if let Some((id, repeat_count)) = existing {
    connection.execute(
      r#"
        UPDATE memory_detector_records
        SET
          target_ref_id = ?2,
          direction = ?3,
          strength = ?4,
          confidence = ?5,
          duration_seconds = ?6,
          repeat_count = ?7,
          summary = ?8,
          evidence_json = ?9,
          last_seen_at = ?10
        WHERE id = ?1
      "#,
      params![
        id,
        signal.target_ref_id,
        signal.direction,
        signal.strength,
        signal.confidence,
        signal.duration_seconds,
        repeat_count + 1,
        signal.summary,
        signal.evidence_json,
        now,
      ],
    )?;
  } else {
    connection.execute(
      r#"
        INSERT INTO memory_detector_records (
          detector_key,
          detector_type,
          target_kind,
          target_ref_id,
          target_key,
          direction,
          strength,
          confidence,
          duration_seconds,
          repeat_count,
          summary,
          evidence_json,
          created_at,
          last_seen_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11, ?12, ?12)
      "#,
      params![
        detector_key,
        signal.detector_type,
        signal.target_kind,
        signal.target_ref_id,
        signal.target_key,
        signal.direction,
        signal.strength,
        signal.confidence,
        signal.duration_seconds,
        signal.summary,
        signal.evidence_json,
        now,
      ],
    )?;
  }

  Ok(())
}

fn upsert_memory_candidate(
  connection: &Connection,
  candidate: &MemoryCandidate,
  now: &str,
) -> Result<(i64, bool, bool), AppError> {
  let tags_json = serde_json::to_string(&candidate.tags)?;
  let existing = connection
    .query_row(
      r#"
        SELECT id, summary, detail, archived_at
        FROM companion_memory_items
        WHERE memory_key = ?1
      "#,
      params![candidate.memory_key],
      |row| {
        Ok((
          row.get::<_, i64>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, Option<String>>(3)?,
        ))
      },
    )
    .optional()?;

  if let Some((id, previous_summary, previous_detail, archived_at)) = existing {
    let changed = previous_summary != candidate.summary || previous_detail != candidate.detail;
    connection.execute(
      r#"
        UPDATE companion_memory_items
        SET
          source_ref_id = ?2,
          source_category_key = ?3,
          source_entry_title = ?4,
          memory_type = ?5,
          summary = ?6,
          detail = ?7,
          tags_json = ?8,
          confidence = ?9,
          salience = ?10,
          sensitivity = ?11,
          declared_by_user = 1,
          updated_at = ?12,
          interpreted_at = ?12,
          last_observed_at = ?12,
          archived_at = NULL
        WHERE id = ?1
      "#,
      params![
        id,
        candidate.source_ref_id,
        candidate.source_category_key,
        candidate.source_entry_title,
        candidate.memory_type,
        candidate.summary,
        candidate.detail,
        tags_json,
        candidate.confidence,
        candidate.salience,
        candidate.sensitivity,
        now,
      ],
    )?;
    Ok((id, false, changed || archived_at.is_some()))
  } else {
    connection.execute(
      r#"
        INSERT INTO companion_memory_items (
          memory_key,
          source_kind,
          source_ref_id,
          source_category_key,
          source_entry_title,
          memory_type,
          summary,
          detail,
          tags_json,
          confidence,
          salience,
          sensitivity,
          declared_by_user,
          status,
          created_at,
          updated_at,
          interpreted_at,
          last_observed_at,
          archived_at
        ) VALUES (?1, 'manual_context_entry', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, 'active', ?12, ?12, ?12, ?12, NULL)
      "#,
      params![
        candidate.memory_key,
        candidate.source_ref_id,
        candidate.source_category_key,
        candidate.source_entry_title,
        candidate.memory_type,
        candidate.summary,
        candidate.detail,
        tags_json,
        candidate.confidence,
        candidate.salience,
        candidate.sensitivity,
        now,
      ],
    )?;
    Ok((connection.last_insert_rowid(), true, false))
  }
}

fn detector_score_for(
  connection: &Connection,
  target_key: &str,
  detector_type: &str,
  window_start: &str,
) -> Result<f64, AppError> {
  let score = connection.query_row(
    r#"
      SELECT COALESCE(MAX(strength), 0.0)
      FROM memory_detector_records
      WHERE target_key = ?1
        AND detector_type = ?2
        AND last_seen_at >= ?3
    "#,
    params![target_key, detector_type, window_start],
    |row| row.get::<_, f64>(0),
  )?;
  Ok(score)
}

fn detector_records_for_target(
  connection: &Connection,
  target_key: &str,
  window_start: &str,
) -> Result<Vec<DetectorRecord>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id,
        detector_key,
        detector_type,
        target_kind,
        target_ref_id,
        target_key,
        direction,
        strength,
        confidence,
        duration_seconds,
        repeat_count,
        summary,
        evidence_json,
        created_at,
        last_seen_at
      FROM memory_detector_records
      WHERE target_key = ?1
        AND last_seen_at >= ?2
      ORDER BY last_seen_at DESC, id DESC
    "#,
  )?;
  let rows = statement.query_map(params![target_key, window_start], row_to_detector_record)?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn detector_source_family(record: &DetectorRecord) -> String {
  let parsed = serde_json::from_str::<serde_json::Value>(&record.evidence_json).unwrap_or_else(|_| json!({}));
  let source = parsed
    .get("source")
    .and_then(|value| value.as_str())
    .unwrap_or_default();

  if source.contains("north_star_call_review") {
    "call_review".into()
  } else if source.contains("call_session") {
    "call".into()
  } else if source.contains("outreach_feedback") {
    "feedback".into()
  } else if source.contains("manual_context") || source.contains("sourceEntryId") {
    "manual_context".into()
  } else {
    record.target_kind.clone()
  }
}

fn build_observed_evidence_profile(
  connection: &Connection,
  target_key: &str,
  window_start: &str,
) -> Result<(i64, i64, f64, String), AppError> {
  let records = detector_records_for_target(connection, target_key, window_start)?;
  let mut support_sources = HashSet::new();
  let mut challenge_sources = HashSet::new();
  let mut support_hits = 0usize;
  let mut challenge_hits = 0usize;

  for record in &records {
    let family = detector_source_family(record);
    match record.detector_type.as_str() {
      "reinforcement" | "emergence" | "protection" => {
        support_sources.insert(family);
        support_hits += 1;
      }
      "drift" | "tension" | "volatility" => {
        challenge_sources.insert(family);
        challenge_hits += 1;
      }
      _ => {}
    }
  }

  let support_source_count = support_sources.len() as i64;
  let challenge_source_count = challenge_sources.len() as i64;
  let source_coherence_score = clamp_score(
    ((support_source_count.max(challenge_source_count) as f64) * 0.22)
      + ((support_hits.max(challenge_hits) as f64) * 0.04),
  );

  let mut summary_parts = Vec::new();
  if support_source_count > 0 {
    let mut sources = support_sources.into_iter().collect::<Vec<_>>();
    sources.sort();
    summary_parts.push(format!("support seen across {}", sources.join(", ")));
  }
  if challenge_source_count > 0 {
    let mut sources = challenge_sources.into_iter().collect::<Vec<_>>();
    sources.sort();
    summary_parts.push(format!("challenge seen across {}", sources.join(", ")));
  }
  let observed_evidence_summary = if summary_parts.is_empty() {
    "No recent lived evidence sources are attached to this memory yet.".to_string()
  } else {
    format!("Recent observed-truth pressure: {}.", summary_parts.join(" while "))
  };

  Ok((
    support_source_count,
    challenge_source_count,
    source_coherence_score,
    observed_evidence_summary,
  ))
}

fn recent_memory_evolution_history(
  connection: &Connection,
  memory_item_id: i64,
  limit: usize,
) -> Result<Vec<MemoryEvolutionHistoryPoint>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        divergence_score,
        source_coherence_score,
        observed_confidence
      FROM memory_evolution_history
      WHERE memory_item_id = ?1
      ORDER BY evolved_at DESC, id DESC
      LIMIT ?2
    "#,
  )?;
  let rows = statement.query_map(params![memory_item_id, limit as i64], |row| {
    Ok(MemoryEvolutionHistoryPoint {
      divergence_score: row.get(0)?,
      source_coherence_score: row.get(1)?,
      observed_confidence: row.get(2)?,
    })
  })?;
  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn phase_shift_profile(
  connection: &Connection,
  item: &InterpretedMemoryItem,
  divergence_score: f64,
  source_coherence_score: f64,
  observed_confidence: f64,
) -> Result<(f64, f64, String, String), AppError> {
  let mut history = recent_memory_evolution_history(connection, item.id, 6)?;
  history.insert(
    0,
    MemoryEvolutionHistoryPoint {
      divergence_score,
      source_coherence_score,
      observed_confidence,
    },
  );

  let sustained_divergence_score = if history.is_empty() {
    0.0
  } else {
    history
      .iter()
      .map(|point| point.divergence_score)
      .sum::<f64>()
      / history.len() as f64
  };
  let coherence_average = if history.is_empty() {
    0.0
  } else {
    history
      .iter()
      .map(|point| point.source_coherence_score)
      .sum::<f64>()
      / history.len() as f64
  };
  let confidence_slope = if history.len() >= 2 {
    (history[0].observed_confidence - history[history.len() - 1].observed_confidence).abs()
  } else {
    0.0
  };
  let phase_shift_score = clamp_score(
    (sustained_divergence_score * 0.58) + (coherence_average * 0.27) + (confidence_slope * 0.42),
  );
  let phase_shift_state = if item.archived_at.is_some() {
    "historical"
  } else if phase_shift_score >= 0.72 {
    "sustained_shift"
  } else if phase_shift_score >= 0.42 {
    "shifting"
  } else {
    "stable"
  }
  .to_string();

  let phase_shift_summary = match phase_shift_state.as_str() {
    "historical" => "This memory now belongs to an earlier phase and is being held historically.".to_string(),
    "sustained_shift" => "This no longer looks like a brief wobble. The observed pattern is holding as a real phase shift.".to_string(),
    "shifting" => "This memory is showing movement across multiple passes and may be entering a new phase.".to_string(),
    _ => "This still reads as a local fluctuation more than a sustained phase change.".to_string(),
  };

  Ok((
    sustained_divergence_score,
    phase_shift_score,
    phase_shift_state,
    phase_shift_summary,
  ))
}

fn evolve_memory_item(
  connection: &Connection,
  item: &InterpretedMemoryItem,
  now: &str,
  window_start: &str,
) -> Result<(), AppError> {
  let reinforcement_score = detector_score_for(connection, &item.memory_key, "reinforcement", window_start)?;
  let drift_score = detector_score_for(connection, &item.memory_key, "drift", window_start)?;
  let tension_score = detector_score_for(connection, &item.memory_key, "tension", window_start)?;
  let volatility_score = detector_score_for(connection, &item.memory_key, "volatility", window_start)?;
  let emergence_score = detector_score_for(connection, &item.memory_key, "emergence", window_start)?;
  let protection_score = detector_score_for(connection, &item.memory_key, "protection", window_start)?;

  let detector_balance =
    reinforcement_score + emergence_score + protection_score - drift_score - tension_score - volatility_score;
  let observed_support_score =
    clamp_score(reinforcement_score + (emergence_score * 0.72) + (protection_score * 0.48));
  let observed_challenge_score =
    clamp_score(drift_score + (tension_score * 0.95) + (volatility_score * 0.82));
  let observed_confidence = clamp_score(
    item.confidence
      + (reinforcement_score * 0.09)
      + (emergence_score * 0.04)
      + (protection_score * 0.02)
      - (drift_score * 0.12)
      - (tension_score * 0.10)
      - (volatility_score * 0.08),
  );
  let divergence_score = clamp_score(
    ((item.confidence - observed_confidence).abs() * 1.35)
      + ((observed_challenge_score - (observed_support_score * 0.55)).max(0.0) * 0.85),
  );
  let (
    support_source_count,
    challenge_source_count,
    source_coherence_score,
    observed_evidence_summary,
  ) = build_observed_evidence_profile(connection, &item.memory_key, window_start)?;
  let (
    sustained_divergence_score,
    phase_shift_score,
    phase_shift_state,
    phase_shift_summary,
  ) = phase_shift_profile(connection, item, divergence_score, source_coherence_score, observed_confidence)?;
  let previous_cumulative = connection
    .query_row(
      r#"
        SELECT cumulative_support_score, cumulative_challenge_score, cumulative_divergence_score
        FROM memory_evolution_state
        WHERE memory_item_id = ?1
      "#,
      params![item.id],
      |row| {
        Ok((
          row.get::<_, f64>(0)?,
          row.get::<_, f64>(1)?,
          row.get::<_, f64>(2)?,
        ))
      },
    )
    .optional()?
    .unwrap_or((0.0, 0.0, 0.0));
  let cumulative_support_score =
    clamp_score((previous_cumulative.0 * 0.72) + (observed_support_score * 0.78));
  let cumulative_challenge_score =
    clamp_score((previous_cumulative.1 * 0.72) + (observed_challenge_score * 0.82));
  let cumulative_divergence_score =
    clamp_score((previous_cumulative.2 * 0.76) + (divergence_score * 0.88));
  let truth_alignment = if item.archived_at.is_some() {
    "historical"
  } else if protection_score >= 0.75 {
    "guarded"
  } else if cumulative_divergence_score >= 0.74
    || divergence_score >= 0.72
    || (challenge_source_count >= 2 && source_coherence_score >= 0.44 && cumulative_challenge_score >= 0.62)
    || (drift_score >= 0.76 && observed_challenge_score >= (observed_support_score * 0.85))
    || (cumulative_challenge_score >= 0.76 && cumulative_support_score < 0.56)
    || (observed_challenge_score >= 0.72 && observed_support_score < 0.52)
  {
    "diverging"
  } else if cumulative_divergence_score >= 0.42
    || divergence_score >= 0.42
    || (challenge_source_count >= 2 && source_coherence_score >= 0.28)
    || cumulative_challenge_score >= 0.55
    || observed_challenge_score >= 0.55
  {
    "watching"
  } else {
    "aligned"
  };

  let current_status = if item.archived_at.is_some() {
    "historical"
  } else if item.sensitivity == "high" && truth_alignment == "diverging" {
    "awaiting_confirmation"
  } else if protection_score >= 0.75 {
    "protected"
  } else if volatility_score >= 0.70 {
    "volatile"
  } else if tension_score >= 0.68 {
    "conflicted"
  } else if drift_score >= 0.64 && reinforcement_score < 0.55 {
    "drifting"
  } else if emergence_score >= 0.68 && reinforcement_score < 0.60 {
    "emerging"
  } else if reinforcement_score >= 0.78 {
    "reinforced"
    } else {
      "active"
    };

  let alignment_summary = match truth_alignment {
    "historical" => "The declared memory now belongs to earlier context rather than the active present.",
    "guarded" => "Observed evidence should be handled carefully here because this area is boundary-sensitive.",
    "diverging" => "Recent lived evidence has accumulated into a real pull away from the declared version of this memory.",
    "watching" => "Observed life is not fully contradicting this memory, but the fit is no longer clean and the tension is accumulating across sources.",
    _ => "Recent lived evidence still broadly supports the declared memory.",
  }
  .to_string();

  let observed_truth_summary = match current_status {
    "historical" => "The source context is no longer active, so this memory is being kept as historical context.",
    "protected" => "This memory is being carried carefully because the source reads as protected or boundary-sensitive.",
    "awaiting_confirmation" => "Observed life is pulling against a sensitive declared memory, so this should wait for clearer confirmation.",
    "volatile" => "This memory is seeing unstable movement and should be treated as unsettled.",
    "conflicted" => "This memory currently holds mixed signals rather than a settled interpretation.",
    "drifting" => "Declared truth and recent movement are beginning to pull apart.",
    "emerging" => "This memory is still taking shape and should stay light-touch.",
    "reinforced" => "This memory has repeated support and is becoming more durable.",
    _ => "This memory is active but still open to future movement.",
  }
  .to_string();

  let last_confirmed_at = if item.declared_by_user {
    Some(item.last_observed_at.clone())
  } else {
    None
  };

  let existing_id = connection
    .query_row(
      "SELECT id FROM memory_evolution_state WHERE memory_item_id = ?1",
      params![item.id],
      |row| row.get::<_, i64>(0),
    )
    .optional()?;

  if let Some(id) = existing_id {
    connection.execute(
      r#"
        UPDATE memory_evolution_state
        SET
          declared_confidence = ?2,
          observed_confidence = ?3,
          detector_balance = ?4,
          observed_support_score = ?5,
          observed_challenge_score = ?6,
          divergence_score = ?7,
          cumulative_support_score = ?8,
          cumulative_challenge_score = ?9,
          cumulative_divergence_score = ?10,
          support_source_count = ?11,
          challenge_source_count = ?12,
          source_coherence_score = ?13,
          sustained_divergence_score = ?14,
          phase_shift_score = ?15,
          phase_shift_state = ?16,
          truth_alignment = ?17,
          current_status = ?18,
          reinforcement_score = ?19,
          drift_score = ?20,
          tension_score = ?21,
          volatility_score = ?22,
          emergence_score = ?23,
          protection_score = ?24,
          declared_truth_summary = ?25,
          observed_truth_summary = ?26,
          observed_evidence_summary = ?27,
          phase_shift_summary = ?28,
          alignment_summary = ?29,
          last_evolved_at = ?30,
          last_confirmed_at = ?31
        WHERE id = ?1
      "#,
      params![
        id,
        item.confidence,
        observed_confidence,
        detector_balance,
        observed_support_score,
        observed_challenge_score,
        divergence_score,
        cumulative_support_score,
        cumulative_challenge_score,
        cumulative_divergence_score,
        support_source_count,
        challenge_source_count,
        source_coherence_score,
        sustained_divergence_score,
        phase_shift_score,
        phase_shift_state,
        truth_alignment,
        current_status,
        reinforcement_score,
        drift_score,
        tension_score,
        volatility_score,
        emergence_score,
        protection_score,
        item.detail,
        observed_truth_summary,
        observed_evidence_summary,
        phase_shift_summary,
        alignment_summary,
        now,
        last_confirmed_at,
      ],
    )?;
  } else {
    connection.execute(
      r#"
        INSERT INTO memory_evolution_state (
          memory_item_id,
          declared_confidence,
          observed_confidence,
          detector_balance,
          observed_support_score,
          observed_challenge_score,
          divergence_score,
          cumulative_support_score,
          cumulative_challenge_score,
          cumulative_divergence_score,
          support_source_count,
          challenge_source_count,
          source_coherence_score,
          sustained_divergence_score,
          phase_shift_score,
          phase_shift_state,
          truth_alignment,
          current_status,
          reinforcement_score,
          drift_score,
          tension_score,
          volatility_score,
          emergence_score,
          protection_score,
          declared_truth_summary,
          observed_truth_summary,
          observed_evidence_summary,
          phase_shift_summary,
          alignment_summary,
          last_evolved_at,
          last_confirmed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)
      "#,
      params![
        item.id,
        item.confidence,
        observed_confidence,
        detector_balance,
        observed_support_score,
        observed_challenge_score,
        divergence_score,
        cumulative_support_score,
        cumulative_challenge_score,
        cumulative_divergence_score,
        support_source_count,
        challenge_source_count,
        source_coherence_score,
        sustained_divergence_score,
        phase_shift_score,
        phase_shift_state,
        truth_alignment,
        current_status,
        reinforcement_score,
        drift_score,
        tension_score,
        volatility_score,
        emergence_score,
        protection_score,
        item.detail,
        observed_truth_summary,
        observed_evidence_summary,
        phase_shift_summary,
        alignment_summary,
        now,
        last_confirmed_at,
      ],
    )?;
  }

  connection.execute(
    r#"
      INSERT INTO memory_evolution_history (
        memory_item_id,
        evolved_at,
        observed_confidence,
        divergence_score,
        source_coherence_score,
        truth_alignment,
        current_status,
        phase_shift_state,
        phase_shift_score
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    "#,
    params![
      item.id,
      now,
      observed_confidence,
      divergence_score,
      source_coherence_score,
      truth_alignment,
      current_status,
      phase_shift_state,
      phase_shift_score,
    ],
  )?;

  connection.execute(
    "UPDATE companion_memory_items SET status = ?2, updated_at = ?3 WHERE id = ?1",
    params![item.id, current_status, now],
  )?;

  Ok(())
}

fn create_tectonic_snapshot(connection: &Connection, now: DateTime<Utc>) -> Result<(), AppError> {
  let window_start = (now - Duration::days(7)).to_rfc3339();
  let now_text = now.to_rfc3339();
  let detector_records = list_detector_records(connection)?
    .into_iter()
    .filter(|record| record.last_seen_at >= window_start)
    .collect::<Vec<_>>();
  let evolution_states = list_memory_evolution_states(connection)?;
  let active_memory_count = evolution_states
    .iter()
    .filter(|state| state.current_status != "historical")
    .count() as i64;
  let total_detector_activity = detector_records.iter().map(|record| record.strength).sum::<f64>();
  let region_continuity = build_tectonic_region_continuity(connection, &detector_records, &evolution_states)?;
  let divergent_memory_count = evolution_states
    .iter()
    .filter(|state| state.truth_alignment == "diverging")
    .count();
  let cumulative_divergence_average = if evolution_states.is_empty() {
    0.0
  } else {
    evolution_states
      .iter()
      .map(|state| state.cumulative_divergence_score)
      .sum::<f64>()
      / evolution_states.len() as f64
  };
  let cross_source_memory_count = evolution_states
    .iter()
    .filter(|state| state.support_source_count + state.challenge_source_count >= 2)
    .count();
  let source_coherence_average = if evolution_states.is_empty() {
    0.0
  } else {
    evolution_states
      .iter()
      .map(|state| state.source_coherence_score)
      .sum::<f64>()
      / evolution_states.len() as f64
  };
  let sustained_shift_memory_count = evolution_states
    .iter()
    .filter(|state| state.phase_shift_state == "sustained_shift")
    .count();
  let phase_shift_average = if evolution_states.is_empty() {
    0.0
  } else {
    evolution_states
      .iter()
      .map(|state| state.phase_shift_score)
      .sum::<f64>()
      / evolution_states.len() as f64
  };
  let summary_json = json!({
    "detectorTypeBreakdown": build_count_breakdown(detector_records.iter().map(|item| item.detector_type.clone()).collect::<Vec<_>>()),
    "evolutionStatusBreakdown": build_count_breakdown(evolution_states.iter().map(|item| item.current_status.clone()).collect::<Vec<_>>()),
    "truthAlignmentBreakdown": build_count_breakdown(evolution_states.iter().map(|item| item.truth_alignment.clone()).collect::<Vec<_>>()),
    "divergentMemoryCount": divergent_memory_count,
    "cumulativeDivergenceAverage": cumulative_divergence_average,
    "crossSourceMemoryCount": cross_source_memory_count,
    "sourceCoherenceAverage": source_coherence_average,
    "sustainedShiftMemoryCount": sustained_shift_memory_count,
    "phaseShiftAverage": phase_shift_average,
    "phaseShiftBreakdown": build_count_breakdown(evolution_states.iter().map(|item| item.phase_shift_state.clone()).collect::<Vec<_>>()),
    "targetKindBreakdown": build_count_breakdown(detector_records.iter().map(|item| item.target_kind.clone()).collect::<Vec<_>>()),
    "directionBreakdown": build_count_breakdown(detector_records.iter().map(|item| item.direction.clone()).collect::<Vec<_>>()),
    "regionContinuity": region_continuity,
  })
  .to_string();

  connection.execute(
    r#"
      INSERT INTO tectonic_timeline_snapshots (
        snapshot_kind,
        recorded_at,
        window_start,
        window_end,
        total_detector_activity,
        active_memory_count,
        summary_json
      ) VALUES ('context_memory_pass', ?1, ?2, ?1, ?3, ?4, ?5)
    "#,
    params![
      now_text,
      window_start,
      total_detector_activity,
      active_memory_count,
      summary_json,
    ],
  )?;

  connection.execute(
    r#"
      DELETE FROM tectonic_timeline_snapshots
      WHERE id NOT IN (
        SELECT id
        FROM tectonic_timeline_snapshots
        ORDER BY recorded_at DESC, id DESC
        LIMIT 336
      )
    "#,
    [],
  )?;

  Ok(())
}

fn timestamp_in_window(value: &str, window_start: DateTime<Utc>) -> bool {
  parse_utc(value)
    .map(|timestamp| timestamp >= window_start)
    .unwrap_or(false)
}

fn apply_lived_interaction_detectors(
  connection: &Connection,
  now: DateTime<Utc>,
  week_start: DateTime<Utc>,
) -> Result<(), AppError> {
  let now_text = now.to_rfc3339();

  for session in list_call_sessions(connection)? {
    let event_timestamp = session
      .ended_at
      .as_deref()
      .or(session.started_at.as_deref())
      .unwrap_or(&session.created_at);
    if !timestamp_in_window(event_timestamp, week_start) {
      continue;
    }

    let transcript_summary = normalize_whitespace(&session.transcript_summary);
    let notes = normalize_whitespace(&session.notes);
    let combined = format!("{transcript_summary} {notes}");
    let duration_hours = (session.duration_seconds as f64 / 3600.0).clamp(0.0, 1.0);

    match session.outcome.as_str() {
      "completed" => {
        let reinforcement_strength =
          clamp_score(0.56 + (duration_hours * 0.24) + if !transcript_summary.is_empty() { 0.1 } else { 0.0 });
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "reinforcement",
            target_kind: "interaction_field",
            target_ref_id: Some(session.id),
            target_key: "live_contact".into(),
            direction: "warming",
            strength: reinforcement_strength,
            confidence: 0.78,
            duration_seconds: session.duration_seconds.max(60),
            summary: if transcript_summary.is_empty() {
              "A recent completed call added supportive contact to the interaction field.".into()
            } else {
              format!("A recent completed call added grounded contact: {}.", transcript_summary)
            },
            evidence_json: json!({
              "source": "call_session",
              "sessionId": session.id,
              "outcome": session.outcome,
              "durationSeconds": session.duration_seconds,
              "transcriptSummary": transcript_summary,
            })
            .to_string(),
          },
          &now_text,
        )?;

        if text_has_any_keyword(
          &combined,
          &["calm", "grounded", "gentle", "safe", "steady", "soft", "relief", "settled"],
        ) {
          upsert_detector_signal(
            connection,
            &DetectorSignal {
              detector_type: "protection",
              target_kind: "interaction_boundary",
              target_ref_id: Some(session.id),
              target_key: "contact_safety".into(),
              direction: "sheltering",
              strength: 0.72,
              confidence: 0.74,
              duration_seconds: session.duration_seconds.max(60),
              summary: "A recent call carried signs of grounded or protected contact.".into(),
              evidence_json: json!({
                "source": "call_session",
                "sessionId": session.id,
                "outcome": session.outcome,
                "matchedFrom": combined,
              })
              .to_string(),
            },
            &now_text,
          )?;
        }

        if text_has_any_keyword(
          &combined,
          &["stress", "overwhelmed", "anxious", "grief", "lonely", "tired", "conflict", "hard"],
        ) {
          upsert_detector_signal(
            connection,
            &DetectorSignal {
              detector_type: "tension",
              target_kind: "conversation_theme",
              target_ref_id: Some(session.id),
              target_key: "weight_in_contact".into(),
              direction: "pressing",
              strength: 0.66,
              confidence: 0.68,
              duration_seconds: session.duration_seconds.max(60),
              summary: "A recent call carried heavier themes that may matter in the contact field.".into(),
              evidence_json: json!({
                "source": "call_session",
                "sessionId": session.id,
                "outcome": session.outcome,
                "matchedFrom": combined,
              })
              .to_string(),
            },
            &now_text,
          )?;
        }
      }
      "declined" => {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "protection",
            target_kind: "interaction_boundary",
            target_ref_id: Some(session.id),
            target_key: "call_boundary".into(),
            direction: "guarding",
            strength: 0.74,
            confidence: 0.82,
            duration_seconds: 0,
            summary: "A declined call suggests the contact boundary should stay lighter-touch for now.".into(),
            evidence_json: json!({
              "source": "call_session",
              "sessionId": session.id,
              "outcome": session.outcome,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
      "interrupted" | "missed" => {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "volatility",
            target_kind: "interaction_field",
            target_ref_id: Some(session.id),
            target_key: "live_contact".into(),
            direction: "unsettling",
            strength: 0.69,
            confidence: 0.7,
            duration_seconds: session.duration_seconds.max(0),
            summary: "A recent call did not land cleanly, adding instability to the contact field.".into(),
            evidence_json: json!({
              "source": "call_session",
              "sessionId": session.id,
              "outcome": session.outcome,
              "durationSeconds": session.duration_seconds,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
      _ => {}
    }
  }

  for review in list_north_star_call_reviews(connection)? {
    if !timestamp_in_window(&review.created_at, week_start) {
      continue;
    }

    let combined = normalize_whitespace(&format!("{} {}", review.sentiment, review.notes));
    if combined.is_empty() {
      continue;
    }

    if review_sentiment_signals_support(&review.sentiment) || text_signals_memory_support(&combined) {
      upsert_detector_signal(
        connection,
        &DetectorSignal {
          detector_type: "reinforcement",
          target_kind: "interaction_field",
          target_ref_id: Some(review.id),
          target_key: format!("north_star_review:{}", review.call_id),
          direction: "affirming",
          strength: 0.71,
          confidence: 0.78,
          duration_seconds: 0,
          summary: "A North Star call review carried supportive contact after the call.".into(),
          evidence_json: json!({
            "source": "north_star_call_review",
            "reviewId": review.review_id,
            "callId": review.call_id,
            "userHandle": review.user_handle,
            "sentiment": review.sentiment,
            "notes": review.notes,
            "importedAt": review.imported_at,
          })
          .to_string(),
        },
        &now_text,
      )?;
    }

    if review_sentiment_signals_challenge(&review.sentiment) || text_signals_memory_challenge(&combined) {
      upsert_detector_signal(
        connection,
        &DetectorSignal {
          detector_type: "tension",
          target_kind: "interaction_field",
          target_ref_id: Some(review.id),
          target_key: format!("north_star_review:{}", review.call_id),
          direction: "friction",
          strength: 0.76,
          confidence: 0.8,
          duration_seconds: 0,
          summary: "A North Star call review suggested the call landed with friction or distance.".into(),
          evidence_json: json!({
            "source": "north_star_call_review",
            "reviewId": review.review_id,
            "callId": review.call_id,
            "userHandle": review.user_handle,
            "sentiment": review.sentiment,
            "notes": review.notes,
            "importedAt": review.imported_at,
          })
          .to_string(),
        },
        &now_text,
      )?;
    }
  }

  for feedback in list_feedback_entries(connection)? {
    if !timestamp_in_window(&feedback.created_at, week_start) {
      continue;
    }

    let outreach = match get_outreach_event_by_id(connection, feedback.outreach_event_id) {
      Ok(value) => value,
      Err(_) => continue,
    };
    let target_key = format!("{}:{}", outreach.outreach_kind, outreach.channel);

    if feedback.score > 0.0 {
      upsert_detector_signal(
        connection,
        &DetectorSignal {
          detector_type: "reinforcement",
          target_kind: "outreach_path",
          target_ref_id: Some(outreach.id),
          target_key: target_key.clone(),
          direction: "welcoming",
          strength: clamp_score(0.52 + feedback.score.abs()),
          confidence: 0.73,
          duration_seconds: 0,
          summary: format!("Recent '{}' feedback suggests this outreach path is landing well.", feedback.feedback_kind),
          evidence_json: json!({
            "source": "outreach_feedback",
            "feedbackId": feedback.id,
            "outreachEventId": outreach.id,
            "feedbackKind": feedback.feedback_kind,
            "score": feedback.score,
            "notes": feedback.notes,
          })
          .to_string(),
        },
        &now_text,
      )?;
    } else if feedback.score < 0.0 {
      upsert_detector_signal(
        connection,
        &DetectorSignal {
          detector_type: "tension",
          target_kind: "outreach_path",
          target_ref_id: Some(outreach.id),
          target_key: target_key.clone(),
          direction: "resisting",
          strength: clamp_score(0.5 + feedback.score.abs()),
          confidence: 0.76,
          duration_seconds: 0,
          summary: format!("Recent '{}' feedback suggests friction in this outreach path.", feedback.feedback_kind),
          evidence_json: json!({
            "source": "outreach_feedback",
            "feedbackId": feedback.id,
            "outreachEventId": outreach.id,
            "feedbackKind": feedback.feedback_kind,
            "score": feedback.score,
            "notes": feedback.notes,
          })
          .to_string(),
        },
        &now_text,
      )?;

      if matches!(feedback.feedback_kind.as_str(), "mistimed" | "intrusive") {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "protection",
            target_kind: "interaction_boundary",
            target_ref_id: Some(outreach.id),
            target_key: "outreach_timing_boundary".into(),
            direction: "guarding",
            strength: clamp_score(0.58 + feedback.score.abs()),
            confidence: 0.8,
            duration_seconds: 0,
            summary: "Recent feedback suggests timing or intensity boundaries should be handled more carefully.".into(),
            evidence_json: json!({
              "source": "outreach_feedback",
              "feedbackId": feedback.id,
              "outreachEventId": outreach.id,
              "feedbackKind": feedback.feedback_kind,
              "score": feedback.score,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
    }
  }

  Ok(())
}

fn apply_memory_specific_observation_detectors(
  connection: &Connection,
  now: DateTime<Utc>,
  week_start: DateTime<Utc>,
  items: &[InterpretedMemoryItem],
) -> Result<(), AppError> {
  if items.is_empty() {
    return Ok(());
  }

  let now_text = now.to_rfc3339();
  let sessions = list_call_sessions(connection)?;
  let reviews = list_north_star_call_reviews(connection)?;
  for item in items {
    if item.archived_at.is_some() {
      continue;
    }

    for session in &sessions {
      let event_timestamp = session
        .ended_at
        .as_deref()
        .or(session.started_at.as_deref())
        .unwrap_or(&session.created_at);
      if !timestamp_in_window(event_timestamp, week_start) {
        continue;
      }

      let combined = normalize_whitespace(&format!("{} {}", session.transcript_summary, session.notes));
      if combined.is_empty() || !text_mentions_memory(&combined, item) {
        continue;
      }

      let challenged = text_signals_memory_challenge(&combined);
      let supported = text_signals_memory_support(&combined) || !challenged;
      if supported {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "reinforcement",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "echoing",
            strength: clamp_score(0.61 + ((session.duration_seconds as f64 / 3600.0).min(1.0) * 0.14)),
            confidence: 0.71,
            duration_seconds: session.duration_seconds.max(60),
            summary: format!(
              "Recent live contact echoed the declared memory around '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "call_session_memory_match",
              "sessionId": session.id,
              "memoryKey": item.memory_key,
              "matchedText": combined,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }

      if challenged {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "drift",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "contradicting",
            strength: 0.79,
            confidence: 0.76,
            duration_seconds: session.duration_seconds.max(60),
            summary: format!(
              "Recent live contact challenged the declared memory around '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "call_session_memory_match",
              "sessionId": session.id,
              "memoryKey": item.memory_key,
              "matchedText": combined,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
    }

    for review in &reviews {
      if !timestamp_in_window(&review.created_at, week_start) {
        continue;
      }

      let combined = normalize_whitespace(&format!("{} {}", review.sentiment, review.notes));
      if combined.is_empty() || !text_mentions_memory(&combined, item) {
        continue;
      }

      let challenged =
        review_sentiment_signals_challenge(&review.sentiment) || text_signals_memory_challenge(&combined);
      let supported =
        review_sentiment_signals_support(&review.sentiment) || text_signals_memory_support(&combined) || !challenged;

      if supported {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "reinforcement",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "reviewing",
            strength: 0.74,
            confidence: 0.77,
            duration_seconds: 0,
            summary: format!(
              "A North Star call review affirmed the declared memory around '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "north_star_call_review_memory_match",
              "reviewId": review.review_id,
              "callId": review.call_id,
              "userHandle": review.user_handle,
              "memoryKey": item.memory_key,
              "matchedText": combined,
              "sentiment": review.sentiment,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }

      if challenged {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "tension",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "reviewing",
            strength: 0.81,
            confidence: 0.82,
            duration_seconds: 0,
            summary: format!(
              "A North Star call review challenged the declared memory around '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "north_star_call_review_memory_match",
              "reviewId": review.review_id,
              "callId": review.call_id,
              "userHandle": review.user_handle,
              "memoryKey": item.memory_key,
              "matchedText": combined,
              "sentiment": review.sentiment,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
    }

    for feedback in list_feedback_entries(connection)? {
      if !timestamp_in_window(&feedback.created_at, week_start) {
        continue;
      }
      let notes = normalize_whitespace(&feedback.notes);
      if notes.is_empty() || !text_mentions_memory(&notes, item) {
        continue;
      }

      if feedback.score > 0.0 {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "reinforcement",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "confirming",
            strength: clamp_score(0.54 + feedback.score.abs()),
            confidence: 0.69,
            duration_seconds: 0,
            summary: format!(
              "Recent feedback reinforced the declared memory around '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "outreach_feedback_memory_match",
              "feedbackId": feedback.id,
              "memoryKey": item.memory_key,
              "notes": notes,
              "score": feedback.score,
            })
            .to_string(),
          },
          &now_text,
        )?;
      } else if feedback.score < 0.0 || text_signals_memory_challenge(&notes) {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "tension",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "questioning",
            strength: clamp_score(0.56 + feedback.score.abs()),
            confidence: 0.74,
            duration_seconds: 0,
            summary: format!(
              "Recent feedback added friction around the declared memory '{}'.",
              item.source_entry_title
            ),
            evidence_json: json!({
              "source": "outreach_feedback_memory_match",
              "feedbackId": feedback.id,
              "memoryKey": item.memory_key,
              "notes": notes,
              "score": feedback.score,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
    }
  }

  Ok(())
}

fn run_context_memory_pass_with_connection(connection: &Connection) -> Result<(), AppError> {
  let now = Utc::now();
  let now_text = now.to_rfc3339();
  let week_start = now - Duration::days(7);
  let week_start_text = week_start.to_rfc3339();
  let context_sections = build_companion_context_snapshot_with_filter(connection, true)?;
  let categories = companion_context_categories_with_visibility(connection)?;
  let mut active_keys = HashSet::new();

  for section in &context_sections {
    for entry in &section.entries {
      for candidate in build_memory_candidates(entry) {
        let (memory_item_id, created, materially_changed) = upsert_memory_candidate(connection, &candidate, &now_text)?;
        active_keys.insert(candidate.memory_key.clone());

        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: if created { "emergence" } else { "reinforcement" },
            target_kind: "memory_item",
            target_ref_id: Some(memory_item_id),
            target_key: candidate.memory_key.clone(),
            direction: if created {
              "appearing"
            } else if materially_changed {
              "restating"
            } else {
              "steadying"
            },
            strength: if created {
              0.82
            } else if materially_changed {
              0.38
            } else {
              0.67
            },
            confidence: candidate.confidence,
            duration_seconds: if created { 0 } else { 86_400 },
            summary: if created {
              format!("A new interpreted memory emerged from '{}'.", candidate.source_entry_title)
            } else if materially_changed {
              format!("'{}' was just restated, so the declared memory is present but not settled yet.", candidate.source_entry_title)
            } else {
              format!("'{}' continues to hold steady as declared context.", candidate.source_entry_title)
            },
            evidence_json: json!({
              "memoryKey": candidate.memory_key,
              "sourceEntryId": candidate.source_ref_id,
              "memoryType": candidate.memory_type,
              "materiallyChanged": materially_changed,
            })
            .to_string(),
          },
          &now_text,
        )?;

        if materially_changed {
          upsert_detector_signal(
            connection,
            &DetectorSignal {
              detector_type: "drift",
              target_kind: "memory_item",
              target_ref_id: Some(memory_item_id),
              target_key: candidate.memory_key.clone(),
              direction: "shifting",
              strength: 0.84,
              confidence: 0.74,
              duration_seconds: 0,
              summary: format!(
                "The declared wording around '{}' has shifted enough to register drift.",
                candidate.source_entry_title
              ),
              evidence_json: json!({
                "memoryKey": candidate.memory_key,
                "sourceEntryId": candidate.source_ref_id,
              })
              .to_string(),
            },
            &now_text,
          )?;

          if text_signals_memory_challenge(&candidate.detail) {
            upsert_detector_signal(
              connection,
              &DetectorSignal {
                detector_type: "tension",
                target_kind: "memory_item",
                target_ref_id: Some(memory_item_id),
                target_key: candidate.memory_key.clone(),
                direction: "reversing",
                strength: 0.78,
                confidence: 0.76,
                duration_seconds: 0,
                summary: format!(
                  "The new declared wording around '{}' sounds like a meaningful reversal, not just a small edit.",
                  candidate.source_entry_title
                ),
                evidence_json: json!({
                  "memoryKey": candidate.memory_key,
                  "sourceEntryId": candidate.source_ref_id,
                  "detail": candidate.detail,
                })
                .to_string(),
              },
              &now_text,
            )?;
          }
        }

        if candidate.sensitivity == "high" || candidate.sensitivity == "guarded" {
          upsert_detector_signal(
            connection,
            &DetectorSignal {
              detector_type: "protection",
              target_kind: "memory_item",
              target_ref_id: Some(memory_item_id),
              target_key: candidate.memory_key.clone(),
              direction: "guarding",
              strength: if candidate.sensitivity == "high" { 0.86 } else { 0.62 },
              confidence: 0.76,
              duration_seconds: 86_400,
              summary: format!(
                "The memory around '{}' should be handled with extra care.",
                candidate.source_entry_title
              ),
              evidence_json: json!({
                "memoryKey": candidate.memory_key,
                "sensitivity": candidate.sensitivity,
              })
              .to_string(),
            },
            &now_text,
          )?;
        }

        if text_has_any_keyword(
          &format!("{} {}", candidate.summary, candidate.detail),
          &["but", "however", "mixed", "torn", "conflict", "although"],
        ) {
          upsert_detector_signal(
            connection,
            &DetectorSignal {
              detector_type: "tension",
              target_kind: "memory_item",
              target_ref_id: Some(memory_item_id),
              target_key: candidate.memory_key.clone(),
              direction: "pulling",
              strength: 0.66,
              confidence: 0.62,
              duration_seconds: 0,
              summary: format!("'{}' carries internally mixed language.", candidate.source_entry_title),
              evidence_json: json!({
                "memoryKey": candidate.memory_key,
              })
              .to_string(),
            },
            &now_text,
          )?;
        }
      }
    }
  }

  for category in categories.into_iter().filter(|category| category.is_deleted) {
    upsert_detector_signal(
      connection,
      &DetectorSignal {
        detector_type: "drift",
        target_kind: "category",
        target_ref_id: None,
        target_key: category.key.clone(),
        direction: "removing",
        strength: 0.74,
        confidence: 0.8,
        duration_seconds: 0,
        summary: format!("The '{}' category has been removed from active manual context.", category.label),
        evidence_json: json!({
          "categoryKey": category.key,
          "deletedAt": category.deleted_at,
        })
        .to_string(),
      },
      &now_text,
    )?;
  }

  let existing_items = list_interpreted_memory_items(connection)?;
  for item in existing_items {
    if item.source_kind == "manual_context_entry" && !active_keys.contains(&item.memory_key) && item.archived_at.is_none() {
      connection.execute(
        r#"
          UPDATE companion_memory_items
          SET archived_at = ?2, status = 'historical', updated_at = ?2
          WHERE id = ?1
        "#,
        params![item.id, now_text],
      )?;

      upsert_detector_signal(
        connection,
        &DetectorSignal {
          detector_type: "drift",
          target_kind: "memory_item",
          target_ref_id: Some(item.id),
          target_key: item.memory_key.clone(),
          direction: "receding",
          strength: 0.69,
          confidence: 0.79,
          duration_seconds: 0,
          summary: format!(
            "The manual context behind '{}' is no longer active, so the memory is receding into history.",
            item.source_entry_title
          ),
          evidence_json: json!({
            "memoryKey": item.memory_key,
            "sourceEntryTitle": item.source_entry_title,
          })
          .to_string(),
        },
        &now_text,
      )?;
    }
  }

  for item in &list_interpreted_memory_items(connection)? {
    evolve_memory_item(connection, item, &now_text, &week_start_text)?;
  }

  let current_items = list_interpreted_memory_items(connection)?;
  for item in &current_items {
    let evolution = connection
      .query_row(
        "SELECT current_status, detector_balance FROM memory_evolution_state WHERE memory_item_id = ?1",
        params![item.id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)),
      )
      .optional()?;
    if let Some((current_status, detector_balance)) = evolution {
      if current_status == "conflicted" && detector_balance.abs() >= 0.25 {
        upsert_detector_signal(
          connection,
          &DetectorSignal {
            detector_type: "volatility",
            target_kind: "memory_item",
            target_ref_id: Some(item.id),
            target_key: item.memory_key.clone(),
            direction: "swinging",
            strength: clamp_score(detector_balance.abs() + 0.35),
            confidence: 0.63,
            duration_seconds: 86_400,
            summary: format!("'{}' is showing unstable movement across detector signals.", item.source_entry_title),
            evidence_json: json!({
              "memoryKey": item.memory_key,
              "detectorBalance": detector_balance,
            })
            .to_string(),
          },
          &now_text,
        )?;
      }
    }
  }

  apply_lived_interaction_detectors(connection, now, week_start)?;
  apply_memory_specific_observation_detectors(connection, now, week_start, &current_items)?;

  for item in &list_interpreted_memory_items(connection)? {
    evolve_memory_item(connection, item, &now_text, &week_start_text)?;
  }

  create_tectonic_snapshot(connection, now)?;
  Ok(())
}

pub fn memory_system_snapshot(db_path: &PathBuf) -> Result<MemorySystemSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  build_memory_system_snapshot(&connection)
}

pub fn store_north_star_call_reviews(
  db_path: &PathBuf,
  reviews: &[NorthStarCallReview],
) -> Result<usize, AppError> {
  let connection = Connection::open(db_path)?;
  let imported_at = Utc::now().to_rfc3339();
  let mut imported = 0usize;
  for review in reviews {
    if upsert_north_star_call_review(&connection, review, &imported_at)? {
      imported += 1;
    }
  }
  Ok(imported)
}

pub fn run_context_memory_pass(db_path: &PathBuf) -> Result<MemorySystemSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  run_context_memory_pass_with_connection(&connection)?;
  build_memory_system_snapshot(&connection)
}

pub fn seed_context_memory_example(
  db_path: &PathBuf,
  scenario_key: &str,
) -> Result<MemorySystemSnapshot, AppError> {
  reset_runtime_data(db_path)?;

  let connection = Connection::open(db_path)?;
  let now = Utc::now();
  let now_text = now.to_rfc3339();
  let title = "[Seed] Akai MPC";
  let category_key = "career";
  let (body, notes, call_notes, transcript_summary, review_sentiment, review_notes) = match scenario_key {
    "support" => (
      "I really like the Akai MPC and keep coming back to it.".to_string(),
      "Seeded memory-evidence support example.".to_string(),
      "We talked about how the Akai MPC still feels grounding and worth returning to.".to_string(),
      "The Akai MPC still feels important, grounding, and like something I genuinely want to keep using.".to_string(),
      "warm".to_string(),
      "The call felt warm and confirming. The Akai MPC still feels like something I want to keep close.".to_string(),
    ),
    "contradiction" => (
      "I really like the Akai MPC and keep coming back to it.".to_string(),
      "Seeded memory-evidence contradiction example. Declared truth stays positive while lived evidence turns against it.".to_string(),
      "We talked about how the Akai MPC does not fit anymore and mostly gets avoided now.".to_string(),
      "I don't really like the Akai MPC anymore and I mostly avoid using it now.".to_string(),
      "tense".to_string(),
      "The call felt tense and off. The Akai MPC does not feel like me anymore and I keep pulling away from it now.".to_string(),
    ),
    other => {
      return Err(AppError::Message(format!(
        "Unknown context-memory seed scenario '{}'.",
        other
      )))
    }
  };

  if let Some(existing) = find_companion_context_entry_by_category_and_title(&connection, category_key, title)? {
    connection.execute(
      r#"
        UPDATE companion_context_entries
        SET
          body = ?2,
          tags_json = ?3,
          notes = ?4,
          is_active = 1,
          deleted_at = NULL,
          updated_at = ?5
        WHERE id = ?1
      "#,
      params![
        existing.id,
        body,
        serde_json::to_string(&vec!["seeded", "music"])?,
        notes,
        now_text,
      ],
    )?;
  } else {
    let display_order: i64 = connection.query_row(
      "SELECT COALESCE(MAX(display_order) + 1, 0) FROM companion_context_entries WHERE category_key = ?1",
      params![category_key],
      |row| row.get(0),
    )?;
    connection.execute(
      r#"
        INSERT INTO companion_context_entries (
          category_key, title, body, tags_json, notes, display_order, is_active, deleted_at, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, NULL, ?7, ?7)
      "#,
      params![
        category_key,
        title,
        body,
        serde_json::to_string(&vec!["seeded", "music"])?,
        notes,
        display_order,
        now_text,
      ],
    )?;
  }

  let started_at = (now - Duration::minutes(12)).to_rfc3339();
  let ended_at = (now - Duration::minutes(2)).to_rfc3339();
  connection.execute(
    r#"
      INSERT INTO call_sessions (
        created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
        started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
      ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
    "#,
    params![now_text, started_at, ended_at, call_notes, transcript_summary, 600_i64],
  )?;

  upsert_north_star_call_review(
    &connection,
    &NorthStarCallReview {
      review_id: format!("seed-review-{scenario_key}"),
      call_id: format!("seed-call-{scenario_key}"),
      user_handle: "seeded-user".into(),
      sentiment: review_sentiment,
      notes: review_notes,
      created_at: now_text.clone(),
    },
    &now_text,
  )?;

  run_context_memory_pass_with_connection(&connection)?;
  build_memory_system_snapshot(&connection)
}

pub fn create_place(db_path: &PathBuf, payload: &CreatePlaceInput) -> Result<Place, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();

  connection.execute(
    r#"
      INSERT INTO places (
        label, latitude, longitude, radius_meters, place_kind, meaning_kind,
        is_user_named, significance_score, is_protected, notes, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    "#,
    params![
      payload.label,
      payload.latitude,
      payload.longitude,
      payload.radius_meters,
      payload.place_kind,
      payload.meaning_kind,
      payload.is_user_named,
      if payload.is_user_named { 0.75 } else { 0.35 },
      payload.is_protected,
      payload.notes,
      timestamp,
      timestamp
    ],
  )?;

  let id = connection.last_insert_rowid();
  get_place_by_id(&connection, id)
}

pub fn create_rule(
  db_path: &PathBuf,
  payload: &CreateRuleInput,
) -> Result<ProtectedRule, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();

  connection.execute(
    r#"
      INSERT INTO rules (
        rule_kind, scope_kind, scope_ref_id, value_json, is_active, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    "#,
    params![
      payload.rule_kind,
      payload.scope_kind,
      payload.scope_ref_id,
      payload.value_json,
      payload.is_active,
      timestamp,
      timestamp
    ],
  )?;

  let id = connection.last_insert_rowid();
  get_rule_by_id(&connection, id)
}

pub fn update_place(db_path: &PathBuf, payload: &UpdatePlaceInput) -> Result<Place, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      UPDATE places
      SET meaning_kind = ?2,
          significance_score = ?3,
          is_protected = ?4,
          notes = ?5,
          updated_at = ?6
      WHERE id = ?1
    "#,
    params![
      payload.id,
      payload.meaning_kind,
      payload.significance_score,
      payload.is_protected,
      payload.notes,
      Utc::now().to_rfc3339()
    ],
  )?;
  get_place_by_id(&connection, payload.id)
}

pub fn update_rule(db_path: &PathBuf, payload: &UpdateRuleInput) -> Result<ProtectedRule, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      UPDATE rules
      SET is_active = ?2,
          value_json = ?3,
          updated_at = ?4
      WHERE id = ?1
    "#,
    params![
      payload.id,
      payload.is_active,
      payload.value_json,
      Utc::now().to_rfc3339()
    ],
  )?;
  get_rule_by_id(&connection, payload.id)
}

pub fn create_reflection(
  db_path: &PathBuf,
  payload: &CreateReflectionInput,
) -> Result<ManualReflection, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();

  connection.execute(
    r#"
      INSERT INTO manual_reflections (
        created_at, reflection_kind, text, linked_place_id, linked_moment_id,
        weight, expires_at, is_sensitive
      ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7)
    "#,
    params![
      timestamp,
      payload.reflection_kind,
      payload.text,
      payload.linked_place_id,
      payload.weight,
      payload.expires_at,
      payload.is_sensitive
    ],
  )?;

  let id = connection.last_insert_rowid();
  let reflection = get_reflection_by_id(&connection, id)?;
  upsert_memory_item_from_reflection(&connection, &reflection)?;
  Ok(reflection)
}

pub fn phase_one_snapshot(db_path: &PathBuf) -> Result<PhaseOneSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  let places = list_places(&connection)?;
  let rules = list_rules(&connection)?;
  let reflections = list_reflections(&connection)?;
  let overview = build_memory_overview(&connection)?;

  Ok(PhaseOneSnapshot {
    places,
    rules,
    reflections,
    overview,
  })
}

pub fn create_reflection_if_missing(
  db_path: &PathBuf,
  payload: &CreateReflectionInput,
) -> Result<bool, AppError> {
  let connection = Connection::open(db_path)?;
  let exists: i64 = connection.query_row(
    "SELECT COUNT(*) FROM manual_reflections WHERE reflection_kind = ?1 AND text = ?2",
    params![payload.reflection_kind, payload.text],
    |row| row.get(0),
  )?;

  if exists > 0 {
    return Ok(false);
  }

  create_reflection(db_path, payload)?;
  Ok(true)
}

pub fn ingest_location_event(
  db_path: &PathBuf,
  payload: &LocationEventInput,
) -> Result<RawLocationEvent, AppError> {
  let mut connection = Connection::open(db_path)?;
  let transaction = connection.transaction()?;

  let previous_event = latest_raw_event(&transaction)?;
  let movement_state = classify_movement_state(previous_event.as_ref(), payload);
  let timestamp = Utc::now().to_rfc3339();

  transaction.execute(
    r#"
      INSERT INTO raw_location_events (
        occurred_at, latitude, longitude, accuracy_meters, speed_mps,
        movement_state, source, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    "#,
    params![
      payload.occurred_at,
      payload.latitude,
      payload.longitude,
      payload.accuracy_meters,
      payload.speed_mps,
      movement_state,
      payload.source,
      timestamp
    ],
  )?;

  let event_id = transaction.last_insert_rowid();
  let event = get_raw_event_by_id(&transaction, event_id)?;
  update_visits_for_event(&transaction, previous_event.as_ref(), &event)?;
  derive_saved_moments(&transaction)?;

  transaction.commit()?;
  Ok(event)
}

pub fn passive_context_snapshot(db_path: &PathBuf) -> Result<PassiveContextSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  let raw_events = list_raw_events(&connection)?;
  let visits = list_visits(&connection)?;
  let repeated_places = list_repeated_places(&connection)?;
  let inferred_sleep_window = infer_sleep_window(&visits);

  Ok(PassiveContextSnapshot {
    raw_events,
    visits,
    repeated_places,
    inferred_sleep_window,
  })
}

pub fn phase_three_snapshot(db_path: &PathBuf) -> Result<PhaseThreeSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  let visits = list_visits(&connection)?;

  Ok(PhaseThreeSnapshot {
    saved_moments: list_saved_moments(&connection)?,
    rhythm_baseline: build_rhythm_baseline(&visits),
  })
}

fn parse_timezone_or_utc(timezone: &str) -> Tz {
  timezone.parse::<Tz>().unwrap_or(chrono_tz::UTC)
}

fn time_bucket_for_hour(hour: u32) -> String {
  match hour {
    0..=4 => "late_night".into(),
    5..=8 => "early_morning".into(),
    9..=11 => "morning".into(),
    12..=16 => "afternoon".into(),
    17..=20 => "evening".into(),
    _ => "night".into(),
  }
}

fn time_in_sleep_window(time_text: &str, window: &InferredSleepWindow) -> bool {
  let current = match NaiveTime::parse_from_str(time_text, "%H:%M") {
    Ok(value) => value,
    Err(_) => return false,
  };
  let start = match NaiveTime::parse_from_str(&window.start, "%H:%M") {
    Ok(value) => value,
    Err(_) => return false,
  };
  let end = match NaiveTime::parse_from_str(&window.end, "%H:%M") {
    Ok(value) => value,
    Err(_) => return false,
  };

  if start <= end {
    current >= start && current <= end
  } else {
    current >= start || current <= end
  }
}

fn find_repeated_place_for_visit(
  visit: Option<&PlaceVisit>,
  repeated_places: &[RepeatedPlaceSummary],
) -> Option<RepeatedPlaceSummary> {
  let visit = visit?;
  let context = serde_json::from_str::<serde_json::Value>(&visit.raw_context_json).ok()?;
  let lat = context.get("anchor_latitude")?.as_f64()?;
  let lng = context.get("anchor_longitude")?.as_f64()?;

  repeated_places
    .iter()
    .find(|candidate| haversine_meters(lat, lng, candidate.latitude, candidate.longitude) <= 160.0)
    .cloned()
}

fn rhythm_state_for_now(
  active_visit: Option<&PlaceVisit>,
  baseline: &[RhythmBaselineEntry],
  now: DateTime<Utc>,
) -> (String, f64) {
  let bucket = baseline.iter().find(|entry| {
    entry.day_of_week == now.weekday().num_days_from_monday() && entry.hour_bucket == now.hour()
  });

  match (active_visit, bucket) {
    (Some(visit), Some(entry)) => {
      let ratio = if entry.average_duration_seconds <= 0 {
        1.0
      } else {
        visit.duration_seconds.max(1) as f64 / entry.average_duration_seconds.max(1) as f64
      };

      if ratio >= 1.7 {
        ("outside_normal_rhythm".into(), clamp_score(0.58 + ((ratio - 1.0) * 0.16)))
      } else {
        ("within_known_rhythm".into(), clamp_score(0.45 + (entry.visit_count as f64 * 0.08)))
      }
    }
    (Some(visit), None) if visit.duration_seconds >= 20 * 60 => ("outside_normal_rhythm".into(), 0.68),
    (Some(_), None) => ("emerging_rhythm".into(), 0.42),
    (None, Some(entry)) => ("between_known_rhythms".into(), clamp_score(0.34 + (entry.visit_count as f64 * 0.05))),
    (None, None) => ("unreadable".into(), 0.2),
  }
}

fn memory_relevance_for_context(
  item: &InterpretedMemoryItem,
  evolution: Option<&MemoryEvolutionState>,
  matched_place: Option<&Place>,
  repeated_place: Option<&RepeatedPlaceSummary>,
  reflections: &[ManualReflection],
) -> f64 {
  let mut relevance = (item.salience * 0.5) + (item.confidence * 0.25);
  let item_text = format!(
    "{} {} {} {} {}",
    item.source_category_key,
    item.source_entry_title,
    item.memory_type,
    item.summary,
    item.detail
  )
  .to_ascii_lowercase();
  let item_tokens: HashSet<String> = cleaned_match_tokens(&item_text).into_iter().collect();

  if let Some(place) = matched_place {
    let place_text = format!("{} {} {} {}", place.label, place.place_kind, place.meaning_kind, place.notes)
      .to_ascii_lowercase();
    let overlaps = cleaned_match_tokens(&place_text)
      .into_iter()
      .filter(|token| item_tokens.contains(token))
      .count();
    if overlaps > 0 {
      relevance += (overlaps as f64 * 0.12).min(0.36);
    }
    if place.is_protected && matches!(item.sensitivity.as_str(), "high" | "guarded") {
      relevance += 0.18;
    }
    if place.significance_score >= 0.7 {
      relevance += 0.08;
    }
  }

  if let Some(repeated_place) = repeated_place {
    let overlaps = cleaned_match_tokens(&repeated_place.label)
      .into_iter()
      .filter(|token| item_tokens.contains(token))
      .count();
    if overlaps > 0 {
      relevance += 0.08 + (overlaps as f64 * 0.05).min(0.18);
    }
  }

  let reflection_bonus = reflections
    .iter()
    .take(8)
    .filter(|reflection| {
      cleaned_match_tokens(&reflection.text)
        .into_iter()
        .any(|token| item_tokens.contains(&token))
    })
    .count();
  if reflection_bonus > 0 {
    relevance += (reflection_bonus as f64 * 0.07).min(0.21);
  }

  if let Some(evolution) = evolution {
    relevance += evolution.phase_shift_score * 0.18;
    if matches!(evolution.current_status.as_str(), "conflicted" | "questioned") {
      relevance += 0.1;
    }
  }

  clamp_score(relevance)
}

fn aggregate_detector_pressures(detectors: &[DetectorRecord]) -> Vec<LivedMomentDetectorPressure> {
  let mut grouped: HashMap<String, Vec<&DetectorRecord>> = HashMap::new();
  for detector in detectors {
    grouped.entry(detector.detector_type.clone()).or_default().push(detector);
  }

  let mut pressures = grouped
    .into_iter()
    .map(|(detector_type, records)| {
      let total_strength = clamp_score(records.iter().map(|record| record.strength).sum::<f64>());
      let average_confidence =
        records.iter().map(|record| record.confidence).sum::<f64>() / records.len().max(1) as f64;
      let summary = records
        .iter()
        .max_by(|left, right| left.strength.total_cmp(&right.strength))
        .map(|record| record.summary.clone())
        .unwrap_or_default();

      LivedMomentDetectorPressure {
        detector_type,
        total_strength,
        average_confidence: clamp_score(average_confidence),
        sample_count: records.len(),
        summary,
      }
    })
    .collect::<Vec<_>>();

  pressures.sort_by(|left, right| right.total_strength.total_cmp(&left.total_strength));
  pressures
}

fn push_assessment(
  assessments: &mut Vec<LivedMomentAssessment>,
  kind: &str,
  score: f64,
  confidence: f64,
  summary: impl Into<String>,
  evidence: Vec<String>,
) {
  if score < 0.45 {
    return;
  }

  assessments.push(LivedMomentAssessment {
    kind: kind.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    summary: summary.into(),
    evidence,
  });
}

fn assessment_score(assessments: &[LivedMomentAssessment], kind: &str) -> f64 {
  assessments
    .iter()
    .find(|assessment| assessment.kind == kind)
    .map(|assessment| assessment.score)
    .unwrap_or(0.0)
}

fn push_signal(
  signals: &mut Vec<LivedMomentSignal>,
  kind: &str,
  score: f64,
  confidence: f64,
  reason: impl Into<String>,
) {
  if score < 0.45 {
    return;
  }

  signals.push(LivedMomentSignal {
    kind: kind.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    reason: reason.into(),
  });
}

fn push_opportunity(
  opportunities: &mut Vec<LivedMomentOpportunity>,
  kind: &str,
  score: f64,
  confidence: f64,
  timing: &str,
  summary: impl Into<String>,
) {
  if score < 0.45 {
    return;
  }

  opportunities.push(LivedMomentOpportunity {
    kind: kind.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    timing: timing.into(),
    summary: summary.into(),
  });
}

fn push_safeguard(
  safeguards: &mut Vec<LivedMomentSafeguard>,
  kind: &str,
  score: f64,
  confidence: f64,
  urgency: &str,
  summary: impl Into<String>,
) {
  if score < 0.45 {
    return;
  }

  safeguards.push(LivedMomentSafeguard {
    kind: kind.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    urgency: urgency.into(),
    summary: summary.into(),
  });
}

fn push_contact_rhythm_option(
  options: &mut Vec<LivedMomentContactRhythmOption>,
  level: &str,
  score: f64,
  confidence: f64,
  reason: impl Into<String>,
) {
  if score < 0.35 {
    return;
  }

  options.push(LivedMomentContactRhythmOption {
    level: level.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    reason: reason.into(),
  });
}

fn push_situational_signal(
  signals: &mut Vec<LivedMomentSituationalSignal>,
  kind: &str,
  score: f64,
  confidence: f64,
  direction: &str,
  summary: impl Into<String>,
) {
  if score < 0.4 {
    return;
  }

  signals.push(LivedMomentSituationalSignal {
    kind: kind.into(),
    score: clamp_score(score),
    confidence: clamp_score(confidence),
    direction: direction.into(),
    summary: summary.into(),
  });
}

fn build_lived_moment_snapshot(
  connection: &Connection,
  timezone: &str,
  now: DateTime<Utc>,
) -> Result<LivedMomentSnapshot, AppError> {
  let places = list_places(connection)?;
  let reflections = list_reflections(connection)?;
  let raw_events = list_raw_events(connection)?;
  let visits = list_visits(connection)?;
  let repeated_places = list_repeated_places(connection)?;
  let saved_moments = list_saved_moments(connection)?;
  let outreach_events = list_outreach_events(connection)?;
  let call_sessions = list_call_sessions(connection)?;
  let memory_items = list_interpreted_memory_items(connection)?;
  let evolution_states = list_memory_evolution_states(connection)?;
  let detector_records = list_detector_records(connection)?;
  let context_sections = build_companion_context_snapshot_with_filter(connection, true)?;
  let sleep_window = infer_sleep_window(&visits);
  let rhythm_baseline = build_rhythm_baseline(&visits);

  let latest_location_event = raw_events.first().cloned();
  let active_visit = visits
    .iter()
    .find(|visit| visit.departure_mode == "unknown")
    .cloned()
    .or_else(|| visits.first().cloned());
  let matched_place = active_visit
    .as_ref()
    .and_then(|visit| visit.place_id)
    .and_then(|place_id| places.iter().find(|place| place.id == place_id).cloned())
    .or_else(|| {
      latest_location_event.as_ref().and_then(|event| {
        places
          .iter()
          .find(|place| {
            if let (Some(lat), Some(lng)) = (place.latitude, place.longitude) {
              haversine_meters(lat, lng, event.latitude, event.longitude) <= place.radius_meters as f64
            } else {
              false
            }
          })
          .cloned()
      })
    });
  let repeated_place = find_repeated_place_for_visit(active_visit.as_ref(), &repeated_places);

  let timezone = parse_timezone_or_utc(timezone);
  let timezone_name = timezone.to_string();
  let local_now = now.with_timezone(&timezone);
  let local_time = local_now.format("%H:%M").to_string();
  let local_date = local_now.format("%Y-%m-%d").to_string();
  let local_day_of_week = local_now.format("%A").to_string();
  let time_bucket = time_bucket_for_hour(local_now.hour());
  let is_likely_sleep_window = time_in_sleep_window(&local_time, &sleep_window);
  let (rhythm_state, rhythm_confidence) = rhythm_state_for_now(active_visit.as_ref(), &rhythm_baseline, now);

  let evolution_by_memory_id = evolution_states
    .iter()
    .map(|state| (state.memory_item_id, state))
    .collect::<HashMap<_, _>>();

  let mut related_memories = memory_items
    .iter()
    .filter(|item| item.archived_at.is_none())
    .filter_map(|item| {
      let evolution = evolution_by_memory_id.get(&item.id).copied();
      let relevance = memory_relevance_for_context(
        item,
        evolution,
        matched_place.as_ref(),
        repeated_place.as_ref(),
        &reflections,
      );

      if relevance < 0.5 {
        return None;
      }

      Some(LivedMomentMemoryInfluence {
        memory_item_id: item.id,
        memory_key: item.memory_key.clone(),
        memory_type: item.memory_type.clone(),
        summary: item.summary.clone(),
        confidence: item.confidence,
        salience: item.salience,
        relevance_score: relevance,
        sensitivity: item.sensitivity.clone(),
        current_status: evolution.map(|state| state.current_status.clone()),
        phase_shift_state: evolution.map(|state| state.phase_shift_state.clone()),
        phase_shift_score: evolution.map(|state| state.phase_shift_score),
      })
    })
    .collect::<Vec<_>>();
  related_memories.sort_by(|left, right| right.relevance_score.total_cmp(&left.relevance_score));
  related_memories.truncate(6);

  let detector_pressures = aggregate_detector_pressures(&detector_records);
  let detector_pressure_map = detector_pressures
    .iter()
    .map(|pressure| (pressure.detector_type.as_str(), pressure.total_strength))
    .collect::<HashMap<_, _>>();

  let dominant_phase = evolution_states
    .iter()
    .max_by(|left, right| left.phase_shift_score.total_cmp(&right.phase_shift_score));
  let dominant_phase_shift_state = dominant_phase
    .map(|state| state.phase_shift_state.clone())
    .unwrap_or_else(|| "stable".into());
  let dominant_phase_shift_score = dominant_phase.map(|state| state.phase_shift_score).unwrap_or(0.0);
  let dominant_phase_shift_summary = dominant_phase
    .map(|state| state.phase_shift_summary.clone())
    .unwrap_or_else(|| "No meaningful phase movement has been recorded yet.".into());

  let protective_pressure = detector_pressure_map.get("protection").copied().unwrap_or(0.0);
  let tension_pressure = detector_pressure_map.get("tension").copied().unwrap_or(0.0);
  let drift_pressure = detector_pressure_map.get("drift").copied().unwrap_or(0.0);
  let emergence_pressure = detector_pressure_map.get("emergence").copied().unwrap_or(0.0);
  let reinforcement_pressure = detector_pressure_map.get("reinforcement").copied().unwrap_or(0.0);
  let volatility_pressure = detector_pressure_map.get("volatility").copied().unwrap_or(0.0);

  let has_sensitive_memory = related_memories
    .iter()
    .any(|memory| matches!(memory.sensitivity.as_str(), "high" | "guarded"));
  let meaningful_place_score = matched_place
    .as_ref()
    .map(|place| place.significance_score)
    .or_else(|| repeated_place.as_ref().map(|place| clamp_score(0.3 + (place.visit_count as f64 * 0.07))))
    .unwrap_or(0.0);
  let place_kind = matched_place
    .as_ref()
    .map(|place| format!("{} {}", place.place_kind, place.meaning_kind).to_ascii_lowercase())
    .unwrap_or_default();
  let reflection_text = reflections
    .iter()
    .take(8)
    .map(|reflection| reflection.text.to_ascii_lowercase())
    .collect::<Vec<_>>()
    .join(" ");
  let relational_entries = context_sections
    .iter()
    .filter(|section| matches!(section.category.key.as_str(), "friends" | "family" | "pet"))
    .flat_map(|section| section.entries.iter().cloned())
    .collect::<Vec<_>>();
  let recent_saved_moments = saved_moments.iter().take(6).cloned().collect::<Vec<_>>();
  let recent_sent_24h = outreach_events
    .iter()
    .filter(|event| timestamp_in_window(&event.created_at, now - Duration::hours(24)))
    .count();
  let recent_sent_72h = outreach_events
    .iter()
    .filter(|event| timestamp_in_window(&event.created_at, now - Duration::hours(72)))
    .count();
  let recent_calls_7d = call_sessions
    .iter()
    .filter(|session| {
      session
        .ended_at
        .as_deref()
        .or(session.started_at.as_deref())
        .map(|value| timestamp_in_window(value, now - Duration::days(7)))
        .unwrap_or(false)
    })
    .count();
  let recent_contact_load = clamp_score(
    recent_sent_24h as f64 * 0.28 + recent_sent_72h as f64 * 0.12 + recent_calls_7d as f64 * 0.16,
  );
  let recent_contact_state = if recent_contact_load >= 0.7 {
    "recently_active"
  } else if recent_contact_load >= 0.4 {
    "recently_touched"
  } else {
    "contact_light"
  }
  .to_string();
  let recent_contact_summary = format!(
    "{} outreach events in 24h, {} in 72h, {} call sessions in 7d.",
    recent_sent_24h, recent_sent_72h, recent_calls_7d
  );
  let protected_time_active = is_in_protected_quiet_time(
    &AppSettings {
      timezone: timezone_name.clone(),
      sleep_window_start: sleep_window.start.clone(),
      sleep_window_end: sleep_window.end.clone(),
      ..AppSettings::default()
    },
    &list_rules(connection)?,
    now,
  )
  .unwrap_or(is_likely_sleep_window);

  let mut assessments = Vec::new();

  let exploratory_score = clamp_score(
    if latest_location_event
      .as_ref()
      .map(|event| event.movement_state == "moving")
      .unwrap_or(false)
    {
      0.28
    } else {
      0.0
    } + if rhythm_state == "outside_normal_rhythm" { 0.24 } else { 0.0 }
      + if matched_place.is_none() { 0.12 } else { 0.0 }
      + if text_has_any_keyword(&place_kind, &["reflection", "park", "walk", "travel", "explore"]) {
        0.16
      } else {
        0.0
      }
      + emergence_pressure * 0.15,
  );
  push_assessment(
    &mut assessments,
    "exploratory",
    exploratory_score,
    clamp_score(0.48 + emergence_pressure * 0.2 + rhythm_confidence * 0.2),
    "The user appears to be moving through a less-routine or more exploratory slice of life right now.",
    vec![
      format!("Rhythm state is '{}'.", rhythm_state),
      latest_location_event
        .as_ref()
        .map(|event| format!("Latest movement state is '{}'.", event.movement_state))
        .unwrap_or_else(|| "No recent location event exists yet.".into()),
    ],
  );

  let open_score = clamp_score(
    reinforcement_pressure * 0.24
      + emergence_pressure * 0.18
      + if text_has_any_keyword(&reflection_text, &["open", "alive", "curious", "possibility", "light"]) {
        0.28
      } else {
        0.0
      }
      + meaningful_place_score * 0.2
      + if protective_pressure < 0.45 && tension_pressure < 0.45 { 0.12 } else { 0.0 },
  );
  push_assessment(
    &mut assessments,
    "open",
    open_score,
    clamp_score(0.44 + reinforcement_pressure * 0.2 + meaningful_place_score * 0.15),
    "The moment has signs of openness rather than closure or contraction.",
    vec![
      if meaningful_place_score > 0.0 {
        format!("The current place carries meaning score {:.2}.", meaningful_place_score)
      } else {
        "The current place has not yet accumulated strong meaning.".into()
      },
      if text_has_any_keyword(&reflection_text, &["open", "alive", "curious", "possibility", "light"]) {
        "Recent reflections contain open or alive language.".into()
      } else {
        "Recent reflections do not explicitly name openness.".into()
      },
    ],
  );

  let vulnerable_score = clamp_score(
    protective_pressure * 0.34
      + tension_pressure * 0.22
      + if has_sensitive_memory { 0.22 } else { 0.0 }
      + if is_likely_sleep_window { 0.1 } else { 0.0 }
      + if text_has_any_keyword(&reflection_text, &["fragile", "tender", "raw", "overwhelmed", "lonely"]) {
        0.18
      } else {
        0.0
      },
  );
  push_assessment(
    &mut assessments,
    "vulnerable",
    vulnerable_score,
    clamp_score(0.5 + protective_pressure * 0.18 + tension_pressure * 0.14),
    "The moment looks emotionally or situationally exposed and may need care.",
    vec![
      format!("Protection pressure is {:.2}.", protective_pressure),
      format!("Tension pressure is {:.2}.", tension_pressure),
    ],
  );

  let protective_score = clamp_score(
    protective_pressure * 0.36
      + if matched_place.as_ref().map(|place| place.is_protected).unwrap_or(false) {
        0.28
      } else {
        0.0
      }
      + if is_likely_sleep_window { 0.2 } else { 0.0 }
      + if has_sensitive_memory { 0.12 } else { 0.0 },
  );
  push_assessment(
    &mut assessments,
    "protective",
    protective_score,
    clamp_score(0.52 + protective_pressure * 0.2),
    "The moment is shaped by boundaries, care, or the need not to intrude bluntly.",
    vec![
      if is_likely_sleep_window {
        "Local time sits inside the inferred sleep window.".into()
      } else {
        "Local time is outside the inferred sleep window.".into()
      },
      matched_place
        .as_ref()
        .map(|place| format!("Matched place '{}' protected={}.", place.label, place.is_protected))
        .unwrap_or_else(|| "No protected place is currently matched.".into()),
    ],
  );

  let connective_score = clamp_score(
    if text_has_any_keyword(&place_kind, &["family", "belonging", "friend", "community"]) {
      0.28
    } else {
      0.0
    } + if text_has_any_keyword(&reflection_text, &["friend", "family", "someone", "reach out", "miss"]) {
      0.24
    } else {
      0.0
    } + reinforcement_pressure * 0.12
      + meaningful_place_score * 0.14,
  );
  push_assessment(
    &mut assessments,
    "connective",
    connective_score,
    clamp_score(0.42 + meaningful_place_score * 0.2),
    "The moment carries signs that human connection may fit it.",
    vec![
      if text_has_any_keyword(&place_kind, &["family", "belonging", "friend", "community"]) {
        "The current place meaning leans relational.".into()
      } else {
        "The current place meaning is not explicitly relational.".into()
      },
      if text_has_any_keyword(&reflection_text, &["friend", "family", "someone", "reach out", "miss"]) {
        "Recent reflections point toward contact or missing someone.".into()
      } else {
        "Recent reflections do not strongly point toward contact.".into()
      },
    ],
  );

  let opportunity_score = clamp_score(
    exploratory_score * 0.28
      + open_score * 0.28
      + meaningful_place_score * 0.18
      + if rhythm_state == "outside_normal_rhythm" { 0.12 } else { 0.0 }
      + if !is_likely_sleep_window { 0.08 } else { 0.0 },
  );
  push_assessment(
    &mut assessments,
    "opportunity-rich",
    opportunity_score,
    clamp_score(0.46 + exploratory_score * 0.15 + open_score * 0.15),
    "The moment looks like it could be widened or enriched before it closes.",
    vec![
      format!("Exploratory score is {:.2}.", exploratory_score),
      format!("Open score is {:.2}.", open_score),
    ],
  );

  let transition_score = clamp_score(
    dominant_phase_shift_score * 0.36
      + drift_pressure * 0.22
      + volatility_pressure * 0.18
      + tension_pressure * 0.14
      + if drift_pressure >= 0.75 && tension_pressure >= 0.6 {
        0.14
      } else {
        0.0
      },
  );
  push_assessment(
    &mut assessments,
    "transition-heavy",
    transition_score,
    clamp_score(0.48 + dominant_phase_shift_score * 0.22),
    "The moment sits inside a broader movement, threshold, or wobble rather than simple routine.",
    vec![
      format!("Dominant phase shift state is '{}'.", dominant_phase_shift_state),
      dominant_phase_shift_summary.clone(),
    ],
  );

  let urgent_score = clamp_score(
    protective_pressure * 0.24
      + tension_pressure * 0.22
      + volatility_pressure * 0.18
      + if text_has_any_keyword(&reflection_text, &["urgent", "danger", "panic", "unsafe", "now"]) {
        0.3
      } else {
        0.0
      },
  );
  push_assessment(
    &mut assessments,
    "urgent",
    urgent_score,
    clamp_score(0.45 + protective_pressure * 0.18 + volatility_pressure * 0.18),
    "The moment carries enough immediate pressure that waiting may be costly.",
    vec![
      format!("Volatility pressure is {:.2}.", volatility_pressure),
      if text_has_any_keyword(&reflection_text, &["urgent", "danger", "panic", "unsafe", "now"]) {
        "Recent reflections contain explicit urgency language.".into()
      } else {
        "No explicit urgency language appears in recent reflections.".into()
      },
    ],
  );

  if assessments.is_empty() {
    assessments.push(LivedMomentAssessment {
      kind: "ordinary".into(),
      score: 0.62,
      confidence: 0.58,
      summary: "Nothing currently points strongly toward intervention, enrichment, or protection.".into(),
      evidence: vec![
        "No assessment crossed the action-shaping threshold yet.".into(),
        "This moment should stay mostly quiet until clearer evidence arrives.".into(),
      ],
    });
  }

  assessments.sort_by(|left, right| right.score.total_cmp(&left.score));
  let primary_assessment = assessments
    .first()
    .map(|assessment| assessment.kind.clone())
    .unwrap_or_else(|| "ordinary".into());

  let open_assessment = assessment_score(&assessments, "open");
  let exploratory_assessment = assessment_score(&assessments, "exploratory");
  let vulnerable_assessment = assessment_score(&assessments, "vulnerable");
  let urgent_assessment = assessment_score(&assessments, "urgent");
  let protective_assessment = assessment_score(&assessments, "protective");
  let connective_assessment = assessment_score(&assessments, "connective");
  let opportunity_assessment = assessment_score(&assessments, "opportunity-rich");
  let transition_assessment = assessment_score(&assessments, "transition-heavy");

  let mut actionable_signals = Vec::new();
  push_signal(
    &mut actionable_signals,
    "enrich_this_moment",
    clamp_score(
      opportunity_assessment * 0.48
        + open_assessment * 0.22
        + exploratory_assessment * 0.18
        + if !is_likely_sleep_window { 0.08 } else { 0.0 }
        + meaningful_place_score * 0.1
        - protective_assessment * 0.12,
    ),
    clamp_score(0.46 + opportunity_assessment * 0.16 + open_assessment * 0.12),
    "The moment carries enough openness and possibility to justify gentle enrichment.",
  );
  push_signal(
    &mut actionable_signals,
    "surface_this_opening",
    clamp_score(
      connective_assessment * 0.32
        + opportunity_assessment * 0.28
        + exploratory_assessment * 0.16
        + if repeated_place.is_some() || meaningful_place_score >= 0.7 { 0.12 } else { 0.0 }
        + reinforcement_pressure * 0.08,
    ),
    clamp_score(0.44 + connective_assessment * 0.14 + opportunity_assessment * 0.14),
    "There is a practical or relational opening that may matter if surfaced in time.",
  );
  push_signal(
    &mut actionable_signals,
    "warn_now",
    clamp_score(
      urgent_assessment * 0.58
        + protective_assessment * 0.2
        + vulnerable_assessment * 0.14
        + volatility_pressure * 0.08,
    ),
    clamp_score(0.5 + urgent_assessment * 0.18 + protective_assessment * 0.14),
    "The moment looks pressured enough that warning or escalation should be considered now.",
  );
  push_signal(
    &mut actionable_signals,
    "watch_for_escalation",
    clamp_score(
      transition_assessment * 0.34
        + vulnerable_assessment * 0.24
        + urgent_assessment * 0.2
        + tension_pressure * 0.12
        + dominant_phase_shift_score * 0.08,
    ),
    clamp_score(0.45 + transition_assessment * 0.16 + vulnerable_assessment * 0.12),
    "Pressure is accumulating, but the moment still looks like something to monitor rather than force.",
  );
  push_signal(
    &mut actionable_signals,
    "stay_quiet",
    if primary_assessment == "ordinary" {
      0.82
    } else if is_likely_sleep_window && urgent_assessment < 0.55 {
      0.72
    } else if protective_assessment >= 0.62 && urgent_assessment < 0.55 {
      0.61
    } else {
      0.0
    },
    0.64,
    "The current read does not yet justify intervening more strongly than silence.",
  );

  if actionable_signals.is_empty() {
    actionable_signals.push(LivedMomentSignal {
      kind: "stay_quiet".into(),
      score: 0.7,
      confidence: 0.62,
      reason: "No stronger action signal is grounded enough yet.".into(),
    });
  }
  actionable_signals.sort_by(|left, right| right.score.total_cmp(&left.score));
  let recommended_signal = actionable_signals
    .first()
    .map(|signal| signal.kind.clone())
    .unwrap_or_else(|| "stay_quiet".into());

  let mut opportunities = Vec::new();
  push_opportunity(
    &mut opportunities,
    "enrichment_window",
    clamp_score(opportunity_assessment * 0.52 + open_assessment * 0.24 + meaningful_place_score * 0.14),
    clamp_score(0.46 + opportunity_assessment * 0.18),
    if time_bucket == "late_night" || time_bucket == "night" { "soon" } else { "now" },
    "This moment could be widened gently before the opening closes.",
  );
  push_opportunity(
    &mut opportunities,
    "place_based_opening",
    clamp_score(
      meaningful_place_score * 0.42
        + exploratory_assessment * 0.22
        + if matched_place.is_some() { 0.16 } else { 0.0 }
        + if repeated_place.is_some() { 0.1 } else { 0.0 },
    ),
    clamp_score(0.44 + meaningful_place_score * 0.2),
    "now",
    "The current place itself may hold meaning or possibility worth surfacing while the user is still in it.",
  );
  push_opportunity(
    &mut opportunities,
    "relational_opening",
    clamp_score(connective_assessment * 0.5 + opportunity_assessment * 0.18 + reinforcement_pressure * 0.12),
    clamp_score(0.42 + connective_assessment * 0.22),
    if is_likely_sleep_window { "later" } else { "soon" },
    "There may be a timely human-contact opening here if approached gently.",
  );
  opportunities.sort_by(|left, right| right.score.total_cmp(&left.score));

  let mut safeguards = Vec::new();
  push_safeguard(
    &mut safeguards,
    "protect_quiet_window",
    if protected_time_active {
      0.82
    } else if primary_assessment == "ordinary" || recommended_signal == "stay_quiet" {
      0.72
    } else {
      clamp_score(protective_assessment * 0.38 + vulnerable_assessment * 0.16)
    },
    0.68,
    "low",
    "The current window looks like one to protect from unnecessary intrusion.",
  );
  push_safeguard(
    &mut safeguards,
    "sensitive_context",
    clamp_score(protective_assessment * 0.34 + vulnerable_assessment * 0.28 + if has_sensitive_memory { 0.18 } else { 0.0 }),
    clamp_score(0.48 + protective_assessment * 0.16),
    if urgent_assessment >= 0.55 { "medium" } else { "low" },
    "The moment carries enough sensitivity that pacing and tone matter more than assertiveness.",
  );
  push_safeguard(
    &mut safeguards,
    "escalation_watch",
    clamp_score(urgent_assessment * 0.42 + transition_assessment * 0.18 + volatility_pressure * 0.2 + tension_pressure * 0.12),
    clamp_score(0.48 + urgent_assessment * 0.18 + volatility_pressure * 0.12),
    if urgent_assessment >= 0.7 { "high" } else { "medium" },
    "Pressure is high enough that the system should keep watching for a need to warn or escalate.",
  );
  safeguards.sort_by(|left, right| right.score.total_cmp(&left.score));

  let mut situational_signals = Vec::new();
  push_situational_signal(
    &mut situational_signals,
    "protected_quiet_hours",
    if protected_time_active { 0.88 } else { 0.0 },
    0.82,
    "protective",
    "Protected quiet hours are active, so restraint matters more than momentum.",
  );
  push_situational_signal(
    &mut situational_signals,
    "late_night_movement",
    if matches!(time_bucket.as_str(), "night" | "late_night")
      && latest_location_event
        .as_ref()
        .map(|event| event.movement_state == "moving")
        .unwrap_or(false)
    {
      0.72
    } else {
      0.0
    },
    0.68,
    "protective",
    "Movement late at night raises the situational need for caution and pacing.",
  );
  push_situational_signal(
    &mut situational_signals,
    "meaningful_place_window",
    clamp_score(
      meaningful_place_score * 0.46
        + if matched_place.is_some() && !is_likely_sleep_window { 0.16 } else { 0.0 }
        + if time_bucket == "evening" { 0.12 } else { 0.0 },
    ),
    clamp_score(0.48 + meaningful_place_score * 0.18),
    "opportunity",
    "The current place and timing create a live window where meaning could still be acted on.",
  );
  push_situational_signal(
    &mut situational_signals,
    "outside_routine_window",
    clamp_score(
      if rhythm_state == "outside_normal_rhythm" { 0.54 } else { 0.0 }
        + exploratory_assessment * 0.16
        + transition_assessment * 0.1,
    ),
    clamp_score(0.46 + rhythm_confidence * 0.2),
    "opportunity",
    "The user is outside usual rhythm, which can open both possibility and instability.",
  );
  push_situational_signal(
    &mut situational_signals,
    "contact_air_gap",
    clamp_score(
      if recent_contact_load <= 0.18 { 0.52 } else { 0.0 }
        + connective_assessment * 0.14,
    ),
    0.58,
    "opportunity",
    "Recent contact has been light enough that a timely message or bridge may land cleanly.",
  );
  push_situational_signal(
    &mut situational_signals,
    "active_contact_cooldown",
    clamp_score(if recent_contact_load >= 0.7 { 0.78 } else { recent_contact_load * 0.82 }),
    clamp_score(0.52 + recent_contact_load * 0.16),
    "protective",
    "Recent contact load is already high, so another touch could feel heavier than intended.",
  );
  situational_signals.sort_by(|left, right| right.score.total_cmp(&left.score));
  let top_bridge_seed = relational_entries
    .iter()
    .filter_map(|entry| {
      let title_lower = entry.title.to_ascii_lowercase();
      let entry_blob = format!(
        "{} {} {} {}",
        entry.title,
        entry.body,
        entry.notes,
        entry.tags.join(" ")
      )
      .to_ascii_lowercase();
      let direct_match_score = if reflection_text.contains(&title_lower) {
        0.34
      } else {
        0.0
      };
      let memory_match_score = if memory_items.iter().any(|item| {
        item.source_ref_id == Some(entry.id)
          || item.source_entry_title.eq_ignore_ascii_case(&entry.title)
      }) {
        0.22
      } else {
        0.0
      };
      let supportive_profile_score = if text_has_any_keyword(
        &entry_blob,
        &["support", "trust", "close", "safe", "anchor", "family", "friend", "call"],
      ) {
        0.16
      } else {
        0.0
      };
      let score = clamp_score(
        direct_match_score
          + memory_match_score
          + supportive_profile_score
          + connective_assessment * 0.24
          + vulnerable_assessment * 0.18
          + opportunity_assessment * 0.1
          + if entry.category_key == "family" && protective_assessment >= 0.55 {
            0.08
          } else {
            0.0
          }
          - recent_contact_load * 0.08,
      );
      if score < 0.45 {
        return None;
      }

      let bridge_kind = if urgent_assessment >= 0.6 || vulnerable_assessment >= 0.55 {
        "supportive_reach"
      } else if transition_assessment >= 0.55 {
        "orientation_anchor"
      } else {
        "light_reconnect"
      };

      Some(LivedMomentRelationalBridge {
        title: entry.title.clone(),
        category_key: entry.category_key.clone(),
        score,
        confidence: clamp_score(0.44 + direct_match_score + memory_match_score * 0.5),
        bridge_kind: bridge_kind.into(),
        recent_contact_state: recent_contact_state.clone(),
        reason: if direct_match_score > 0.0 {
          format!("Recent reflections explicitly point toward {}.", entry.title)
        } else if memory_match_score > 0.0 {
          format!("{} is already anchored in living context and memory.", entry.title)
        } else {
          format!("{} looks like a fitting relational anchor for this moment.", entry.title)
        },
      })
    })
    .collect::<Vec<_>>();
  let mut relational_bridges = top_bridge_seed;
  relational_bridges.sort_by(|left, right| right.score.total_cmp(&left.score));
  relational_bridges.truncate(5);
  let top_bridge_score = relational_bridges.first().map(|bridge| bridge.score).unwrap_or(0.0);

  let mut contact_rhythm_options = Vec::new();
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "stay_silent",
    if primary_assessment == "ordinary" {
      if top_bridge_score >= 0.55 && recent_contact_load < 0.55 {
        0.56
      } else {
        0.82
      }
    } else {
      clamp_score(
        protective_assessment * 0.24
          + recent_contact_load * 0.28
          + if is_likely_sleep_window && urgent_assessment < 0.55 {
            0.24
          } else {
            0.0
          }
          + if recommended_signal == "stay_quiet" { 0.18 } else { 0.0 },
      )
    },
    0.66,
    "The moment still looks best served by restraint rather than direct contact.",
  );
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "send_light_message",
    clamp_score(
      opportunity_assessment * 0.3
        + open_assessment * 0.2
        + connective_assessment * 0.14
        + if recent_contact_load < 0.45 { 0.18 } else { 0.0 }
        + if !is_likely_sleep_window { 0.1 } else { 0.0 },
    ),
    clamp_score(0.44 + open_assessment * 0.12 + opportunity_assessment * 0.14),
    "A light-touch message looks proportionate to the moment and the recent contact load.",
  );
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "make_soft_suggestion",
    clamp_score(
      exploratory_assessment * 0.18
        + opportunity_assessment * 0.26
        + transition_assessment * 0.22
        + situational_signals
          .iter()
          .find(|signal| signal.kind == "outside_routine_window")
          .map(|signal| signal.score * 0.08)
          .unwrap_or(0.0)
        + if !is_likely_sleep_window { 0.08 } else { 0.0 }
        - recent_contact_load * 0.08,
    ),
    clamp_score(0.42 + transition_assessment * 0.12 + opportunity_assessment * 0.14),
    "The system can likely suggest without pushing if it keeps the tone quiet and optional.",
  );
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "suggest_human_contact",
    clamp_score(
      top_bridge_score * 0.42
        + connective_assessment * 0.22
        + vulnerable_assessment * 0.16
        + if top_bridge_score >= 0.55 && recent_contact_load < 0.55 {
          0.18
        } else {
          0.0
        }
        + if recent_contact_load < 0.55 { 0.12 } else { 0.0 },
    ),
    clamp_score(0.44 + top_bridge_score * 0.2 + connective_assessment * 0.12),
    "A specific human bridge looks plausible enough to surface gently now.",
  );
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "send_warning",
    clamp_score(
      urgent_assessment * 0.52
        + safeguards.first().map(|item| item.score).unwrap_or(0.0) * 0.18
        + protective_assessment * 0.1,
    ),
    clamp_score(0.48 + urgent_assessment * 0.18),
    "The moment carries enough pressure that a warning-level contact may be justified.",
  );
  push_contact_rhythm_option(
    &mut contact_rhythm_options,
    "escalate_to_call",
    clamp_score(
      urgent_assessment * 0.58
        + vulnerable_assessment * 0.16
        + if recent_calls_7d == 0 { 0.1 } else { 0.0 }
        + if top_bridge_score >= 0.6 { 0.08 } else { 0.0 },
    ),
    clamp_score(0.5 + urgent_assessment * 0.16 + vulnerable_assessment * 0.1),
    "The pressure looks high enough that a live call path may fit better than text.",
  );
  contact_rhythm_options.sort_by(|left, right| right.score.total_cmp(&left.score));
  let recommended_contact_mode = contact_rhythm_options
    .first()
    .map(|option| option.level.clone())
    .unwrap_or_else(|| "stay_silent".into());

  let contact_rhythm_hint = if recommended_contact_mode == "escalate_to_call"
    || recommended_contact_mode == "send_warning"
    || primary_assessment == "urgent"
  {
    "warn_or_escalate"
  } else if recommended_contact_mode == "suggest_human_contact" || primary_assessment == "connective" {
    "gentle_bridge"
  } else if recommended_contact_mode == "make_soft_suggestion" || primary_assessment == "transition-heavy" {
    "orient_softly"
  } else if recommended_contact_mode == "send_light_message"
    || primary_assessment == "opportunity-rich"
    || primary_assessment == "open"
    || primary_assessment == "exploratory"
  {
    "light_suggestion"
  } else if primary_assessment == "protective" || primary_assessment == "vulnerable" {
    "move_gently"
  } else {
    "stay_quiet"
  }
  .to_string();

  let action_bias = match primary_assessment.as_str() {
    "urgent" | "protective" => "protect_now",
    "vulnerable" => "protect_softly",
    "connective" => "bridge",
    "transition-heavy" => "orient",
    "opportunity-rich" | "open" | "exploratory" => "enrich",
    _ => "watchful_silence",
  }
  .to_string();

  let summary = match primary_assessment.as_str() {
    "urgent" => "This moment looks urgent enough that the companion should be prepared to warn or escalate.".into(),
    "protective" => "This moment should be handled protectively, with respect for boundaries and timing.".into(),
    "vulnerable" => "This moment looks vulnerable and calls for gentleness over force.".into(),
    "connective" => "This moment leans relational and may be a fit for careful bridging.".into(),
    "transition-heavy" => "This moment reads as part of a larger life shift and benefits from orientation.".into(),
    "opportunity-rich" => "This moment contains unusual opening energy and may reward timely enrichment.".into(),
    "open" => "This moment feels open enough to widen carefully without hijacking it.".into(),
    "exploratory" => "This moment appears exploratory and should be met with light, non-closing companionship.".into(),
    _ => "This moment currently reads as ordinary, so restraint is more appropriate than intervention.".into(),
  };

  Ok(LivedMomentSnapshot {
    captured_at: now.to_rfc3339(),
    timezone: timezone_name,
    local_time,
    local_date,
    local_day_of_week,
    time_bucket,
    is_likely_sleep_window,
    rhythm_state,
    rhythm_confidence,
    latest_location_event,
    active_visit,
    matched_place,
    repeated_place,
    recent_saved_moments,
    related_memories,
    detector_pressures,
    dominant_phase_shift_state,
    dominant_phase_shift_score,
    dominant_phase_shift_summary,
    assessments,
    actionable_signals,
    opportunities,
    safeguards,
    situational_signals,
    relational_bridges,
    contact_rhythm_options,
    primary_assessment,
    recommended_signal,
    contact_rhythm_hint,
    recommended_contact_mode,
    recent_contact_load,
    recent_contact_summary,
    action_bias,
    summary,
  })
}

pub fn lived_moment_snapshot(
  db_path: &PathBuf,
  timezone: &str,
) -> Result<LivedMomentSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  build_lived_moment_snapshot(&connection, timezone, Utc::now())
}

pub fn decision_snapshot(db_path: &PathBuf) -> Result<DecisionSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  Ok(DecisionSnapshot {
    decisions: list_moment_decisions(&connection)?,
    outreach_events: list_outreach_events(&connection)?,
  })
}

pub fn call_session_snapshot(
  db_path: &PathBuf,
  runtime_active_session_id: Option<i64>,
) -> Result<CallSessionSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  build_call_session_snapshot(&connection, runtime_active_session_id)
}

pub fn mvp_reality_check_snapshot(
  db_path: &PathBuf,
) -> Result<MvpRealityCheckSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  build_mvp_reality_check_snapshot(&connection)
}

pub fn seed_mvp_reality_check_scenario(
  db_path: &PathBuf,
) -> Result<MvpRealityCheckSnapshot, AppError> {
  let mut connection = Connection::open(db_path)?;

  if let Ok(existing) = connection.query_row(
    "SELECT value_json FROM settings WHERE key = 'mvp_reality_check_seeded_at'",
    [],
    |row| row.get::<_, String>(0),
  ) {
    if !existing.trim().is_empty() {
      return build_mvp_reality_check_snapshot(&connection);
    }
  }

  let park_place = create_reality_check_place(
    db_path,
    "Reality Check Bench",
    52.3642,
    4.8991,
    "reflection",
    "reflection",
    false,
    "A calm place used for the MVP reality-check scenario.",
  )?;

  let _family_place = create_reality_check_place(
    db_path,
    "Reality Check Family Stop",
    52.3676,
    4.9041,
    "family",
    "belonging",
    false,
    "A meaningful visit used to exercise departure drafting.",
  )?;

  create_reality_check_reflection(
    db_path,
    "week_state",
    "This week feels heavy in a quiet way.",
  )?;

  let scenario_events = vec![
    ("2026-03-02T18:00:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-02T18:35:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-02T18:40:00Z", 52.3720, 4.9150, 3.8),
    ("2026-03-09T18:05:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-09T18:40:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-09T18:45:00Z", 52.3720, 4.9150, 3.8),
    ("2026-03-16T18:10:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-16T19:50:00Z", 52.3676, 4.9041, 0.0),
    ("2026-03-16T19:55:00Z", 52.3720, 4.9150, 3.8),
  ];

  for (occurred_at, latitude, longitude, speed_mps) in scenario_events {
    ingest_location_event(
      db_path,
      &LocationEventInput {
        occurred_at: occurred_at.into(),
        latitude,
        longitude,
        accuracy_meters: Some(15.0),
        speed_mps: Some(speed_mps),
        source: "mvp_reality_check".into(),
      },
    )?;
  }

  let timestamp = Utc::now().to_rfc3339();
  let transaction = connection.transaction()?;

  transaction.execute(
    r#"
      INSERT OR IGNORE INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, NULL, ?2, 'rhythm_break', ?3, ?4, 0.42, 'silent_save', 0, NULL)
    "#,
    params![
      timestamp,
      park_place.id,
      json!({
        "placeLabel": park_place.label,
        "durationSeconds": 1200,
        "dayOfWeek": 2,
        "hourBucket": 11
      })
      .to_string(),
      "A lighter irregular pause that should remain silent."
    ],
  )?;

  transaction.execute(
    r#"
      INSERT OR IGNORE INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, NULL, ?2, 'meaningful_departure', ?3, ?4, 0.76, 'suppressed', 0, ?5)
    "#,
    params![
      timestamp,
      park_place.id,
      json!({
        "placeLabel": park_place.label,
        "durationSeconds": 4200
      })
      .to_string(),
      "A meaningful departure that should be quiet overnight.",
      timestamp
    ],
  )?;

  let protected_time_moment_id = transaction.last_insert_rowid();

  transaction.execute(
    r#"
      INSERT OR IGNORE INTO moment_decisions (
        saved_moment_id, decided_at, decision_kind, reason_summary,
        decision_metadata_json, created_outreach_event_id
      ) VALUES (?1, ?2, 'suppress', ?3, ?4, NULL)
    "#,
    params![
      protected_time_moment_id,
      timestamp,
      "Suppressed because the current time falls inside sleep or protected quiet hours.",
      json!({ "kind": "protected_time", "seeded": true }).to_string()
    ],
  )?;

  upsert_setting(
    &transaction,
    "mvp_reality_check_seeded_at",
    &serde_json::to_string(&timestamp)?,
  )?;

  transaction.commit()?;
  build_mvp_reality_check_snapshot(&connection)
}

fn clear_tables(transaction: &Transaction<'_>, tables: &[&str]) -> Result<(), AppError> {
  for table in tables {
    transaction.execute(&format!("DELETE FROM {table}"), [])?;
  }
  Ok(())
}

fn reset_all_non_settings_data(db_path: &PathBuf) -> Result<(), AppError> {
  let mut connection = Connection::open(db_path)?;
  let transaction = connection.transaction()?;
  clear_tables(
    &transaction,
    &[
      "north_star_call_reviews",
      "tectonic_timeline_snapshots",
      "memory_evolution_state",
      "memory_detector_records",
      "companion_memory_items",
      "memory_items",
      "call_turns",
      "call_sessions",
      "outreach_feedback",
      "inbound_messages",
      "outreach_events",
      "moment_decisions",
      "saved_moments",
      "place_visits",
      "raw_location_events",
      "manual_reflections",
      "rules",
      "places",
      "companion_context_entries",
      "companion_context_category_state",
      "companion_context_categories",
    ],
  )?;
  transaction.execute(
    "DELETE FROM settings WHERE key = 'mvp_reality_check_seeded_at'",
    [],
  )?;
  seed_companion_context_categories(&transaction)?;
  transaction.commit()?;
  Ok(())
}

pub fn reset_runtime_data(db_path: &PathBuf) -> Result<(), AppError> {
  let mut connection = Connection::open(db_path)?;
  let transaction = connection.transaction()?;
  clear_tables(
    &transaction,
    &[
      "north_star_call_reviews",
      "tectonic_timeline_snapshots",
      "memory_evolution_state",
      "memory_detector_records",
    "companion_memory_items",
    "memory_items",
    "call_turns",
    "call_sessions",
    "outreach_feedback",
    "inbound_messages",
    "outreach_events",
      "moment_decisions",
      "saved_moments",
      "place_visits",
      "raw_location_events",
    ],
  )?;
  transaction.execute(
    "DELETE FROM settings WHERE key = 'mvp_reality_check_seeded_at'",
    [],
  )?;
  transaction.commit()?;
  Ok(())
}

pub fn start_call_session(
  db_path: &PathBuf,
  payload: &StartCallSessionInput,
) -> Result<CallSession, AppError> {
  let connection = Connection::open(db_path)?;
  let timestamp = Utc::now().to_rfc3339();

  connection.execute(
    "UPDATE call_sessions SET session_state = 'interrupted', outcome = 'interrupted', ended_at = COALESCE(ended_at, ?1), duration_seconds = COALESCE(duration_seconds, 0) WHERE session_state IN ('starting', 'active')",
    params![timestamp],
  )?;

  let (saved_moment_id, notes) = if let Some(outreach_event_id) = payload.outreach_event_id {
    let event_details: (Option<i64>, String, String, String) = connection.query_row(
      "SELECT saved_moment_id, reason_summary, outreach_kind, response_state FROM outreach_events WHERE id = ?1",
      params![outreach_event_id],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    if event_details.2 != "call_request" {
      return Err(AppError::Message(
        "Only call-request outreach can start a call session.".into(),
      ));
    }
    if payload.handoff_kind == "accepted_handoff"
      && !matches!(event_details.3.as_str(), "accepted" | "call_started")
    {
      return Err(AppError::Message(
        "This call request has not been accepted yet.".into(),
      ));
    }
    let joined_notes = if payload.notes.trim().is_empty() {
      event_details.1
    } else {
      format!("{}\n{}", event_details.1, payload.notes.trim())
    };
    connection.execute(
      "UPDATE outreach_events SET response_state = 'call_started', delivery_metadata_json = json_set(COALESCE(delivery_metadata_json, '{}'), '$.callStartedAt', ?2) WHERE id = ?1",
      params![outreach_event_id, timestamp],
    )?;
    (event_details.0, joined_notes)
  } else {
    (None, payload.notes.trim().to_string())
  };

  connection.execute(
    r#"
      INSERT INTO call_sessions (
        created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
        started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
      ) VALUES (?1, ?2, ?3, ?4, 'active', ?5, NULL, 'in_progress', ?6, '', 0)
    "#,
    params![
      timestamp,
      payload.outreach_event_id,
      saved_moment_id,
      payload.handoff_kind,
      timestamp,
      notes
    ],
  )?;

  get_call_session_by_id(&connection, connection.last_insert_rowid())
}

pub fn end_call_session(
  db_path: &PathBuf,
  payload: &EndCallSessionInput,
) -> Result<CallSession, AppError> {
  let connection = Connection::open(db_path)?;
  let started_at: Option<String> = connection.query_row(
    "SELECT started_at FROM call_sessions WHERE id = ?1",
    params![payload.session_id],
    |row| row.get(0),
  )?;
  let ended_at = Utc::now();
  let duration_seconds = started_at
    .as_deref()
    .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
    .map(|started| (ended_at - started.with_timezone(&Utc)).num_seconds().max(0))
    .unwrap_or(0);

  connection.execute(
    r#"
      UPDATE call_sessions
      SET session_state = 'ended',
          ended_at = ?2,
          outcome = ?3,
          notes = ?4,
          transcript_summary = ?5,
          duration_seconds = ?6
      WHERE id = ?1
    "#,
    params![
      payload.session_id,
      ended_at.to_rfc3339(),
      payload.outcome,
      payload.notes.trim(),
      payload.transcript_summary.trim(),
      duration_seconds
    ],
  )?;

  let session = get_call_session_by_id(&connection, payload.session_id)?;
  if let Some(outreach_event_id) = session.outreach_event_id {
    connection.execute(
      "UPDATE outreach_events SET response_state = ?2, delivery_metadata_json = json_set(COALESCE(delivery_metadata_json, '{}'), '$.callEndedAt', ?3, '$.callOutcome', ?4) WHERE id = ?1",
      params![outreach_event_id, call_outcome_response_state(&payload.outcome), ended_at.to_rfc3339(), payload.outcome],
    )?;
  }
  run_memory_growth_pass_with_connection(&connection)?;
  Ok(session)
}

pub fn clear_all_local_data(db_path: &PathBuf) -> Result<(), AppError> {
  let mut connection = Connection::open(db_path)?;
  let transaction = connection.transaction()?;
  for table in [
    "call_sessions",
    "outreach_feedback",
    "inbound_messages",
    "outreach_events",
    "moment_decisions",
    "saved_moments",
    "place_visits",
    "raw_location_events",
    "manual_reflections",
    "rules",
    "places",
    "memory_items",
    "settings",
  ] {
    transaction.execute(&format!("DELETE FROM {table}"), [])?;
  }
  transaction.commit()?;
  Ok(())
}

pub fn simulation_scenarios() -> Vec<SimulationScenario> {
  vec![
    SimulationScenario {
      key: "single_message_path".into(),
      label: "Single Message Path".into(),
      description: "Creates realistic context, runs decisions, and leaves exactly one draft for review.".into(),
    },
    SimulationScenario {
      key: "call_request_path".into(),
      label: "Call Request Path".into(),
      description: "Enables call requests, seeds one strong moment, and leaves exactly one call-request draft for review.".into(),
    },
    SimulationScenario {
      key: "call_request_runtime_seed".into(),
      label: "Call Request Runtime Seed".into(),
      description: "Enables call requests and seeds one unresolved call-ready moment so the Runtime button can evaluate it next.".into(),
    },
    SimulationScenario {
      key: "accepted_call_request_starts_session".into(),
      label: "Accepted Call Request Starts Session".into(),
      description: "Seeds an accepted call request and checks that it can turn into a real active call session.".into(),
    },
    SimulationScenario {
      key: "completed_call_session_is_logged".into(),
      label: "Completed Call Session Is Logged".into(),
      description: "Starts and ends a call session so the outcome, timing, and summary are stored visibly.".into(),
    },
    SimulationScenario {
      key: "quiet_hours_boundary".into(),
      label: "Quiet Hours Boundary".into(),
      description: "Seeds a meaningful moment and proves it stays silent during protected time.".into(),
    },
    SimulationScenario {
      key: "feedback_learning".into(),
      label: "Feedback Learning".into(),
      description: "Seeds past intrusive feedback and checks that a similar later moment is softened or suppressed.".into(),
    },
    SimulationScenario {
      key: "cooldown_blocks_second_message".into(),
      label: "Cooldown Blocks Second Message".into(),
      description: "Seeds a recent sent outreach and verifies a new strong moment is suppressed by cooldown.".into(),
    },
    SimulationScenario {
      key: "low_confidence_noise_batch".into(),
      label: "Low-Confidence Noise Batch".into(),
      description: "Seeds several weak moments and checks that they all stay silent.".into(),
    },
    SimulationScenario {
      key: "welcome_feedback_supports_future_promotion".into(),
      label: "Welcome Feedback Supports Future Promotion".into(),
      description: "Seeds a welcome response first and checks that a similar later moment is helped rather than suppressed.".into(),
    },
    SimulationScenario {
      key: "repeat_moments_still_only_one_draft".into(),
      label: "Repeat Moments Still Only One Draft".into(),
      description: "Seeds several strong related moments together and checks that only one draft is created in the pass.".into(),
    },
    SimulationScenario {
      key: "repeated_place_promotes_to_stable_memory".into(),
      label: "Repeated Place Promotes To Stable Memory".into(),
      description: "Seeds a meaningful place with repeated visits and checks that memory growth hardens it into stable memory.".into(),
    },
    SimulationScenario {
      key: "stale_week_state_fades".into(),
      label: "Stale Week State Fades".into(),
      description: "Seeds an expired week-state reflection and checks that memory growth moves it out of active memory.".into(),
    },
    SimulationScenario {
      key: "accepted_call_request_strengthens_memory".into(),
      label: "Accepted Call Request Strengthens Memory".into(),
      description: "Seeds an accepted call-request reply and checks that memory growth keeps a positive call-readiness pattern.".into(),
    },
    SimulationScenario {
      key: "declined_call_request_softens_memory".into(),
      label: "Declined Call Request Softens Memory".into(),
      description: "Seeds a declined call-request reply and checks that memory growth records a lighter-touch pattern.".into(),
    },
    SimulationScenario {
      key: "sensitive_memory_waits_for_confirmation".into(),
      label: "Sensitive Memory Waits For Confirmation".into(),
      description: "Seeds a sensitive reflection and checks that memory growth keeps it tentative instead of silently keeping it.".into(),
    },
    SimulationScenario {
      key: "dismissed_sensitive_memory_stays_archived".into(),
      label: "Dismissed Sensitive Memory Stays Archived".into(),
      description: "Seeds a sensitive memory, dismisses it, then checks that a later growth pass does not silently reactivate it.".into(),
    },
    SimulationScenario {
      key: "no_new_evidence_causes_no_memory_change".into(),
      label: "No New Evidence Causes No Memory Change".into(),
      description: "Runs memory growth twice on unchanged state and checks that nothing new is created on the second pass.".into(),
    },
    SimulationScenario {
      key: "routine_place_does_not_become_rhythm_break".into(),
      label: "Routine Place Does Not Become Rhythm Break".into(),
      description: "Seeds a stable repeated routine and checks that the system does not misclassify it as a rhythm break.".into(),
    },
    SimulationScenario {
      key: "lived_moment_open_window".into(),
      label: "Lived Moment Open Window".into(),
      description: "Seeds an unusually alive evening moment and checks that the lived-moment layer reads it as open and opportunity-rich.".into(),
    },
    SimulationScenario {
      key: "lived_moment_protective_window".into(),
      label: "Lived Moment Protective Window".into(),
      description: "Seeds a late, sensitive moment and checks that the lived-moment layer leans protective or quiet rather than pushy.".into(),
    },
    SimulationScenario {
      key: "lived_moment_transition_window".into(),
      label: "Lived Moment Transition Window".into(),
      description: "Seeds drift and accumulated movement so the lived-moment layer recognizes a transition-heavy threshold.".into(),
    },
  ]
}

pub fn run_simulation_scenario(
  db_path: &PathBuf,
  payload: &SimulationRunInput,
) -> Result<SimulationRunResult, AppError> {
  if payload.clear_existing {
    reset_all_non_settings_data(db_path)?;
  }

  match payload.scenario_key.as_str() {
    "single_message_path" => run_single_message_simulation(db_path),
    "call_request_path" => run_call_request_simulation(db_path),
    "call_request_runtime_seed" => run_call_request_runtime_seed_simulation(db_path),
    "accepted_call_request_starts_session" => run_accepted_call_request_starts_session_simulation(db_path),
    "completed_call_session_is_logged" => run_completed_call_session_is_logged_simulation(db_path),
    "quiet_hours_boundary" => run_quiet_hours_simulation(db_path),
    "feedback_learning" => run_feedback_learning_simulation(db_path),
    "cooldown_blocks_second_message" => run_cooldown_simulation(db_path),
    "low_confidence_noise_batch" => run_low_confidence_noise_simulation(db_path),
    "welcome_feedback_supports_future_promotion" => run_welcome_feedback_simulation(db_path),
    "repeat_moments_still_only_one_draft" => run_repeat_moments_single_draft_simulation(db_path),
    "repeated_place_promotes_to_stable_memory" => run_repeated_place_promotes_to_stable_memory_simulation(db_path),
    "stale_week_state_fades" => run_stale_week_state_fades_simulation(db_path),
    "accepted_call_request_strengthens_memory" => run_accepted_call_request_strengthens_memory_simulation(db_path),
    "declined_call_request_softens_memory" => run_declined_call_request_softens_memory_simulation(db_path),
    "sensitive_memory_waits_for_confirmation" => run_sensitive_memory_waits_for_confirmation_simulation(db_path),
    "dismissed_sensitive_memory_stays_archived" => run_dismissed_sensitive_memory_stays_archived_simulation(db_path),
    "no_new_evidence_causes_no_memory_change" => run_no_new_evidence_causes_no_memory_change_simulation(db_path),
    "routine_place_does_not_become_rhythm_break" => run_routine_place_does_not_become_rhythm_break_simulation(db_path),
    "lived_moment_open_window" => run_lived_moment_open_window_simulation(db_path),
    "lived_moment_protective_window" => run_lived_moment_protective_window_simulation(db_path),
    "lived_moment_transition_window" => run_lived_moment_transition_window_simulation(db_path),
    other => Err(AppError::Message(format!("Unknown simulation scenario '{}'.", other))),
  }
}

pub fn run_automated_simulation_suite() -> Result<SimulationSuiteResult, AppError> {
  let suite_db_path = std::env::temp_dir().join(format!(
    "neural_trainer-sim-suite-{}.sqlite",
    Utc::now().timestamp_nanos_opt().unwrap_or_default()
  ));
  init_storage_at_path(&suite_db_path)?;

  let scenario_keys = [
    "single_message_path",
    "call_request_path",
    "call_request_runtime_seed",
    "accepted_call_request_starts_session",
    "completed_call_session_is_logged",
    "quiet_hours_boundary",
    "feedback_learning",
    "cooldown_blocks_second_message",
    "low_confidence_noise_batch",
    "welcome_feedback_supports_future_promotion",
    "repeat_moments_still_only_one_draft",
    "repeated_place_promotes_to_stable_memory",
    "stale_week_state_fades",
    "accepted_call_request_strengthens_memory",
    "declined_call_request_softens_memory",
    "sensitive_memory_waits_for_confirmation",
    "dismissed_sensitive_memory_stays_archived",
    "no_new_evidence_causes_no_memory_change",
    "routine_place_does_not_become_rhythm_break",
    "lived_moment_open_window",
    "lived_moment_protective_window",
    "lived_moment_transition_window",
  ];

  let mut scenario_results = Vec::new();
  for scenario_key in scenario_keys {
    let result = run_simulation_scenario(
      &suite_db_path,
      &SimulationRunInput {
        scenario_key: scenario_key.to_string(),
        clear_existing: true,
      },
    )?;
    scenario_results.push(result);
  }

  let checks = build_simulation_suite_checks(&scenario_results);
  let passed_count = checks.iter().filter(|check| check.passed).count();
  let total_count = checks.len();

  let _ = fs::remove_file(&suite_db_path);

  Ok(SimulationSuiteResult {
    scenario_results,
    passed_count,
    total_count,
    summary: format!(
      "Automated simulation suite finished with {passed_count}/{total_count} checks passing."
    ),
    checks,
  })
}

pub fn run_message_decisions(db_path: &PathBuf) -> Result<DecisionRunResult, AppError> {
  run_message_decisions_at(db_path, Utc::now())
}

pub fn run_call_request_decisions(db_path: &PathBuf) -> Result<DecisionRunResult, AppError> {
  run_call_request_decisions_at(db_path, Utc::now())
}

pub fn drafted_outreach_events(db_path: &PathBuf) -> Result<Vec<OutreachEvent>, AppError> {
  let connection = Connection::open(db_path)?;
  list_drafted_outreach_events(&connection)
}

pub fn next_drafted_outreach_event(db_path: &PathBuf) -> Result<Option<OutreachEvent>, AppError> {
  Ok(drafted_outreach_events(db_path)?.into_iter().next())
}

fn get_moment_decision_by_outreach_event_id(
  connection: &Connection,
  outreach_event_id: i64,
) -> Result<Option<MomentDecision>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, saved_moment_id, decided_at, decision_kind, reason_summary,
        decision_metadata_json, created_outreach_event_id
      FROM moment_decisions
      WHERE created_outreach_event_id = ?1
      ORDER BY decided_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  statement
    .query_row(params![outreach_event_id], |row| {
      Ok(MomentDecision {
        id: row.get(0)?,
        saved_moment_id: row.get(1)?,
        decided_at: row.get(2)?,
        decision_kind: row.get(3)?,
        reason_summary: row.get(4)?,
        decision_metadata_json: row.get(5)?,
        created_outreach_event_id: row.get(6)?,
      })
    })
    .optional()
    .map_err(AppError::from)
}

fn merge_json_strings(base: &str, patch: serde_json::Value) -> String {
  let mut root = serde_json::from_str::<serde_json::Value>(base).unwrap_or_else(|_| json!({}));
  if !root.is_object() {
    root = json!({});
  }
  if let (Some(root_obj), Some(patch_obj)) = (root.as_object_mut(), patch.as_object()) {
    for (key, value) in patch_obj {
      root_obj.insert(key.clone(), value.clone());
    }
  }
  root.to_string()
}

fn lived_moment_for_outreach_event(
  connection: &Connection,
  outreach_event_id: i64,
) -> Result<Option<serde_json::Value>, AppError> {
  Ok(
    get_moment_decision_by_outreach_event_id(connection, outreach_event_id)?
      .and_then(|decision| serde_json::from_str::<serde_json::Value>(&decision.decision_metadata_json).ok())
      .and_then(|value| value.get("livedMoment").cloned()),
  )
}

fn auto_dispatch_eligibility_for_outreach(
  connection: &Connection,
  outreach: &OutreachEvent,
) -> Result<(bool, String), AppError> {
  if outreach.outreach_kind == "call_request" {
    return Ok((
      false,
      "Call requests stay manual for now so live outreach remains deliberate.".into(),
    ));
  }

  let Some(lived_moment) = lived_moment_for_outreach_event(connection, outreach.id)? else {
    return Ok((
      false,
      "This draft does not have enough lived-moment context attached for safe auto-dispatch.".into(),
    ));
  };

  let recommended_contact_mode = lived_moment
    .get("recommendedContactMode")
    .and_then(|value| value.as_str())
    .unwrap_or("stay_silent");

  let reason = match recommended_contact_mode {
    "send_light_message" => Some("Ready to auto-send as a light message.".to_string()),
    "make_soft_suggestion" => Some("Ready to auto-send as a soft suggestion.".to_string()),
    "send_warning" => Some("Ready to auto-send as a timely warning.".to_string()),
    "stay_silent" => None,
    "suggest_human_contact" => None,
    "escalate_to_call" => None,
    _ => None,
  };

  if let Some(reason) = reason {
    Ok((true, reason))
  } else {
    let hold_reason = match recommended_contact_mode {
      "stay_silent" => "Not auto-sending because this moment still leans quiet.",
      "suggest_human_contact" => "Keeping this as a manual send because it points toward human contact.",
      "escalate_to_call" => "Keeping this as a manual send because it feels closer to a live call.",
      _ => "Keeping this as a manual send for now.",
    };
    Ok((false, hold_reason.into()))
  }
}

fn dispatch_reason_summary(
  outreach_kind: &str,
  pillar: &str,
  primary_assessment: &str,
) -> String {
  if outreach_kind == "call_request" {
    return match pillar {
      "situational_safeguarding" => {
        "Sending a live North Star check-in because this moment felt important not to leave alone.".into()
      }
      "relational_bridging" => {
        "Sending a live North Star check-in because this moment felt more human than another text.".into()
      }
      "phase_navigation" => {
        "Sending a live North Star check-in because your recent rhythm looked more in motion than usual.".into()
      }
      _ => {
        "Sending a live North Star check-in because this felt like a moment worth meeting while it is still here.".into()
      }
    };
  }

  match pillar {
    "situational_safeguarding" => {
      "Sending a North Star message because this looked timely enough for a gentle heads-up.".into()
    }
    "relational_bridging" => {
      "Sending a North Star message because this moment seemed to call for a small bridge toward contact.".into()
    }
    "phase_navigation" => {
      "Sending a North Star message because this looked like part of a larger shift in rhythm.".into()
    }
    _ => match primary_assessment {
      "open" | "opportunity-rich" | "exploratory" => {
        "Sending a North Star message because this looked like an open moment worth meeting gently.".into()
      }
      "transition-heavy" => {
        "Sending a North Star message because this moment looked like it sat inside a real transition.".into()
      }
      _ => {
        "Sending a North Star message because this moment looked worth a light touch.".into()
      }
    },
  }
}

pub fn next_auto_dispatchable_outreach_event(
  db_path: &PathBuf,
) -> Result<(Option<OutreachEvent>, Option<OutreachEvent>, Option<String>), AppError> {
  let connection = Connection::open(db_path)?;
  let drafted = list_drafted_outreach_events(&connection)?;

  if drafted.is_empty() {
    return Ok((None, None, None));
  }

  let mut first_held: Option<OutreachEvent> = None;
  let mut first_hold_reason: Option<String> = None;
  for outreach in drafted {
    let (eligible, reason) = auto_dispatch_eligibility_for_outreach(&connection, &outreach)?;
    if eligible {
      return Ok((Some(outreach), None, Some(reason)));
    }
    if first_held.is_none() {
      first_held = Some(outreach);
      first_hold_reason = Some(reason);
    }
  }

  Ok((None, first_held, first_hold_reason))
}

pub fn build_dispatch_payload_for_outreach(
  db_path: &PathBuf,
  outreach_event_id: i64,
) -> Result<(OutreachEvent, String, String), AppError> {
  let connection = Connection::open(db_path)?;
  let outreach = get_outreach_event_by_id(&connection, outreach_event_id)?;
  let lived_moment = lived_moment_for_outreach_event(&connection, outreach_event_id)?
    .as_ref()
    .cloned()
    .unwrap_or_else(|| json!({}));

  let pillar = lived_moment
    .get("pillar")
    .and_then(|value| value.as_str())
    .unwrap_or("lived_moment_enrichment");
  let primary_assessment = lived_moment
    .get("primaryAssessment")
    .and_then(|value| value.as_str())
    .unwrap_or("ordinary");
  let recommended_signal = lived_moment
    .get("recommendedSignal")
    .and_then(|value| value.as_str())
    .unwrap_or("stay_quiet");
  let top_bridge = lived_moment
    .get("topRelationalBridge")
    .and_then(|value| value.as_str());
  let top_opportunity = lived_moment
    .get("topOpportunity")
    .and_then(|value| value.as_str());
  let top_safeguard = lived_moment
    .get("topSafeguard")
    .and_then(|value| value.as_str());
  let top_situational_signal = lived_moment
    .get("topSituationalSignal")
    .and_then(|value| value.as_str());

  let call_note = if outreach.outreach_kind == "call_request" {
    match pillar {
      "situational_safeguarding" => {
        if let Some(signal) = top_safeguard.or(top_situational_signal) {
          format!(
            "Something about this moment felt important enough not to leave alone, especially around {}.",
            signal.replace('_', " ")
          )
        } else {
          "Something about this moment felt important enough not to leave alone, so I wanted to call.".into()
        }
      }
      "relational_bridging" => {
        if let Some(name) = top_bridge {
          format!(
            "This felt like a moment that might need a more human kind of contact, with {} quietly in mind.",
            name
          )
        } else {
          "This felt like a moment that might need a more human kind of contact than another text.".into()
        }
      }
      "phase_navigation" => {
        "Your recent rhythm felt a little in motion, and a live check-in seemed gentler than leaving it abstract.".into()
      }
      _ => {
        if let Some(opportunity) = top_opportunity {
          format!(
            "This felt like one of those moments worth meeting while it is still alive, especially around {}.",
            opportunity.replace('_', " ")
          )
        } else {
          "This felt like one of those moments worth meeting while it is still alive, so I wanted to call.".into()
        }
      }
    }
  } else {
    String::new()
  };

  let payload = if outreach.outreach_kind == "call_request" {
    call_note
  } else {
    outreach.message_text.clone()
  };
  let mut detail = dispatch_reason_summary(&outreach.outreach_kind, pillar, primary_assessment);
  if recommended_signal == "warn_now" && outreach.outreach_kind != "call_request" {
    detail.push_str(" It carried a warning tone.");
  }
  Ok((outreach, payload, detail))
}

pub fn mark_outreach_event_dispatched(
  db_path: &PathBuf,
  outreach_event_id: i64,
  dispatched_payload: &str,
  north_star_detail: &str,
) -> Result<OutreachEvent, AppError> {
  let connection = Connection::open(db_path)?;
  let outreach = get_outreach_event_by_id(&connection, outreach_event_id)?;
  let merged_metadata = merge_json_strings(
    &outreach.delivery_metadata_json,
    json!({
      "dispatchedAt": Utc::now().to_rfc3339(),
      "dispatchedPayload": dispatched_payload,
      "northStarDetail": north_star_detail,
      "dispatchChannel": "north_star"
    }),
  );
  connection.execute(
    r#"
      UPDATE outreach_events
      SET was_delivered = 1,
          response_state = 'sent',
          delivery_metadata_json = ?2
      WHERE id = ?1
    "#,
    params![outreach_event_id, merged_metadata],
  )?;
  get_outreach_event_by_id(&connection, outreach_event_id)
}

pub fn save_inbound_message(
  db_path: &PathBuf,
  telegram_update_id: i64,
  telegram_message_id: Option<i64>,
  chat_id: &str,
  sender_id: Option<&str>,
  text: &str,
  received_at: &str,
) -> Result<Option<InboundMessage>, AppError> {
  let connection = Connection::open(db_path)?;
  let outreach_event_id = latest_outreach_event_for_chat(&connection, chat_id)?;
  let inserted = connection.execute(
    r#"
      INSERT OR IGNORE INTO inbound_messages (
        created_at, outreach_event_id, telegram_update_id, telegram_message_id,
        chat_id, sender_id, text, received_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    "#,
    params![
      Utc::now().to_rfc3339(),
      outreach_event_id,
      telegram_update_id,
      telegram_message_id,
      chat_id,
      sender_id,
      text,
      received_at
    ],
  )?;

  if let Some(outreach_event_id) = outreach_event_id {
    let outreach_kind: String = connection.query_row(
      "SELECT outreach_kind FROM outreach_events WHERE id = ?1",
      params![outreach_event_id],
      |row| row.get(0),
    )?;
    let response_state = if outreach_kind == "call_request" {
      classify_call_request_reply(text).unwrap_or("replied")
    } else {
      "replied"
    };
    connection.execute(
      "UPDATE outreach_events SET response_state = ?2 WHERE id = ?1",
      params![outreach_event_id, response_state],
    )?;
  }

  if inserted == 0 {
    return Ok(None);
  }

  Ok(Some(get_inbound_message_by_update_id(
    &connection,
    telegram_update_id,
  )?))
}

pub fn submit_outreach_feedback(
  db_path: &PathBuf,
  payload: &SubmitFeedbackInput,
) -> Result<OutreachFeedback, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO outreach_feedback (
        outreach_event_id, feedback_kind, score, notes, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5)
    "#,
    params![
      payload.outreach_event_id,
      payload.feedback_kind,
      feedback_score(&payload.feedback_kind),
      payload.notes,
      Utc::now().to_rfc3339()
    ],
  )?;
  get_feedback_by_id(&connection, connection.last_insert_rowid())
}

pub fn memory_growth_snapshot(db_path: &PathBuf) -> Result<MemoryGrowthSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  build_memory_growth_snapshot(&connection)
}

pub fn run_memory_growth_pass(db_path: &PathBuf) -> Result<MemoryGrowthSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  run_memory_growth_pass_with_connection(&connection)?;
  build_memory_growth_snapshot(&connection)
}

pub fn update_memory_item(
  db_path: &PathBuf,
  payload: &UpdateMemoryItemInput,
) -> Result<MemoryGrowthSnapshot, AppError> {
  let connection = Connection::open(db_path)?;
  update_memory_item_with_connection(&connection, payload)?;
  build_memory_growth_snapshot(&connection)
}

fn apply_schema(connection: &Connection) -> Result<(), AppError> {
  connection.execute_batch(
    r#"
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        version INTEGER NOT NULL,
        initialized_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        latitude REAL NULL,
        longitude REAL NULL,
        radius_meters INTEGER NOT NULL DEFAULT 75,
        place_kind TEXT NOT NULL,
        meaning_kind TEXT NOT NULL,
        is_user_named INTEGER NOT NULL DEFAULT 1,
        significance_score REAL NOT NULL DEFAULT 0.5,
        is_protected INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_kind TEXT NOT NULL,
        scope_kind TEXT NOT NULL,
        scope_ref_id INTEGER NULL,
        value_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS manual_reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        reflection_kind TEXT NOT NULL,
        text TEXT NOT NULL,
        linked_place_id INTEGER NULL,
        linked_moment_id INTEGER NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        expires_at TEXT NULL,
        is_sensitive INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS raw_location_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy_meters REAL NULL,
        speed_mps REAL NULL,
        movement_state TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS place_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id INTEGER NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        arrival_mode TEXT NOT NULL,
        departure_mode TEXT NOT NULL DEFAULT 'unknown',
        was_stationary INTEGER NOT NULL DEFAULT 1,
        confidence REAL NOT NULL DEFAULT 0.5,
        raw_context_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS saved_moments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        visit_id INTEGER NULL,
        place_id INTEGER NULL,
        moment_kind TEXT NOT NULL,
        observed_context_json TEXT NOT NULL,
        inferred_significance TEXT NOT NULL,
        confidence REAL NOT NULL,
        action_taken TEXT NOT NULL DEFAULT 'silent_save',
        was_promoted_to_outreach INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_moment_unique_visit_kind
      ON saved_moments (visit_id, moment_kind)
      WHERE visit_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS outreach_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        saved_moment_id INTEGER NULL,
        outreach_kind TEXT NOT NULL,
        channel TEXT NOT NULL,
        reason_summary TEXT NOT NULL,
        message_text TEXT NOT NULL,
        confidence REAL NOT NULL,
        was_delivered INTEGER NOT NULL DEFAULT 0,
        delivery_metadata_json TEXT NOT NULL DEFAULT '{}',
        response_state TEXT NOT NULL DEFAULT 'no_response'
      );

      CREATE TABLE IF NOT EXISTS inbound_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        outreach_event_id INTEGER NULL,
        telegram_update_id INTEGER NOT NULL UNIQUE,
        telegram_message_id INTEGER NULL,
        chat_id TEXT NOT NULL,
        sender_id TEXT NULL,
        text TEXT NOT NULL,
        received_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS moment_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saved_moment_id INTEGER NOT NULL UNIQUE,
        decided_at TEXT NOT NULL,
        decision_kind TEXT NOT NULL,
        reason_summary TEXT NOT NULL,
        decision_metadata_json TEXT NOT NULL DEFAULT '{}',
        created_outreach_event_id INTEGER NULL
      );

      CREATE TABLE IF NOT EXISTS outreach_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outreach_event_id INTEGER NOT NULL,
        feedback_kind TEXT NOT NULL,
        score REAL NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        source_kind TEXT NOT NULL,
        source_ref_id INTEGER NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        reinforced_at TEXT NULL,
        decays_after TEXT NULL,
        requires_confirmation INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS companion_memory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_key TEXT NOT NULL UNIQUE,
        source_kind TEXT NOT NULL,
        source_ref_id INTEGER NULL,
        source_category_key TEXT NOT NULL,
        source_entry_title TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.5,
        salience REAL NOT NULL DEFAULT 0.5,
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        declared_by_user INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        interpreted_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        archived_at TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_detector_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detector_key TEXT NOT NULL UNIQUE,
        detector_type TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_ref_id INTEGER NULL,
        target_key TEXT NOT NULL,
        direction TEXT NOT NULL,
        strength REAL NOT NULL DEFAULT 0.5,
        confidence REAL NOT NULL DEFAULT 0.5,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        repeat_count INTEGER NOT NULL DEFAULT 1,
        summary TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_evolution_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_item_id INTEGER NOT NULL UNIQUE,
        declared_confidence REAL NOT NULL DEFAULT 0.5,
        observed_confidence REAL NOT NULL DEFAULT 0.5,
        detector_balance REAL NOT NULL DEFAULT 0.0,
        observed_support_score REAL NOT NULL DEFAULT 0.0,
        observed_challenge_score REAL NOT NULL DEFAULT 0.0,
        divergence_score REAL NOT NULL DEFAULT 0.0,
        cumulative_support_score REAL NOT NULL DEFAULT 0.0,
        cumulative_challenge_score REAL NOT NULL DEFAULT 0.0,
        cumulative_divergence_score REAL NOT NULL DEFAULT 0.0,
        support_source_count INTEGER NOT NULL DEFAULT 0,
        challenge_source_count INTEGER NOT NULL DEFAULT 0,
        source_coherence_score REAL NOT NULL DEFAULT 0.0,
        sustained_divergence_score REAL NOT NULL DEFAULT 0.0,
        phase_shift_score REAL NOT NULL DEFAULT 0.0,
        phase_shift_state TEXT NOT NULL DEFAULT 'stable',
        truth_alignment TEXT NOT NULL DEFAULT 'aligned',
        current_status TEXT NOT NULL DEFAULT 'active',
        reinforcement_score REAL NOT NULL DEFAULT 0.0,
        drift_score REAL NOT NULL DEFAULT 0.0,
        tension_score REAL NOT NULL DEFAULT 0.0,
        volatility_score REAL NOT NULL DEFAULT 0.0,
        emergence_score REAL NOT NULL DEFAULT 0.0,
        protection_score REAL NOT NULL DEFAULT 0.0,
        declared_truth_summary TEXT NOT NULL DEFAULT '',
        observed_truth_summary TEXT NOT NULL DEFAULT '',
        observed_evidence_summary TEXT NOT NULL DEFAULT '',
        phase_shift_summary TEXT NOT NULL DEFAULT '',
        alignment_summary TEXT NOT NULL DEFAULT '',
        last_evolved_at TEXT NOT NULL,
        last_confirmed_at TEXT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_evolution_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_item_id INTEGER NOT NULL,
        evolved_at TEXT NOT NULL,
        observed_confidence REAL NOT NULL DEFAULT 0.0,
        divergence_score REAL NOT NULL DEFAULT 0.0,
        source_coherence_score REAL NOT NULL DEFAULT 0.0,
        truth_alignment TEXT NOT NULL DEFAULT 'aligned',
        current_status TEXT NOT NULL DEFAULT 'active',
        phase_shift_state TEXT NOT NULL DEFAULT 'stable',
        phase_shift_score REAL NOT NULL DEFAULT 0.0
      );

      CREATE TABLE IF NOT EXISTS tectonic_timeline_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_kind TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        window_start TEXT NOT NULL,
        window_end TEXT NOT NULL,
        total_detector_activity REAL NOT NULL DEFAULT 0.0,
        active_memory_count INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_companion_memory_items_source
      ON companion_memory_items (source_kind, source_ref_id);

      CREATE INDEX IF NOT EXISTS idx_memory_detector_target
      ON memory_detector_records (target_key, detector_type, last_seen_at);

      CREATE INDEX IF NOT EXISTS idx_memory_evolution_state_memory_item
      ON memory_evolution_state (memory_item_id);

      CREATE INDEX IF NOT EXISTS idx_memory_evolution_history_memory_item
      ON memory_evolution_history (memory_item_id, evolved_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tectonic_timeline_recorded_at
      ON tectonic_timeline_snapshots (recorded_at DESC);

      CREATE TABLE IF NOT EXISTS north_star_call_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_id TEXT NOT NULL UNIQUE,
        call_id TEXT NOT NULL,
        user_handle TEXT NOT NULL DEFAULT '',
        sentiment TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_north_star_call_reviews_created_at
      ON north_star_call_reviews (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_north_star_call_reviews_call_id
      ON north_star_call_reviews (call_id);

      CREATE TABLE IF NOT EXISTS call_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        outreach_event_id INTEGER NULL,
        saved_moment_id INTEGER NULL,
        handoff_kind TEXT NOT NULL,
        session_state TEXT NOT NULL DEFAULT 'starting',
        started_at TEXT NULL,
        ended_at TEXT NULL,
        outcome TEXT NOT NULL DEFAULT 'pending',
        notes TEXT NOT NULL DEFAULT '',
        transcript_summary TEXT NOT NULL DEFAULT '',
        duration_seconds INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS call_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        transcript_text TEXT NOT NULL,
        reply_text TEXT NOT NULL,
        reply_mode TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS companion_context_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_key TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
          notes TEXT NOT NULL DEFAULT '',
          display_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

      CREATE TABLE IF NOT EXISTS companion_context_categories (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          icon TEXT NOT NULL DEFAULT 'spark',
          display_order INTEGER NOT NULL DEFAULT 0,
          is_system INTEGER NOT NULL DEFAULT 0,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

      CREATE TABLE IF NOT EXISTS companion_context_category_state (
        category_key TEXT PRIMARY KEY,
        is_visible INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    "#,
  )?;

  let category_columns = table_columns(connection, "companion_context_categories")?;
  if !category_columns.iter().any(|column| column == "icon") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'spark'",
      [],
    )?;
  }
  if !category_columns.iter().any(|column| column == "is_deleted") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
      [],
    )?;
  }
  if !category_columns.iter().any(|column| column == "deleted_at") {
    connection.execute(
      "ALTER TABLE companion_context_categories ADD COLUMN deleted_at TEXT",
      [],
    )?;
  }

  let entry_columns = table_columns(connection, "companion_context_entries")?;
  if !entry_columns.iter().any(|column| column == "deleted_at") {
    connection.execute(
      "ALTER TABLE companion_context_entries ADD COLUMN deleted_at TEXT",
      [],
    )?;
  }

  let evolution_columns = table_columns(connection, "memory_evolution_state")?;
  if !evolution_columns.iter().any(|column| column == "observed_support_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN observed_support_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "observed_challenge_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN observed_challenge_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "divergence_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN divergence_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "cumulative_support_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN cumulative_support_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "cumulative_challenge_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN cumulative_challenge_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "cumulative_divergence_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN cumulative_divergence_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "support_source_count") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN support_source_count INTEGER NOT NULL DEFAULT 0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "challenge_source_count") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN challenge_source_count INTEGER NOT NULL DEFAULT 0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "source_coherence_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN source_coherence_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "sustained_divergence_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN sustained_divergence_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "phase_shift_score") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN phase_shift_score REAL NOT NULL DEFAULT 0.0",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "phase_shift_state") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN phase_shift_state TEXT NOT NULL DEFAULT 'stable'",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "truth_alignment") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN truth_alignment TEXT NOT NULL DEFAULT 'aligned'",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "alignment_summary") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN alignment_summary TEXT NOT NULL DEFAULT ''",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "observed_evidence_summary") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN observed_evidence_summary TEXT NOT NULL DEFAULT ''",
      [],
    )?;
  }
  if !evolution_columns.iter().any(|column| column == "phase_shift_summary") {
    connection.execute(
      "ALTER TABLE memory_evolution_state ADD COLUMN phase_shift_summary TEXT NOT NULL DEFAULT ''",
      [],
    )?;
  }

  let review_columns = table_columns(connection, "north_star_call_reviews")?;
  if !review_columns.iter().any(|column| column == "user_handle") {
    connection.execute(
      "ALTER TABLE north_star_call_reviews ADD COLUMN user_handle TEXT NOT NULL DEFAULT ''",
      [],
    )?;
  }
  if !review_columns.iter().any(|column| column == "imported_at") {
    connection.execute(
      "ALTER TABLE north_star_call_reviews ADD COLUMN imported_at TEXT NOT NULL DEFAULT ''",
      [],
    )?;
  }

  let existing: i64 = connection.query_row("SELECT COUNT(*) FROM app_meta", [], |row| row.get(0))?;
  if existing == 0 {
    connection.execute(
      "INSERT INTO app_meta (version, initialized_at) VALUES (?1, ?2)",
      params![SCHEMA_VERSION, Utc::now().to_rfc3339()],
    )?;
  } else {
    connection.execute("UPDATE app_meta SET version = ?1", params![SCHEMA_VERSION])?;
  }

  seed_companion_context_categories(connection)?;

  Ok(())
}

fn seed_companion_context_categories(connection: &Connection) -> Result<(), AppError> {
  for (index, (key, label, description, icon)) in COMPANION_CONTEXT_CATEGORY_DEFS.iter().enumerate() {
    let timestamp = Utc::now().to_rfc3339();
    connection.execute(
      r#"
        INSERT INTO companion_context_categories (
          key,
          label,
          description,
          icon,
          display_order,
          is_system,
          is_deleted,
          deleted_at,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, NULL, ?6, ?7)
        ON CONFLICT(key) DO UPDATE SET
          label = excluded.label,
          description = excluded.description,
          icon = CASE
            WHEN companion_context_categories.icon IS NULL OR companion_context_categories.icon = ''
            THEN excluded.icon
            ELSE companion_context_categories.icon
          END,
          display_order = excluded.display_order,
          is_system = 1,
          updated_at = excluded.updated_at
      "#,
      params![key, label, description, icon, index as i64, timestamp, timestamp],
    )?;
  }

  Ok(())
}

fn list_places(connection: &Connection) -> Result<Vec<Place>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, label, latitude, longitude, radius_meters, place_kind, meaning_kind,
        is_user_named, significance_score, is_protected, notes, created_at, updated_at
      FROM places
      ORDER BY updated_at DESC, id DESC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(Place {
      id: row.get(0)?,
      label: row.get(1)?,
      latitude: row.get(2)?,
      longitude: row.get(3)?,
      radius_meters: row.get(4)?,
      place_kind: row.get(5)?,
      meaning_kind: row.get(6)?,
      is_user_named: row.get(7)?,
      significance_score: row.get(8)?,
      is_protected: row.get(9)?,
      notes: row.get(10)?,
      created_at: row.get(11)?,
      updated_at: row.get(12)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_memory_items(connection: &Connection) -> Result<Vec<MemoryItem>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, memory_type, content, confidence, source_kind, source_ref_id, status,
        created_at, updated_at, reinforced_at, decays_after, requires_confirmation
      FROM memory_items
      ORDER BY updated_at DESC, id DESC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(MemoryItem {
      id: row.get(0)?,
      memory_type: row.get(1)?,
      content: row.get(2)?,
      confidence: row.get(3)?,
      source_kind: row.get(4)?,
      source_ref_id: row.get(5)?,
      status: row.get(6)?,
      created_at: row.get(7)?,
      updated_at: row.get(8)?,
      reinforced_at: row.get(9)?,
      decays_after: row.get(10)?,
      requires_confirmation: row.get(11)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_rules(connection: &Connection) -> Result<Vec<ProtectedRule>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, rule_kind, scope_kind, scope_ref_id, value_json,
        is_active, created_at, updated_at
      FROM rules
      ORDER BY updated_at DESC, id DESC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(ProtectedRule {
      id: row.get(0)?,
      rule_kind: row.get(1)?,
      scope_kind: row.get(2)?,
      scope_ref_id: row.get(3)?,
      value_json: row.get(4)?,
      is_active: row.get(5)?,
      created_at: row.get(6)?,
      updated_at: row.get(7)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_reflections(connection: &Connection) -> Result<Vec<ManualReflection>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, created_at, reflection_kind, text, linked_place_id,
        linked_moment_id, weight, expires_at, is_sensitive
      FROM manual_reflections
      ORDER BY created_at DESC, id DESC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(ManualReflection {
      id: row.get(0)?,
      created_at: row.get(1)?,
      reflection_kind: row.get(2)?,
      text: row.get(3)?,
      linked_place_id: row.get(4)?,
      linked_moment_id: row.get(5)?,
      weight: row.get(6)?,
      expires_at: row.get(7)?,
      is_sensitive: row.get(8)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn build_memory_overview(connection: &Connection) -> Result<MemoryOverview, AppError> {
  let place_count = connection.query_row("SELECT COUNT(*) FROM places", [], |row| row.get(0))?;
  let protected_rule_count =
    connection.query_row("SELECT COUNT(*) FROM rules WHERE is_active = 1", [], |row| row.get(0))?;
  let reflection_count =
    connection.query_row("SELECT COUNT(*) FROM manual_reflections", [], |row| row.get(0))?;
  let protected_place_count =
    connection.query_row("SELECT COUNT(*) FROM places WHERE is_protected = 1", [], |row| row.get(0))?;

  let mut statement = connection.prepare(
    r#"
      SELECT reflection_kind, COUNT(*)
      FROM manual_reflections
      GROUP BY reflection_kind
      ORDER BY COUNT(*) DESC, reflection_kind ASC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(ReflectionKindCount {
      reflection_kind: row.get(0)?,
      count: row.get(1)?,
    })
  })?;

  let reflection_kind_breakdown = rows.collect::<Result<Vec<_>, _>>()?;

  Ok(MemoryOverview {
    place_count,
    protected_rule_count,
    reflection_count,
    protected_place_count,
    reflection_kind_breakdown,
  })
}

fn get_place_by_id(connection: &Connection, id: i64) -> Result<Place, AppError> {
  connection.query_row(
    r#"
      SELECT
        id, label, latitude, longitude, radius_meters, place_kind, meaning_kind,
        is_user_named, significance_score, is_protected, notes, created_at, updated_at
      FROM places
      WHERE id = ?1
    "#,
    params![id],
    |row| {
      Ok(Place {
        id: row.get(0)?,
        label: row.get(1)?,
        latitude: row.get(2)?,
        longitude: row.get(3)?,
        radius_meters: row.get(4)?,
        place_kind: row.get(5)?,
        meaning_kind: row.get(6)?,
        is_user_named: row.get(7)?,
        significance_score: row.get(8)?,
        is_protected: row.get(9)?,
        notes: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
      })
    },
  ).map_err(AppError::from)
}

fn get_rule_by_id(connection: &Connection, id: i64) -> Result<ProtectedRule, AppError> {
  connection.query_row(
    r#"
      SELECT
        id, rule_kind, scope_kind, scope_ref_id, value_json,
        is_active, created_at, updated_at
      FROM rules
      WHERE id = ?1
    "#,
    params![id],
    |row| {
      Ok(ProtectedRule {
        id: row.get(0)?,
        rule_kind: row.get(1)?,
        scope_kind: row.get(2)?,
        scope_ref_id: row.get(3)?,
        value_json: row.get(4)?,
        is_active: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
      })
    },
  ).map_err(AppError::from)
}

fn get_reflection_by_id(connection: &Connection, id: i64) -> Result<ManualReflection, AppError> {
  connection.query_row(
    r#"
      SELECT
        id, created_at, reflection_kind, text, linked_place_id,
        linked_moment_id, weight, expires_at, is_sensitive
      FROM manual_reflections
      WHERE id = ?1
    "#,
    params![id],
    |row| {
      Ok(ManualReflection {
        id: row.get(0)?,
        created_at: row.get(1)?,
        reflection_kind: row.get(2)?,
        text: row.get(3)?,
        linked_place_id: row.get(4)?,
        linked_moment_id: row.get(5)?,
        weight: row.get(6)?,
        expires_at: row.get(7)?,
        is_sensitive: row.get(8)?,
      })
    },
  ).map_err(AppError::from)
}

fn build_memory_growth_snapshot(connection: &Connection) -> Result<MemoryGrowthSnapshot, AppError> {
  let memory_items = list_memory_items(connection)?;
  let active_count = memory_items.iter().filter(|item| item.status == "active").count();
  let fading_count = memory_items.iter().filter(|item| item.status == "fading").count();
  let awaiting_confirmation_count = memory_items
    .iter()
    .filter(|item| item.status == "awaiting_confirmation")
    .count();
  let archived_count = memory_items.iter().filter(|item| item.status == "archived").count();

  Ok(MemoryGrowthSnapshot {
    memory_items,
    active_count,
    fading_count,
    awaiting_confirmation_count,
    archived_count,
  })
}

fn update_memory_item_with_connection(
  connection: &Connection,
  payload: &UpdateMemoryItemInput,
) -> Result<(), AppError> {
  let now = Utc::now().to_rfc3339();
  let updated = match payload.action.as_str() {
    "confirm" => connection.execute(
      r#"
        UPDATE memory_items
        SET status = 'active',
            requires_confirmation = 0,
            reinforced_at = ?2,
            updated_at = ?2
        WHERE id = ?1
      "#,
      params![payload.id, now],
    )?,
    "dismiss" => connection.execute(
      r#"
        UPDATE memory_items
        SET status = 'archived',
            requires_confirmation = 0,
            updated_at = ?2
        WHERE id = ?1
      "#,
      params![payload.id, now],
    )?,
    "archive" => connection.execute(
      r#"
        UPDATE memory_items
        SET status = 'archived',
            updated_at = ?2
        WHERE id = ?1
      "#,
      params![payload.id, now],
    )?,
    "revive" => connection.execute(
      r#"
        UPDATE memory_items
        SET status = 'active',
            updated_at = ?2
        WHERE id = ?1
      "#,
      params![payload.id, now],
    )?,
    other => {
      return Err(AppError::Message(format!(
        "Unknown memory-item action '{}'.",
        other
      )))
    }
  };

  if updated == 0 {
    return Err(AppError::Message(format!(
      "Memory item {} was not found.",
      payload.id
    )));
  }

  Ok(())
}

fn upsert_memory_item_from_reflection(
  connection: &Connection,
  reflection: &ManualReflection,
) -> Result<(), AppError> {
  let now = Utc::now().to_rfc3339();
  let (memory_type, status, requires_confirmation, decays_after, confidence) =
    if reflection.is_sensitive {
      (
        "sensitive",
        "awaiting_confirmation",
        true,
        None,
        reflection.weight.max(0.55),
      )
    } else if reflection.reflection_kind == "week_state" {
      (
        "short_lived",
        "active",
        false,
        reflection
          .expires_at
          .clone()
          .or_else(|| Some((Utc::now() + chrono::Duration::days(14)).to_rfc3339())),
        reflection.weight.max(0.5),
      )
    } else if reflection.reflection_kind == "boundary" {
      ("stable", "active", false, None, reflection.weight.max(0.8))
    } else {
      ("evolving", "active", false, reflection.expires_at.clone(), reflection.weight.max(0.6))
    };

  let existing_id: Option<i64> = connection
    .query_row(
      r#"
        SELECT id
        FROM memory_items
        WHERE source_kind = 'manual_reflection' AND source_ref_id = ?1
        LIMIT 1
      "#,
      params![reflection.id],
      |row| row.get(0),
    )
    .ok();

  if let Some(id) = existing_id {
    let existing_item: (String, String, f64, String, Option<String>, bool) = connection.query_row(
      r#"
        SELECT memory_type, content, confidence, status, decays_after, requires_confirmation
        FROM memory_items
        WHERE id = ?1
      "#,
      params![id],
      |row| {
        Ok((
          row.get(0)?,
          row.get(1)?,
          row.get(2)?,
          row.get(3)?,
          row.get(4)?,
          row.get(5)?,
        ))
      },
    )?;

    if reflection.is_sensitive && existing_item.3 == "archived" && !existing_item.5 {
      return Ok(());
    }

    if existing_item.0 == memory_type
      && existing_item.1 == reflection.text
      && (existing_item.2 - confidence).abs() < f64::EPSILON
      && existing_item.3 == status
      && existing_item.4 == decays_after
      && existing_item.5 == requires_confirmation
    {
      return Ok(());
    }

    connection.execute(
      r#"
        UPDATE memory_items
        SET memory_type = ?2,
            content = ?3,
            confidence = ?4,
            status = ?5,
            updated_at = ?6,
            decays_after = ?7,
            requires_confirmation = ?8
        WHERE id = ?1
      "#,
      params![
        id,
        memory_type,
        reflection.text,
        confidence,
        status,
        now,
        decays_after,
        requires_confirmation
      ],
    )?;
  } else {
    connection.execute(
      r#"
        INSERT INTO memory_items (
          memory_type, content, confidence, source_kind, source_ref_id, status,
          created_at, updated_at, reinforced_at, decays_after, requires_confirmation
        ) VALUES (?1, ?2, ?3, 'manual_reflection', ?4, ?5, ?6, ?7, NULL, ?8, ?9)
      "#,
      params![
        memory_type,
        reflection.text,
        confidence,
        reflection.id,
        status,
        now,
        now,
        decays_after,
        requires_confirmation
      ],
    )?;
  }

  Ok(())
}

fn upsert_memory_item(
  connection: &Connection,
  source_kind: &str,
  source_ref_id: Option<i64>,
  memory_type: &str,
  content: &str,
  confidence: f64,
  status: &str,
  decays_after: Option<String>,
  requires_confirmation: bool,
) -> Result<(), AppError> {
  let now = Utc::now().to_rfc3339();
  let existing_id: Option<i64> = connection
    .query_row(
      r#"
        SELECT id
        FROM memory_items
        WHERE source_kind = ?1 AND source_ref_id IS ?2
        LIMIT 1
      "#,
      params![source_kind, source_ref_id],
      |row| row.get(0),
    )
    .ok();

  if let Some(id) = existing_id {
    let existing_item: (String, String, f64, String, Option<String>, bool) = connection.query_row(
      r#"
        SELECT memory_type, content, confidence, status, decays_after, requires_confirmation
        FROM memory_items
        WHERE id = ?1
      "#,
      params![id],
      |row| {
        Ok((
          row.get(0)?,
          row.get(1)?,
          row.get(2)?,
          row.get(3)?,
          row.get(4)?,
          row.get(5)?,
        ))
      },
    )?;

    if existing_item.0 == memory_type
      && existing_item.1 == content
      && (existing_item.2 - confidence).abs() < f64::EPSILON
      && existing_item.3 == status
      && existing_item.4 == decays_after
      && existing_item.5 == requires_confirmation
    {
      return Ok(());
    }

    connection.execute(
      r#"
        UPDATE memory_items
        SET memory_type = ?2,
            content = ?3,
            confidence = ?4,
            status = ?5,
            updated_at = ?6,
            decays_after = ?7,
            requires_confirmation = ?8
        WHERE id = ?1
      "#,
      params![
        id,
        memory_type,
        content,
        confidence,
        status,
        now,
        decays_after,
        requires_confirmation
      ],
    )?;
  } else {
    connection.execute(
      r#"
        INSERT INTO memory_items (
          memory_type, content, confidence, source_kind, source_ref_id, status,
          created_at, updated_at, reinforced_at, decays_after, requires_confirmation
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, NULL, ?8, ?9)
      "#,
      params![
        memory_type,
        content,
        confidence,
        source_kind,
        source_ref_id,
        status,
        now,
        decays_after,
        requires_confirmation
      ],
    )?;
  }

  Ok(())
}

fn upsert_memory_item_from_place(connection: &Connection, place: &Place) -> Result<(), AppError> {
  if !(place.is_user_named || place.is_protected || place.significance_score >= 0.7) {
    return Ok(());
  }

  let visit_count: i64 = connection.query_row(
    "SELECT COUNT(1) FROM place_visits WHERE place_id = ?1",
    params![place.id],
    |row| row.get(0),
  )?;

  let (memory_type, content, confidence) = if place.is_protected {
    (
      "stable",
      format!("{} should stay treated as a protected place.", place.label),
      place.significance_score.max(0.85),
    )
  } else if place.significance_score >= 0.85 || visit_count >= 3 {
    (
      "stable",
      format!("{} appears to be a stable meaningful place.", place.label),
      place.significance_score.max(if visit_count >= 3 { 0.82 } else { 0.85 }),
    )
  } else {
    (
      "evolving",
      format!("{} seems to be gaining meaning over time.", place.label),
      place.significance_score.max(0.7),
    )
  };

  upsert_memory_item(
    connection,
    "place",
    Some(place.id),
    memory_type,
    &content,
    confidence.min(1.0),
    "active",
    None,
    false,
  )
}

fn upsert_memory_item_from_feedback_pattern(
  connection: &Connection,
  moment_kind: &str,
  average_score: f64,
) -> Result<(), AppError> {
  if average_score.abs() < 0.15 {
    return Ok(());
  }

  let moment_label = moment_kind.replace('_', " ");
  let content = if average_score > 0.0 {
    format!(
      "Outreach around {} tends to feel welcome when it happens.",
      moment_label
    )
  } else {
    format!(
      "Outreach around {} needs a lighter touch or better timing.",
      moment_label
    )
  };

  upsert_memory_item(
    connection,
    "feedback_pattern",
    Some(moment_kind.bytes().fold(0_i64, |acc, byte| acc + byte as i64)),
    "evolving",
    &content,
    (0.55 + average_score.abs().min(0.35)).min(0.9),
    "active",
    Some((Utc::now() + chrono::Duration::days(21)).to_rfc3339()),
    false,
  )
}

fn upsert_memory_item_from_call_pattern(
  connection: &Connection,
  outcome_kind: &str,
  average_score: f64,
) -> Result<(), AppError> {
  if average_score.abs() < 0.1 {
    return Ok(());
  }

  let (content, confidence) = if outcome_kind == "accepted" {
    (
      "Call requests can be welcome when a moment clearly seems to matter.".to_string(),
      (0.62 + average_score.abs().min(0.22)).min(0.9),
    )
  } else {
    (
      "Call requests need a lighter touch or stronger evidence before asking.".to_string(),
      (0.62 + average_score.abs().min(0.22)).min(0.9),
    )
  };

  upsert_memory_item(
    connection,
    "call_outcome_pattern",
    Some(if outcome_kind == "accepted" { 1 } else { 2 }),
    "evolving",
    &content,
    confidence,
    "active",
    Some((Utc::now() + chrono::Duration::days(21)).to_rfc3339()),
    false,
  )
}

fn call_summary_requires_confirmation(summary: &str) -> bool {
  let lowered = summary.to_lowercase();
  [
    "hurt",
    "afraid",
    "scared",
    "cry",
    "grief",
    "panic",
    "anxious",
    "depressed",
    "trauma",
    "unsafe",
    "alone",
  ]
  .iter()
  .any(|needle| lowered.contains(needle))
}

fn upsert_memory_item_from_call_session(connection: &Connection, session: &CallSession) -> Result<(), AppError> {
  let summary = session.transcript_summary.trim();
  if session.outcome != "completed" || summary.is_empty() {
    return Ok(());
  }

  let requires_confirmation = call_summary_requires_confirmation(summary);
  let status = if requires_confirmation {
    "awaiting_confirmation"
  } else {
    "active"
  };
  let memory_type = if requires_confirmation {
    "sensitive"
  } else {
    "evolving"
  };
  let content = format!("Call note: {summary}");

  upsert_memory_item(
    connection,
    "call_session_summary",
    Some(session.id),
    memory_type,
    &content,
    0.72,
    status,
    Some((Utc::now() + chrono::Duration::days(14)).to_rfc3339()),
    requires_confirmation,
  )
}

fn run_memory_growth_pass_with_connection(connection: &Connection) -> Result<(), AppError> {
  let now = Utc::now();
  let now_string = now.to_rfc3339();

  for reflection in list_reflections(connection)? {
    upsert_memory_item_from_reflection(connection, &reflection)?;
  }

  for place in list_places(connection)? {
    upsert_memory_item_from_place(connection, &place)?;
  }

  let mut feedback_statement = connection.prepare(
    r#"
      SELECT sm.moment_kind, AVG(ofe.score)
      FROM outreach_feedback ofe
      JOIN outreach_events oe ON oe.id = ofe.outreach_event_id
      JOIN saved_moments sm ON sm.id = oe.saved_moment_id
      GROUP BY sm.moment_kind
    "#,
  )?;
  let feedback_rows = feedback_statement.query_map([], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
  })?;

  for row in feedback_rows {
    let (moment_kind, average_score) = row?;
    upsert_memory_item_from_feedback_pattern(connection, &moment_kind, average_score)?;
  }

  let mut call_outcome_statement = connection.prepare(
    r#"
      SELECT response_state, AVG(
        CASE
          WHEN response_state = 'accepted' THEN 0.3
          WHEN response_state = 'declined' THEN -0.25
          ELSE 0.0
        END
      )
      FROM outreach_events
      WHERE outreach_kind = 'call_request'
        AND response_state IN ('accepted', 'declined')
      GROUP BY response_state
    "#,
  )?;
  let call_outcome_rows = call_outcome_statement.query_map([], |row| {
    Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
  })?;

  for row in call_outcome_rows {
    let (response_state, average_score) = row?;
    upsert_memory_item_from_call_pattern(connection, &response_state, average_score)?;
  }

  let mut call_session_statement = connection.prepare(
    r#"
      SELECT
        id, created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
        started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
      FROM call_sessions
      WHERE outcome = 'completed'
        AND TRIM(transcript_summary) != ''
      ORDER BY ended_at DESC, id DESC
    "#,
  )?;
  let call_sessions = call_session_statement.query_map([], |row| {
    Ok(CallSession {
      id: row.get(0)?,
      created_at: row.get(1)?,
      outreach_event_id: row.get(2)?,
      saved_moment_id: row.get(3)?,
      handoff_kind: row.get(4)?,
      session_state: row.get(5)?,
      started_at: row.get(6)?,
      ended_at: row.get(7)?,
      outcome: row.get(8)?,
      notes: row.get(9)?,
      transcript_summary: row.get(10)?,
      duration_seconds: row.get(11)?,
    })
  })?;

  for row in call_sessions {
    let session = row?;
    upsert_memory_item_from_call_session(connection, &session)?;
  }

  connection.execute(
    r#"
      UPDATE memory_items
      SET status = 'fading',
          updated_at = ?1
      WHERE status = 'active'
        AND decays_after IS NOT NULL
        AND decays_after < ?1
    "#,
    params![now_string],
  )?;

  let archive_before = (now - chrono::Duration::days(14)).to_rfc3339();
  connection.execute(
    r#"
      UPDATE memory_items
      SET status = 'archived',
          updated_at = ?1
      WHERE status = 'fading'
        AND decays_after IS NOT NULL
        AND decays_after < ?2
    "#,
    params![now_string, archive_before],
  )?;

  let mut statement = connection.prepare(
    r#"
      SELECT mi.id, mi.content, COUNT(mr.id) AS support_count
      FROM memory_items mi
      JOIN manual_reflections mr
        ON mr.text = mi.content
       AND mr.is_sensitive = 1
      WHERE mi.status = 'awaiting_confirmation'
      GROUP BY mi.id, mi.content
    "#,
  )?;
  let rows = statement.query_map([], |row| {
    Ok((
      row.get::<_, i64>(0)?,
      row.get::<_, String>(1)?,
      row.get::<_, i64>(2)?,
    ))
  })?;

  for row in rows {
    let (memory_id, _content, support_count) = row?;
    if support_count >= 2 {
      connection.execute(
        r#"
          UPDATE memory_items
          SET status = 'active',
              reinforced_at = ?2,
              updated_at = ?2
          WHERE id = ?1
        "#,
        params![memory_id, now_string],
      )?;
    }
  }

  let mut place_feedback = connection.prepare(
    r#"
      SELECT sm.place_id, AVG(ofe.score)
      FROM outreach_feedback ofe
      JOIN outreach_events oe ON oe.id = ofe.outreach_event_id
      JOIN saved_moments sm ON sm.id = oe.saved_moment_id
      WHERE sm.place_id IS NOT NULL
      GROUP BY sm.place_id
    "#,
  )?;
  let feedback_rows = place_feedback.query_map([], |row| {
    Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
  })?;

  for row in feedback_rows {
    let (place_id, avg_score) = row?;
    let current: f64 = connection.query_row(
      "SELECT significance_score FROM places WHERE id = ?1",
      params![place_id],
      |r| r.get(0),
    )?;
    let next = (current + (avg_score * 0.15)).clamp(0.1, 1.0);
    connection.execute(
      "UPDATE places SET significance_score = ?2, updated_at = ?3 WHERE id = ?1",
      params![place_id, next, now_string],
    )?;
  }

  Ok(())
}

fn latest_raw_event(connection: &Connection) -> Result<Option<RawLocationEvent>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, occurred_at, latitude, longitude, accuracy_meters, speed_mps,
        movement_state, source, created_at
      FROM raw_location_events
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  let mut rows = statement.query([])?;
  if let Some(row) = rows.next()? {
    Ok(Some(RawLocationEvent {
      id: row.get(0)?,
      occurred_at: row.get(1)?,
      latitude: row.get(2)?,
      longitude: row.get(3)?,
      accuracy_meters: row.get(4)?,
      speed_mps: row.get(5)?,
      movement_state: row.get(6)?,
      source: row.get(7)?,
      created_at: row.get(8)?,
    }))
  } else {
    Ok(None)
  }
}

fn get_raw_event_by_id(connection: &Connection, id: i64) -> Result<RawLocationEvent, AppError> {
  connection.query_row(
    r#"
      SELECT
        id, occurred_at, latitude, longitude, accuracy_meters, speed_mps,
        movement_state, source, created_at
      FROM raw_location_events
      WHERE id = ?1
    "#,
    params![id],
    |row| {
      Ok(RawLocationEvent {
        id: row.get(0)?,
        occurred_at: row.get(1)?,
        latitude: row.get(2)?,
        longitude: row.get(3)?,
        accuracy_meters: row.get(4)?,
        speed_mps: row.get(5)?,
        movement_state: row.get(6)?,
        source: row.get(7)?,
        created_at: row.get(8)?,
      })
    },
  ).map_err(AppError::from)
}

fn classify_movement_state(
  previous_event: Option<&RawLocationEvent>,
  payload: &LocationEventInput,
) -> String {
  if payload.speed_mps.unwrap_or_default() >= 1.2 {
    return "moving".into();
  }

  if let Some(previous) = previous_event {
    let previous_time = match parse_utc(&previous.occurred_at) {
      Ok(value) => value,
      Err(_) => return "still".into(),
    };
    let current_time = match parse_utc(&payload.occurred_at) {
      Ok(value) => value,
      Err(_) => return "still".into(),
    };
    let gap_seconds = (current_time - previous_time).num_seconds().abs();

    if gap_seconds > 20 * 60 {
      return "still".into();
    }

    let distance = haversine_meters(
      previous.latitude,
      previous.longitude,
      payload.latitude,
      payload.longitude,
    );

    if distance >= 120.0 {
      return "moving".into();
    }
  }

  "still".into()
}

fn update_visits_for_event(
  connection: &Connection,
  previous_event: Option<&RawLocationEvent>,
  event: &RawLocationEvent,
) -> Result<(), AppError> {
  let open_visit = latest_open_visit(connection)?;

  match event.movement_state.as_str() {
    "still" => {
      if let Some(visit) = open_visit {
        let raw_context = serde_json::from_str::<serde_json::Value>(&visit.raw_context_json)
          .unwrap_or_else(|_| json!({}));
        let visit_lat = raw_context
          .get("anchor_latitude")
          .and_then(|value| value.as_f64())
          .unwrap_or(event.latitude);
        let visit_lng = raw_context
          .get("anchor_longitude")
          .and_then(|value| value.as_f64())
          .unwrap_or(event.longitude);
        let distance = haversine_meters(visit_lat, visit_lng, event.latitude, event.longitude);

        if distance <= 150.0 {
          let started = parse_utc(&visit.started_at)?;
          let ended = parse_utc(&event.occurred_at)?;
          let duration_seconds = (ended - started).num_seconds().max(0);
          let context = json!({
            "anchor_latitude": visit_lat,
            "anchor_longitude": visit_lng,
            "last_event_id": event.id,
            "event_count": raw_context.get("event_count").and_then(|v| v.as_i64()).unwrap_or(1) + 1
          });

          connection.execute(
            r#"
              UPDATE place_visits
              SET ended_at = ?2, duration_seconds = ?3, raw_context_json = ?4
              WHERE id = ?1
            "#,
            params![visit.id, event.occurred_at, duration_seconds, context.to_string()],
          )?;
        } else {
          close_visit(connection, &visit, previous_event)?;
          create_visit(connection, event)?;
        }
      } else {
        create_visit(connection, event)?;
      }
    }
    _ => {
      if let Some(visit) = open_visit {
        close_visit(connection, &visit, previous_event)?;
      }
    }
  }

  Ok(())
}

fn create_visit(connection: &Connection, event: &RawLocationEvent) -> Result<(), AppError> {
  let place_id = find_matching_place(connection, event.latitude, event.longitude)?;
  let context = json!({
    "anchor_latitude": event.latitude,
    "anchor_longitude": event.longitude,
    "seed_event_id": event.id,
    "event_count": 1
  });

  connection.execute(
    r#"
      INSERT INTO place_visits (
        place_id, started_at, ended_at, duration_seconds, arrival_mode,
        departure_mode, was_stationary, confidence, raw_context_json
      ) VALUES (?1, ?2, ?3, ?4, 'still', 'unknown', 1, ?5, ?6)
    "#,
    params![
      place_id,
      event.occurred_at,
      event.occurred_at,
      0_i64,
      if place_id.is_some() { 0.85 } else { 0.6 },
      context.to_string()
    ],
  )?;

  Ok(())
}

fn close_visit(
  connection: &Connection,
  visit: &PlaceVisit,
  previous_event: Option<&RawLocationEvent>,
) -> Result<(), AppError> {
  let closed_at = previous_event
    .map(|event| event.occurred_at.clone())
    .unwrap_or_else(|| visit.ended_at.clone().unwrap_or_else(|| visit.started_at.clone()));
  let started = parse_utc(&visit.started_at)?;
  let ended = parse_utc(&closed_at)?;
  let duration_seconds = (ended - started).num_seconds().max(0);

  connection.execute(
    r#"
      UPDATE place_visits
      SET ended_at = ?2, duration_seconds = ?3, departure_mode = 'moving'
      WHERE id = ?1
    "#,
    params![visit.id, closed_at, duration_seconds],
  )?;

  Ok(())
}

fn latest_open_visit(connection: &Connection) -> Result<Option<PlaceVisit>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, place_id, started_at, ended_at, duration_seconds, arrival_mode,
        departure_mode, was_stationary, confidence, raw_context_json
      FROM place_visits
      WHERE was_stationary = 1
        AND departure_mode = 'unknown'
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  let mut rows = statement.query([])?;
  if let Some(row) = rows.next()? {
    Ok(Some(PlaceVisit {
      id: row.get(0)?,
      place_id: row.get(1)?,
      started_at: row.get(2)?,
      ended_at: row.get(3)?,
      duration_seconds: row.get(4)?,
      arrival_mode: row.get(5)?,
      departure_mode: row.get(6)?,
      was_stationary: row.get(7)?,
      confidence: row.get(8)?,
      raw_context_json: row.get(9)?,
    }))
  } else {
    Ok(None)
  }
}

fn find_matching_place(
  connection: &Connection,
  latitude: f64,
  longitude: f64,
) -> Result<Option<i64>, AppError> {
  let places = list_places(connection)?;
  Ok(places
    .into_iter()
    .find(|place| {
      if let (Some(place_lat), Some(place_lng)) = (place.latitude, place.longitude) {
        haversine_meters(place_lat, place_lng, latitude, longitude) <= place.radius_meters as f64
      } else {
        false
      }
    })
    .map(|place| place.id))
}

fn list_raw_events(connection: &Connection) -> Result<Vec<RawLocationEvent>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, occurred_at, latitude, longitude, accuracy_meters, speed_mps,
        movement_state, source, created_at
      FROM raw_location_events
      ORDER BY occurred_at DESC, id DESC
      LIMIT 40
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(RawLocationEvent {
      id: row.get(0)?,
      occurred_at: row.get(1)?,
      latitude: row.get(2)?,
      longitude: row.get(3)?,
      accuracy_meters: row.get(4)?,
      speed_mps: row.get(5)?,
      movement_state: row.get(6)?,
      source: row.get(7)?,
      created_at: row.get(8)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_visits(connection: &Connection) -> Result<Vec<PlaceVisit>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, place_id, started_at, ended_at, duration_seconds, arrival_mode,
        departure_mode, was_stationary, confidence, raw_context_json
      FROM place_visits
      ORDER BY started_at DESC, id DESC
      LIMIT 25
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(PlaceVisit {
      id: row.get(0)?,
      place_id: row.get(1)?,
      started_at: row.get(2)?,
      ended_at: row.get(3)?,
      duration_seconds: row.get(4)?,
      arrival_mode: row.get(5)?,
      departure_mode: row.get(6)?,
      was_stationary: row.get(7)?,
      confidence: row.get(8)?,
      raw_context_json: row.get(9)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_saved_moments(connection: &Connection) -> Result<Vec<SavedMoment>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      FROM saved_moments
      ORDER BY created_at DESC, id DESC
      LIMIT 40
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(SavedMoment {
      id: row.get(0)?,
      created_at: row.get(1)?,
      visit_id: row.get(2)?,
      place_id: row.get(3)?,
      moment_kind: row.get(4)?,
      observed_context_json: row.get(5)?,
      inferred_significance: row.get(6)?,
      confidence: row.get(7)?,
      action_taken: row.get(8)?,
      was_promoted_to_outreach: row.get(9)?,
      resolved_at: row.get(10)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_outreach_events(connection: &Connection) -> Result<Vec<OutreachEvent>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
      FROM outreach_events
      ORDER BY created_at DESC, id DESC
      LIMIT 40
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(OutreachEvent {
      id: row.get(0)?,
      created_at: row.get(1)?,
      saved_moment_id: row.get(2)?,
      outreach_kind: row.get(3)?,
      channel: row.get(4)?,
      reason_summary: row.get(5)?,
      message_text: row.get(6)?,
      confidence: row.get(7)?,
      was_delivered: row.get(8)?,
      delivery_metadata_json: row.get(9)?,
      response_state: row.get(10)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_drafted_outreach_events(connection: &Connection) -> Result<Vec<OutreachEvent>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
      FROM outreach_events
      WHERE response_state = 'drafted'
      ORDER BY created_at ASC, id ASC
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(OutreachEvent {
      id: row.get(0)?,
      created_at: row.get(1)?,
      saved_moment_id: row.get(2)?,
      outreach_kind: row.get(3)?,
      channel: row.get(4)?,
      reason_summary: row.get(5)?,
      message_text: row.get(6)?,
      confidence: row.get(7)?,
      was_delivered: row.get(8)?,
      delivery_metadata_json: row.get(9)?,
      response_state: row.get(10)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_call_sessions(connection: &Connection) -> Result<Vec<CallSession>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
        started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
      FROM call_sessions
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(CallSession {
      id: row.get(0)?,
      created_at: row.get(1)?,
      outreach_event_id: row.get(2)?,
      saved_moment_id: row.get(3)?,
      handoff_kind: row.get(4)?,
      session_state: row.get(5)?,
      started_at: row.get(6)?,
      ended_at: row.get(7)?,
      outcome: row.get(8)?,
      notes: row.get(9)?,
      transcript_summary: row.get(10)?,
      duration_seconds: row.get(11)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_call_turns_for_session(
  connection: &Connection,
  session_id: i64,
  limit: usize,
) -> Result<Vec<CallTurnRecord>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, session_id, created_at, transcript_text, reply_text, reply_mode
      FROM call_turns
      WHERE session_id = ?1
      ORDER BY created_at DESC, id DESC
      LIMIT ?2
    "#,
  )?;

  let rows = statement.query_map(params![session_id, limit as i64], |row| {
    Ok(CallTurnRecord {
      id: row.get(0)?,
      session_id: row.get(1)?,
      created_at: row.get(2)?,
      transcript_text: row.get(3)?,
      reply_text: row.get(4)?,
      reply_mode: row.get(5)?,
    })
  })?;

  let mut turns = rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)?;
  turns.reverse();
  Ok(turns)
}

pub fn call_turns_for_session(
  db_path: &PathBuf,
  session_id: i64,
) -> Result<Vec<CallTurnRecord>, AppError> {
  let connection = Connection::open(db_path)?;
  list_call_turns_for_session(&connection, session_id, 12)
}

pub fn save_call_turn(
  db_path: &PathBuf,
  session_id: i64,
  transcript_text: &str,
  reply_text: &str,
  reply_mode: &str,
) -> Result<(), AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO call_turns (
        session_id, created_at, transcript_text, reply_text, reply_mode
      ) VALUES (?1, ?2, ?3, ?4, ?5)
    "#,
    params![
      session_id,
      Utc::now().to_rfc3339(),
      transcript_text.trim(),
      reply_text.trim(),
      reply_mode.trim(),
    ],
  )?;
  Ok(())
}

pub fn build_call_turn_context(
  db_path: &PathBuf,
  session_id: i64,
  limit: usize,
) -> Result<String, AppError> {
  let connection = Connection::open(db_path)?;
  let turns = list_call_turns_for_session(&connection, session_id, limit)?;
  if turns.is_empty() {
    return Ok(String::new());
  }

  let mut lines = Vec::new();
  for turn in turns {
    lines.push(format!("User: {}", turn.transcript_text));
    lines.push(format!("Companion: {}", turn.reply_text));
  }
  Ok(lines.join("\n"))
}

fn get_call_session_by_id(connection: &Connection, id: i64) -> Result<CallSession, AppError> {
  connection.query_row(
    r#"
      SELECT
        id, created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
        started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
      FROM call_sessions
      WHERE id = ?1
    "#,
    params![id],
    |row| {
      Ok(CallSession {
        id: row.get(0)?,
        created_at: row.get(1)?,
        outreach_event_id: row.get(2)?,
        saved_moment_id: row.get(3)?,
        handoff_kind: row.get(4)?,
        session_state: row.get(5)?,
        started_at: row.get(6)?,
        ended_at: row.get(7)?,
        outcome: row.get(8)?,
        notes: row.get(9)?,
        transcript_summary: row.get(10)?,
        duration_seconds: row.get(11)?,
      })
    },
  ).map_err(AppError::from)
}

fn build_call_session_snapshot(
  connection: &Connection,
  runtime_active_session_id: Option<i64>,
) -> Result<CallSessionSnapshot, AppError> {
  let recent_sessions = list_call_sessions(connection)?;
  let active_session = if let Some(id) = runtime_active_session_id {
    get_call_session_by_id(connection, id).ok()
  } else {
    recent_sessions
      .iter()
      .find(|session| matches!(session.session_state.as_str(), "starting" | "active"))
      .cloned()
  };

  let accepted_call_request_count: usize = connection.query_row(
    "SELECT COUNT(*) FROM outreach_events WHERE outreach_kind = 'call_request' AND response_state = 'accepted'",
    [],
    |row| row.get(0),
  )?;
  let active_session_count: usize = connection.query_row(
    "SELECT COUNT(*) FROM call_sessions WHERE session_state IN ('starting', 'active')",
    [],
    |row| row.get(0),
  )?;

  let active_session_turns = if let Some(session) = active_session.as_ref() {
    list_call_turns_for_session(connection, session.id, 8)?
  } else {
    Vec::new()
  };

  Ok(CallSessionSnapshot {
    active_session,
    active_session_turns,
    recent_sessions,
    accepted_call_request_count,
    active_session_count,
  })
}

fn build_mvp_reality_check_snapshot(
  connection: &Connection,
) -> Result<MvpRealityCheckSnapshot, AppError> {
  let raw_events = list_raw_events(connection)?;
  let visits = list_visits(connection)?;
  let saved_moments = list_saved_moments(connection)?;
  let decisions = list_moment_decisions(connection)?;
  let outreach_events = list_outreach_events(connection)?;
  let feedback_entries = list_feedback_entries(connection)?;

  let has_justified_sent_message = outreach_events.iter().any(|event| {
    event.response_state == "sent"
      && !event.reason_summary.trim().is_empty()
      && !event.message_text.trim().is_empty()
  });
  let has_protected_time_respect = decisions.iter().any(|decision| {
    decision.decision_metadata_json.contains("\"protected_time\"")
      || decision.reason_summary.to_lowercase().contains("protected quiet")
  });
  let has_quiet_when_should = decisions.iter().any(|decision| {
    decision.decision_metadata_json.contains("\"low_confidence\"")
      || decision.decision_metadata_json.contains("\"cooldown\"")
      || decision.reason_summary.to_lowercase().contains("confidence")
      || decision.reason_summary.to_lowercase().contains("cooldown")
  });
  let has_feedback_learning = decisions.iter().any(|decision| {
    decision.decision_metadata_json.contains("\"feedbackBias\"")
      && !decision.decision_metadata_json.contains("\"feedbackBias\":0.0")
      && !decision.decision_metadata_json.contains("\"feedbackBias\": 0.0")
  });

  let items = vec![
    RealityCheckItem {
      key: "justified_message".into(),
      label: "Sent at least one message that felt justified".into(),
      passed: has_justified_sent_message,
      detail: if has_justified_sent_message {
        "There is at least one sent outreach event with grounded reasoning and stored final text."
          .into()
      } else {
        "No grounded sent outreach exists yet. Seed a scenario or generate a real saved moment first."
          .into()
      },
    },
    RealityCheckItem {
      key: "protected_time".into(),
      label: "Respected sleep and protected times".into(),
      passed: has_protected_time_respect,
      detail: if has_protected_time_respect {
        "There is evidence of at least one protected-time suppression in the decision log."
          .into()
      } else {
        "No protected-time suppression has been recorded yet.".into()
      },
    },
    RealityCheckItem {
      key: "quiet_when_should".into(),
      label: "Stayed quiet when it should".into(),
      passed: has_quiet_when_should,
      detail: if has_quiet_when_should {
        "The decision log includes at least one suppression for low confidence or cooldown."
          .into()
      } else {
        "There is no evidence yet of a low-confidence or cooldown suppression.".into()
      },
    },
    RealityCheckItem {
      key: "feedback_learning".into(),
      label: "Learned from at least some feedback".into(),
      passed: has_feedback_learning,
      detail: if has_feedback_learning {
        "A later decision includes a non-zero feedback bias from previous outreach feedback."
          .into()
      } else if feedback_entries.is_empty() {
        "No feedback has been recorded yet, so learning cannot be verified.".into()
      } else {
        "Feedback exists, but no later decision has shown a non-zero learned bias yet.".into()
      },
    },
    RealityCheckItem {
      key: "presence_not_spam".into(),
      label: "Feels more like presence than notification spam".into(),
      passed: has_justified_sent_message && has_quiet_when_should,
      detail: if has_justified_sent_message && has_quiet_when_should {
        "There is evidence of both gentle outreach and intentional silence, which is the minimum MVP shape."
          .into()
      } else {
        "This still needs a real or seeded send plus at least one silence decision to judge the balance."
          .into()
      },
    },
  ];

  let mut next_actions = Vec::new();
  if raw_events.is_empty() {
    next_actions.push("Seed the controlled scenario or ingest real North Star/location events.".into());
  }
  if saved_moments.is_empty() {
    next_actions.push("Generate at least one saved moment before judging outreach quality.".into());
  }
  if !has_justified_sent_message {
    next_actions.push("Run the decision pass and send one drafted outreach intentionally.".into());
  }
  if feedback_entries.is_empty() {
    next_actions.push("Record feedback on a sent outreach so learning can be verified.".into());
  }

  Ok(MvpRealityCheckSnapshot {
    raw_event_count: raw_events.len(),
    visit_count: visits.len(),
    saved_moment_count: saved_moments.len(),
    decision_count: decisions.len(),
    sent_outreach_count: outreach_events
      .iter()
      .filter(|event| event.response_state == "sent")
      .count(),
    feedback_count: feedback_entries.len(),
    draft_outreach_count: outreach_events
      .iter()
      .filter(|event| event.response_state == "drafted")
      .count(),
    items,
    next_actions,
  })
}

fn list_moment_decisions(connection: &Connection) -> Result<Vec<MomentDecision>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, saved_moment_id, decided_at, decision_kind, reason_summary,
        decision_metadata_json, created_outreach_event_id
      FROM moment_decisions
      ORDER BY decided_at DESC, id DESC
      LIMIT 40
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(MomentDecision {
      id: row.get(0)?,
      saved_moment_id: row.get(1)?,
      decided_at: row.get(2)?,
      decision_kind: row.get(3)?,
      reason_summary: row.get(4)?,
      decision_metadata_json: row.get(5)?,
      created_outreach_event_id: row.get(6)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn list_feedback_entries(connection: &Connection) -> Result<Vec<OutreachFeedback>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT
        id, outreach_event_id, feedback_kind, score, notes, created_at
      FROM outreach_feedback
      ORDER BY created_at DESC, id DESC
      LIMIT 80
    "#,
  )?;

  let rows = statement.query_map([], |row| {
    Ok(OutreachFeedback {
      id: row.get(0)?,
      outreach_event_id: row.get(1)?,
      feedback_kind: row.get(2)?,
      score: row.get(3)?,
      notes: row.get(4)?,
      created_at: row.get(5)?,
    })
  })?;

  rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn get_outreach_event_by_id(connection: &Connection, id: i64) -> Result<OutreachEvent, AppError> {
  connection
    .query_row(
      r#"
        SELECT
          id, created_at, saved_moment_id, outreach_kind, channel, reason_summary,
          message_text, confidence, was_delivered, delivery_metadata_json, response_state
        FROM outreach_events
        WHERE id = ?1
      "#,
      params![id],
      |row| {
        Ok(OutreachEvent {
          id: row.get(0)?,
          created_at: row.get(1)?,
          saved_moment_id: row.get(2)?,
          outreach_kind: row.get(3)?,
          channel: row.get(4)?,
          reason_summary: row.get(5)?,
          message_text: row.get(6)?,
          confidence: row.get(7)?,
          was_delivered: row.get(8)?,
          delivery_metadata_json: row.get(9)?,
          response_state: row.get(10)?,
        })
      },
    )
    .map_err(AppError::from)
}

fn get_feedback_by_id(connection: &Connection, id: i64) -> Result<OutreachFeedback, AppError> {
  connection
    .query_row(
      r#"
        SELECT
          id, outreach_event_id, feedback_kind, score, notes, created_at
        FROM outreach_feedback
        WHERE id = ?1
      "#,
      params![id],
      |row| {
        Ok(OutreachFeedback {
          id: row.get(0)?,
          outreach_event_id: row.get(1)?,
          feedback_kind: row.get(2)?,
          score: row.get(3)?,
          notes: row.get(4)?,
          created_at: row.get(5)?,
        })
      },
    )
    .map_err(AppError::from)
}

fn get_inbound_message_by_update_id(
  connection: &Connection,
  update_id: i64,
) -> Result<InboundMessage, AppError> {
  connection
    .query_row(
      r#"
        SELECT
          id, created_at, outreach_event_id, telegram_update_id, telegram_message_id,
          chat_id, sender_id, text, received_at
        FROM inbound_messages
        WHERE telegram_update_id = ?1
      "#,
      params![update_id],
      |row| {
        Ok(InboundMessage {
          id: row.get(0)?,
          created_at: row.get(1)?,
          outreach_event_id: row.get(2)?,
          telegram_update_id: row.get(3)?,
          telegram_message_id: row.get(4)?,
          chat_id: row.get(5)?,
          sender_id: row.get(6)?,
          text: row.get(7)?,
          received_at: row.get(8)?,
        })
      },
    )
    .map_err(AppError::from)
}

fn get_moment_decision_by_saved_moment_id(
  connection: &Connection,
  saved_moment_id: i64,
) -> Result<MomentDecision, AppError> {
  connection
    .query_row(
      r#"
        SELECT
          id, saved_moment_id, decided_at, decision_kind, reason_summary,
          decision_metadata_json, created_outreach_event_id
        FROM moment_decisions
        WHERE saved_moment_id = ?1
      "#,
      params![saved_moment_id],
      |row| {
        Ok(MomentDecision {
          id: row.get(0)?,
          saved_moment_id: row.get(1)?,
          decided_at: row.get(2)?,
          decision_kind: row.get(3)?,
          reason_summary: row.get(4)?,
          decision_metadata_json: row.get(5)?,
          created_outreach_event_id: row.get(6)?,
        })
      },
    )
    .map_err(AppError::from)
}

fn latest_outreach_event_for_chat(
  connection: &Connection,
  chat_id: &str,
) -> Result<Option<i64>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT id
      FROM outreach_events
      WHERE json_extract(delivery_metadata_json, '$.chat_id') = ?1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  let mut rows = statement.query(params![chat_id])?;
  if let Some(row) = rows.next()? {
    Ok(Some(row.get(0)?))
  } else {
    Ok(None)
  }
}

fn latest_recent_outreach_at(
  connection: &Connection,
) -> Result<Option<DateTime<Utc>>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT created_at
      FROM outreach_events
      WHERE was_delivered = 1 OR response_state = 'drafted'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  let mut rows = statement.query([])?;
  if let Some(row) = rows.next()? {
    let value: String = row.get(0)?;
    Ok(Some(parse_utc(&value)?))
  } else {
    Ok(None)
  }
}

fn upsert_setting(connection: &Connection, key: &str, value_json: &str) -> Result<(), AppError> {
  connection.execute(
    r#"
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    "#,
    params![key, value_json, Utc::now().to_rfc3339()],
  )?;
  Ok(())
}

fn create_reality_check_place(
  db_path: &PathBuf,
  label: &str,
  latitude: f64,
  longitude: f64,
  place_kind: &str,
  meaning_kind: &str,
  is_protected: bool,
  notes: &str,
) -> Result<Place, AppError> {
  let connection = Connection::open(db_path)?;
  if let Ok(existing) = connection.query_row(
    r#"
      SELECT
        id, label, latitude, longitude, radius_meters, place_kind, meaning_kind,
        is_user_named, significance_score, is_protected, notes, created_at, updated_at
      FROM places
      WHERE label = ?1
      LIMIT 1
    "#,
    params![label],
    |row| {
      Ok(Place {
        id: row.get(0)?,
        label: row.get(1)?,
        latitude: row.get(2)?,
        longitude: row.get(3)?,
        radius_meters: row.get(4)?,
        place_kind: row.get(5)?,
        meaning_kind: row.get(6)?,
        is_user_named: row.get(7)?,
        significance_score: row.get(8)?,
        is_protected: row.get(9)?,
        notes: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
      })
    },
  ) {
    return Ok(existing);
  }

  create_place(
    db_path,
    &CreatePlaceInput {
      label: label.into(),
      latitude: Some(latitude),
      longitude: Some(longitude),
      radius_meters: 120,
      place_kind: place_kind.into(),
      meaning_kind: meaning_kind.into(),
      is_user_named: true,
      is_protected,
      notes: notes.into(),
    },
  )
}

fn create_reality_check_reflection(
  db_path: &PathBuf,
  reflection_kind: &str,
  text: &str,
) -> Result<(), AppError> {
  let connection = Connection::open(db_path)?;
  let exists: i64 = connection.query_row(
    "SELECT COUNT(*) FROM manual_reflections WHERE reflection_kind = ?1 AND text = ?2",
    params![reflection_kind, text],
    |row| row.get(0),
  )?;

  if exists > 0 {
    return Ok(());
  }

  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: reflection_kind.into(),
      text: text.into(),
      linked_place_id: None,
      weight: 0.8,
      expires_at: None,
      is_sensitive: false,
    },
  )?;

  Ok(())
}

fn run_single_message_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  seed_mvp_reality_check_scenario(db_path)?;
  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "single_message_path".into(),
    scenario_label: "Single Message Path".into(),
    seeded_event_count: 9,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Created a realistic visit pattern and advanced it through one-at-a-time decision drafting.".into(),
  })
}

fn run_quiet_hours_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  seed_mvp_reality_check_scenario(db_path)?;
  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T01:30:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "quiet_hours_boundary".into(),
    scenario_label: "Quiet Hours Boundary".into(),
    seeded_event_count: 9,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Created a meaningful moment and evaluated it inside quiet hours so boundaries could be checked.".into(),
  })
}

fn run_call_request_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let mut settings = load_settings(db_path)?;
  settings.call_requests_enabled = true;
  settings.call_confidence_threshold = 0.85;
  settings.call_cooldown_minutes = 720;
  save_settings(db_path, &settings)?;

  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES
      (?1, 1, NULL, 'meaningful_departure', '{}', 'Fresh strong moment suited for a call request', 0.92, 'silent_save', 0, NULL)
    "#,
    params!["2026-03-23T18:20:00Z"],
  )?;

  let decision_result =
    run_call_request_decisions_at(db_path, parse_utc("2026-03-23T18:30:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "call_request_path".into(),
    scenario_label: "Call Request Path".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Enabled call requests, seeded one stronger moment, and ran the stricter call-request decision path.".into(),
  })
}

fn run_call_request_runtime_seed_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let mut settings = load_settings(db_path)?;
  settings.call_requests_enabled = true;
  settings.call_confidence_threshold = 0.85;
  settings.call_cooldown_minutes = 720;
  save_settings(db_path, &settings)?;

  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES
      (?1, 1, NULL, 'meaningful_departure', '{}', 'Fresh strong moment waiting for the runtime call-request pass', 0.92, 'silent_save', 0, NULL)
    "#,
    params!["2026-03-23T18:20:00Z"],
  )?;

  Ok(SimulationRunResult {
    scenario_key: "call_request_runtime_seed".into(),
    scenario_label: "Call Request Runtime Seed".into(),
    seeded_event_count: 0,
    promoted_count: 0,
    suppressed_count: 0,
    draft_count: 0,
    draft_preview: None,
    summary: "Seeded one unresolved call-ready moment. Next step: open Runtime and click 'Run call request pass'.".into(),
  })
}

fn run_accepted_call_request_starts_session_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'accepted call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'accepted')
    "#,
    params![
      "2026-03-23T18:00:00Z",
      json!({ "chat_id": "8713170057", "telegram_message_id": 901 }).to_string()
    ],
  )?;
  let outreach_event_id = connection.last_insert_rowid();

  let session = start_call_session(
    db_path,
    &StartCallSessionInput {
      outreach_event_id: Some(outreach_event_id),
      handoff_kind: "accepted_handoff".into(),
      notes: "Simulation accepted handoff.".into(),
    },
  )?;

  Ok(SimulationRunResult {
    scenario_key: "accepted_call_request_starts_session".into(),
    scenario_label: "Accepted Call Request Starts Session".into(),
    seeded_event_count: 0,
    promoted_count: if session.session_state == "active" { 1 } else { 0 },
    suppressed_count: 0,
    draft_count: 1,
    draft_preview: Some(format!("{} / {}", session.handoff_kind, session.session_state)),
    summary: "Started a real active call session from an accepted call request.".into(),
  })
}

fn run_completed_call_session_is_logged_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'completed call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'accepted')
    "#,
    params![
      "2026-03-23T18:10:00Z",
      json!({ "chat_id": "8713170057", "telegram_message_id": 902 }).to_string()
    ],
  )?;
  let outreach_event_id = connection.last_insert_rowid();
  let session = start_call_session(
    db_path,
    &StartCallSessionInput {
      outreach_event_id: Some(outreach_event_id),
      handoff_kind: "accepted_handoff".into(),
      notes: "Simulation completed handoff.".into(),
    },
  )?;
  let ended = end_call_session(
    db_path,
    &EndCallSessionInput {
      session_id: session.id,
      outcome: "completed".into(),
      transcript_summary: "We had a short grounded call and ended calmly.".into(),
      notes: "Simulation completed call.".into(),
    },
  )?;

  Ok(SimulationRunResult {
    scenario_key: "completed_call_session_is_logged".into(),
    scenario_label: "Completed Call Session Is Logged".into(),
    seeded_event_count: 0,
    promoted_count: if ended.outcome == "completed" { 1 } else { 0 },
    suppressed_count: 0,
    draft_count: 1,
    draft_preview: Some(ended.transcript_summary.clone()),
    summary: "Ended a call session and kept the final outcome, timing, and summary.".into(),
  })
}

fn run_feedback_learning_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, 1, NULL, 'long_pause', '{}', 'Past long pause', 0.82, 'outreach_candidate', 1, ?2)
    "#,
    params![
      "2026-03-20T10:00:00Z",
      "2026-03-20T10:05:00Z",
    ],
  )?;
  let past_moment_id = connection.last_insert_rowid();

  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, 2, NULL, 'long_pause', '{}', 'Future long pause', 0.62, 'silent_save', 0, NULL)
    "#,
    params!["2026-03-23T10:00:00Z"],
  )?;

  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, ?2, 'message', 'north_star', 'seed', 'seed', 0.82, 1, '{}', 'sent')
    "#,
    params!["2026-03-20T10:06:00Z", past_moment_id],
  )?;
  let outreach_event_id = connection.last_insert_rowid();

  submit_outreach_feedback(
    db_path,
    &SubmitFeedbackInput {
      outreach_event_id,
      feedback_kind: "intrusive".into(),
      notes: String::new(),
    },
  )?;

  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "feedback_learning".into(),
    scenario_label: "Feedback Learning".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Seeded intrusive feedback first, then checked whether a similar later moment was softened by learning.".into(),
  })
}

fn run_cooldown_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, 1, NULL, 'meaningful_departure', '{}', 'Fresh strong moment', 0.81, 'silent_save', 0, NULL)
    "#,
    params!["2026-03-23T13:55:00Z"],
  )?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'message', 'north_star', 'recent send', 'recent send', 0.9, 1, '{}', 'sent')
    "#,
    params!["2026-03-23T13:40:00Z"],
  )?;

  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "cooldown_blocks_second_message".into(),
    scenario_label: "Cooldown Blocks Second Message".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Created a fresh strong moment while a recent sent outreach was still inside the cooldown window.".into(),
  })
}

fn run_low_confidence_noise_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES
      (?1, 1, NULL, 'rhythm_break', '{}', 'weak break', 0.31, 'silent_save', 0, NULL),
      (?2, 2, NULL, 'long_pause', '{}', 'weak pause', 0.41, 'silent_save', 0, NULL),
      (?3, 3, NULL, 'unusual_return', '{}', 'weak return', 0.38, 'silent_save', 0, NULL)
    "#,
    params![
      "2026-03-23T09:00:00Z",
      "2026-03-23T09:05:00Z",
      "2026-03-23T09:10:00Z",
    ],
  )?;

  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "low_confidence_noise_batch".into(),
    scenario_label: "Low-Confidence Noise Batch".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Seeded multiple weak moments to verify that noise stays silent instead of generating outreach.".into(),
  })
}

fn run_welcome_feedback_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, 1, NULL, 'long_pause', '{}', 'Past welcome pause', 0.62, 'outreach_candidate', 1, ?2)
    "#,
    params!["2026-03-18T10:00:00Z", "2026-03-18T10:05:00Z"],
  )?;
  let past_moment_id = connection.last_insert_rowid();

  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, ?2, 'message', 'north_star', 'welcome seed', 'welcome seed', 0.62, 1, '{}', 'sent')
    "#,
    params!["2026-03-18T10:06:00Z", past_moment_id],
  )?;
  let outreach_event_id = connection.last_insert_rowid();

  submit_outreach_feedback(
    db_path,
    &SubmitFeedbackInput {
      outreach_event_id,
      feedback_kind: "welcome".into(),
      notes: String::new(),
    },
  )?;

  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, 2, NULL, 'long_pause', '{}', 'Future supported pause', 0.45, 'silent_save', 0, NULL)
    "#,
    params!["2026-03-23T10:00:00Z"],
  )?;

  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "welcome_feedback_supports_future_promotion".into(),
    scenario_label: "Welcome Feedback Supports Future Promotion".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Seeded welcome feedback first, then checked whether a similar lower-confidence moment was helped into one draft.".into(),
  })
}

fn run_repeat_moments_single_draft_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES
      (?1, 1, NULL, 'long_pause', '{}', 'Strong pause A', 0.81, 'silent_save', 0, NULL),
      (?2, 2, NULL, 'meaningful_departure', '{}', 'Strong departure B', 0.79, 'silent_save', 0, NULL),
      (?3, 3, NULL, 'unusual_return', '{}', 'Strong return C', 0.74, 'silent_save', 0, NULL)
    "#,
    params![
      "2026-03-23T09:00:00Z",
      "2026-03-23T09:05:00Z",
      "2026-03-23T09:10:00Z",
    ],
  )?;

  let decision_result = run_message_decisions_at(db_path, parse_utc("2026-03-23T14:00:00Z")?)?;
  let drafts = drafted_outreach_events(db_path)?;
  let draft_count = drafts.len();

  Ok(SimulationRunResult {
    scenario_key: "repeat_moments_still_only_one_draft".into(),
    scenario_label: "Repeat Moments Still Only One Draft".into(),
    seeded_event_count: 0,
    promoted_count: decision_result.promoted_count,
    suppressed_count: decision_result.suppressed_count,
    draft_count,
    draft_preview: drafts.first().map(|draft| draft.message_text.clone()),
    summary: "Seeded several strong moments together and verified that only one draft survives the pass.".into(),
  })
}

fn run_repeated_place_promotes_to_stable_memory_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let place = create_place(
    db_path,
    &CreatePlaceInput {
      label: "Harbor bench".into(),
      latitude: Some(52.3676),
      longitude: Some(4.9041),
      radius_meters: 110,
      place_kind: "reflection".into(),
      meaning_kind: "return".into(),
      is_user_named: true,
      is_protected: false,
      notes: "Keeps becoming part of the week.".into(),
    },
  )?;

  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO place_visits (
        place_id, started_at, ended_at, duration_seconds, arrival_mode, departure_mode,
        was_stationary, confidence, raw_context_json
      ) VALUES
      (?1, ?2, ?3, 3600, 'walking', 'walking', 1, 0.9, '{}'),
      (?1, ?4, ?5, 4200, 'walking', 'walking', 1, 0.9, '{}'),
      (?1, ?6, ?7, 3000, 'walking', 'walking', 1, 0.9, '{}')
    "#,
    params![
      place.id,
      "2026-03-20T09:00:00Z",
      "2026-03-20T10:00:00Z",
      "2026-03-21T09:00:00Z",
      "2026-03-21T10:10:00Z",
      "2026-03-22T09:00:00Z",
      "2026-03-22T09:50:00Z",
    ],
  )?;

  let snapshot = run_memory_growth_pass(db_path)?;
  let stable_item = snapshot
    .memory_items
    .iter()
    .find(|item| item.source_kind == "place" && item.memory_type == "stable");

  Ok(SimulationRunResult {
    scenario_key: "repeated_place_promotes_to_stable_memory".into(),
    scenario_label: "Repeated Place Promotes To Stable Memory".into(),
    seeded_event_count: 3,
    promoted_count: usize::from(stable_item.is_some()),
    suppressed_count: 0,
    draft_count: snapshot.memory_items.len(),
    draft_preview: stable_item.map(|item| item.content.clone()),
    summary: "Created repeated visits to one meaningful place, then checked whether memory growth treated it as stable instead of only evolving.".into(),
  })
}

fn run_stale_week_state_fades_simulation(db_path: &PathBuf) -> Result<SimulationRunResult, AppError> {
  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "week_state".into(),
      text: "This week felt unusually heavy.".into(),
      linked_place_id: None,
      weight: 0.7,
      expires_at: Some("2026-03-01T00:00:00Z".into()),
      is_sensitive: false,
    },
  )?;

  let snapshot = run_memory_growth_pass(db_path)?;
  let transitioned_item = snapshot
    .memory_items
    .iter()
    .find(|item| {
      item.source_kind == "manual_reflection"
        && item.memory_type == "short_lived"
        && item.status != "active"
    });

  Ok(SimulationRunResult {
    scenario_key: "stale_week_state_fades".into(),
    scenario_label: "Stale Week State Fades".into(),
    seeded_event_count: 1,
    promoted_count: 0,
    suppressed_count: usize::from(transitioned_item.is_some()),
    draft_count: snapshot.memory_items.len(),
    draft_preview: transitioned_item.map(|item| format!("{} [{}]", item.content, item.status)),
    summary: "Created an already-expired week-state reflection and checked that memory growth moved it out of active memory.".into(),
  })
}

fn run_accepted_call_request_strengthens_memory_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'drafted')
    "#,
    params![
      "2026-03-23T10:00:00Z",
      json!({ "chat_id": "8713170057" }).to_string()
    ],
  )?;
  let outreach_event_id = connection.last_insert_rowid();

  save_inbound_message(
    db_path,
    1001,
    Some(501),
    "8713170057",
    Some("user"),
    "Yes, you can call.",
    "2026-03-23T10:02:00Z",
  )?;

  let snapshot = run_memory_growth_pass(db_path)?;
  let call_memory = snapshot
    .memory_items
    .iter()
    .find(|item| item.source_kind == "call_outcome_pattern" && item.content.to_lowercase().contains("welcome"));

  Ok(SimulationRunResult {
    scenario_key: "accepted_call_request_strengthens_memory".into(),
    scenario_label: "Accepted Call Request Strengthens Memory".into(),
    seeded_event_count: usize::from(outreach_event_id > 0),
    promoted_count: usize::from(call_memory.is_some()),
    suppressed_count: 0,
    draft_count: snapshot.memory_items.len(),
    draft_preview: call_memory.map(|item| item.content.clone()),
    summary: "Seeded an accepted call-request reply and checked that memory growth kept a positive call-readiness pattern.".into(),
  })
}

fn run_declined_call_request_softens_memory_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'drafted')
    "#,
    params![
      "2026-03-23T10:00:00Z",
      json!({ "chat_id": "8713170057" }).to_string()
    ],
  )?;

  save_inbound_message(
    db_path,
    1002,
    Some(502),
    "8713170057",
    Some("user"),
    "Not now, maybe later.",
    "2026-03-23T10:02:00Z",
  )?;

  let snapshot = run_memory_growth_pass(db_path)?;
  let call_memory = snapshot
    .memory_items
    .iter()
    .find(|item| item.source_kind == "call_outcome_pattern" && item.content.to_lowercase().contains("lighter touch"));

  Ok(SimulationRunResult {
    scenario_key: "declined_call_request_softens_memory".into(),
    scenario_label: "Declined Call Request Softens Memory".into(),
    seeded_event_count: 1,
    promoted_count: 0,
    suppressed_count: usize::from(call_memory.is_some()),
    draft_count: snapshot.memory_items.len(),
    draft_preview: call_memory.map(|item| item.content.clone()),
    summary: "Seeded a declined call-request reply and checked that memory growth recorded a lighter-touch call pattern.".into(),
  })
}

fn run_sensitive_memory_waits_for_confirmation_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "meaning".into(),
      text: "This feels deeply personal.".into(),
      linked_place_id: None,
      weight: 0.78,
      expires_at: None,
      is_sensitive: true,
    },
  )?;

  let snapshot = run_memory_growth_pass(db_path)?;
  let waiting_item = snapshot.memory_items.iter().find(|item| {
    item.source_kind == "manual_reflection"
      && item.requires_confirmation
      && item.status == "awaiting_confirmation"
  });

  Ok(SimulationRunResult {
    scenario_key: "sensitive_memory_waits_for_confirmation".into(),
    scenario_label: "Sensitive Memory Waits For Confirmation".into(),
    seeded_event_count: 1,
    promoted_count: 0,
    suppressed_count: usize::from(waiting_item.is_some()),
    draft_count: snapshot.memory_items.len(),
    draft_preview: waiting_item.map(|item| item.content.clone()),
    summary: "Created a sensitive reflection and checked that the memory pass left it awaiting confirmation.".into(),
  })
}

fn run_dismissed_sensitive_memory_stays_archived_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "meaning".into(),
      text: "This should not be kept automatically.".into(),
      linked_place_id: None,
      weight: 0.8,
      expires_at: None,
      is_sensitive: true,
    },
  )?;

  let first_snapshot = run_memory_growth_pass(db_path)?;
  let waiting_item = first_snapshot
    .memory_items
    .iter()
    .find(|item| item.requires_confirmation)
    .ok_or_else(|| AppError::Message("Expected a sensitive memory awaiting confirmation.".into()))?;

  let dismissed_snapshot = update_memory_item(
    db_path,
    &UpdateMemoryItemInput {
      id: waiting_item.id,
      action: "dismiss".into(),
    },
  )?;
  let second_snapshot = run_memory_growth_pass(db_path)?;

  let archived_item = second_snapshot
    .memory_items
    .iter()
    .find(|item| item.id == waiting_item.id && item.status == "archived");

  Ok(SimulationRunResult {
    scenario_key: "dismissed_sensitive_memory_stays_archived".into(),
    scenario_label: "Dismissed Sensitive Memory Stays Archived".into(),
    seeded_event_count: usize::from(!dismissed_snapshot.memory_items.is_empty()),
    promoted_count: 0,
    suppressed_count: usize::from(archived_item.is_some()),
    draft_count: second_snapshot.memory_items.len(),
    draft_preview: archived_item.map(|item| format!("{} [{}]", item.content, item.status)),
    summary: "Dismissed a sensitive memory, then checked that a later growth pass left it archived instead of reactivating it.".into(),
  })
}

fn run_no_new_evidence_causes_no_memory_change_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  create_place(
    db_path,
    &CreatePlaceInput {
      label: "Quiet river spot".into(),
      latitude: Some(52.3676),
      longitude: Some(4.9041),
      radius_meters: 90,
      place_kind: "reflection".into(),
      meaning_kind: "reflection".into(),
      is_user_named: true,
      is_protected: false,
      notes: "A place that already matters.".into(),
    },
  )?;

  let first_snapshot = run_memory_growth_pass(db_path)?;
  let second_snapshot = run_memory_growth_pass(db_path)?;
  let changed_count = second_snapshot
    .memory_items
    .iter()
    .filter(|item| {
      first_snapshot
        .memory_items
        .iter()
        .find(|previous| previous.id == item.id)
        .is_some_and(|previous| {
          previous.status != item.status
            || previous.memory_type != item.memory_type
            || previous.reinforced_at != item.reinforced_at
            || previous.updated_at != item.updated_at
        })
    })
    .count();

  Ok(SimulationRunResult {
    scenario_key: "no_new_evidence_causes_no_memory_change".into(),
    scenario_label: "No New Evidence Causes No Memory Change".into(),
    seeded_event_count: 1,
    promoted_count: 0,
    suppressed_count: changed_count,
    draft_count: second_snapshot.memory_items.len(),
    draft_preview: second_snapshot.memory_items.first().map(|item| item.content.clone()),
    summary: "Ran memory growth twice on unchanged state and checked that the second pass made no substantive memory changes.".into(),
  })
}

fn run_routine_place_does_not_become_rhythm_break_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let place = create_place(
    db_path,
    &CreatePlaceInput {
      label: "Morning cafe".into(),
      latitude: Some(52.3676),
      longitude: Some(4.9041),
      radius_meters: 100,
      place_kind: "routine".into(),
      meaning_kind: "return".into(),
      is_user_named: true,
      is_protected: false,
      notes: "Stable part of the week.".into(),
    },
  )?;

  let connection = Connection::open(db_path)?;
  connection.execute(
    r#"
      INSERT INTO place_visits (
        place_id, started_at, ended_at, duration_seconds, arrival_mode, departure_mode,
        was_stationary, confidence, raw_context_json
      ) VALUES
      (?1, ?2, ?3, 2400, 'walking', 'moving', 1, 0.9, ?4),
      (?1, ?5, ?6, 2400, 'walking', 'moving', 1, 0.9, ?7),
      (?1, ?8, ?9, 2400, 'walking', 'moving', 1, 0.9, ?10)
    "#,
    params![
      place.id,
      "2026-03-10T09:00:00Z",
      "2026-03-10T09:40:00Z",
      json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
      "2026-03-17T09:05:00Z",
      "2026-03-17T09:45:00Z",
      json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
      "2026-03-24T09:10:00Z",
      "2026-03-24T09:50:00Z",
      json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
    ],
  )?;

  derive_saved_moments(&connection)?;
  let moments = list_saved_moments(&connection)?;
  let created_rhythm_break = moments.iter().any(|moment| moment.moment_kind == "rhythm_break");

  Ok(SimulationRunResult {
    scenario_key: "routine_place_does_not_become_rhythm_break".into(),
    scenario_label: "Routine Place Does Not Become Rhythm Break".into(),
    seeded_event_count: 3,
    promoted_count: 0,
    suppressed_count: usize::from(!created_rhythm_break),
    draft_count: moments.len(),
    draft_preview: moments.first().map(|moment| moment.inferred_significance.clone()),
    summary: "Seeded a repeated stable routine and checked that the discernment layer did not misread it as a rhythm break.".into(),
  })
}

fn lived_moment_simulation_result(
  db_path: &PathBuf,
  scenario_key: &str,
  scenario_label: &str,
  seeded_event_count: usize,
  now: DateTime<Utc>,
  summary_prefix: &str,
) -> Result<SimulationRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  let snapshot = build_lived_moment_snapshot(&connection, "Europe/Amsterdam", now)?;
  let draft_preview = Some(format!(
    "{} / {} / {}",
    snapshot.primary_assessment,
    snapshot.recommended_signal,
    snapshot.summary
  ));

  Ok(SimulationRunResult {
    scenario_key: scenario_key.into(),
    scenario_label: scenario_label.into(),
    seeded_event_count,
    promoted_count: snapshot
      .actionable_signals
      .iter()
      .filter(|signal| signal.kind != "stay_quiet")
      .count(),
    suppressed_count: usize::from(snapshot.recommended_signal == "stay_quiet"),
    draft_count: snapshot.assessments.len(),
    draft_preview,
    summary: format!(
      "{summary_prefix} Primary read: {}. Recommended signal: {}.",
      snapshot.primary_assessment, snapshot.recommended_signal
    ),
  })
}

fn run_lived_moment_open_window_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let place = create_place(
    db_path,
    &CreatePlaceInput {
      label: "Canal edge".into(),
      latitude: Some(52.3676),
      longitude: Some(4.9041),
      radius_meters: 140,
      place_kind: "reflection".into(),
      meaning_kind: "possibility".into(),
      is_user_named: true,
      is_protected: false,
      notes: "A place that feels alive and slightly wider than routine.".into(),
    },
  )?;

  create_companion_context_entry(
    db_path,
    &CreateCompanionContextEntryInput {
      category_key: "hobbies".into(),
      title: "Night walks".into(),
      body: "Night walks by the water make me feel open, alive, and more available to possibility.".into(),
      tags: vec!["alive".into(), "outside".into(), "walks".into()],
      notes: "Seeded lived-moment open window.".into(),
    },
  )?;

  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "week_state".into(),
      text: "Tonight feels open, alive, and like I should not miss the window.".into(),
      linked_place_id: Some(place.id),
      weight: 0.84,
      expires_at: None,
      is_sensitive: false,
    },
  )?;

  run_context_memory_pass(db_path)?;

  for (occurred_at, speed_mps) in [
    ("2026-03-29T19:55:00Z", 0.0),
    ("2026-03-29T20:35:00Z", 0.0),
  ] {
    ingest_location_event(
      db_path,
      &LocationEventInput {
        occurred_at: occurred_at.into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(14.0),
        speed_mps: Some(speed_mps),
        source: "simulation".into(),
      },
    )?;
  }

  lived_moment_simulation_result(
    db_path,
    "lived_moment_open_window",
    "Lived Moment Open Window",
    4,
    parse_utc("2026-03-29T20:40:00Z")?,
    "Seeded an unusually alive evening moment.",
  )
}

fn run_lived_moment_protective_window_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  let place = create_place(
    db_path,
    &CreatePlaceInput {
      label: "Home".into(),
      latitude: Some(52.3676),
      longitude: Some(4.9041),
      radius_meters: 120,
      place_kind: "home".into(),
      meaning_kind: "belonging".into(),
      is_user_named: true,
      is_protected: true,
      notes: "Protected late-night space.".into(),
    },
  )?;

  create_companion_context_entry(
    db_path,
    &CreateCompanionContextEntryInput {
      category_key: "life_principles".into(),
      title: "Quiet nights matter".into(),
      body: "Late at night I need gentleness, less noise, and fewer demands.".into(),
      tags: vec!["quiet".into(), "night".into(), "boundary".into()],
      notes: "Seeded lived-moment protective window.".into(),
    },
  )?;

  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "meaning".into(),
      text: "Tonight feels tender and I do not want anything loud pushed at me.".into(),
      linked_place_id: Some(place.id),
      weight: 0.86,
      expires_at: None,
      is_sensitive: true,
    },
  )?;

  run_context_memory_pass(db_path)?;

  for occurred_at in ["2026-03-29T23:35:00Z", "2026-03-30T00:25:00Z"] {
    ingest_location_event(
      db_path,
      &LocationEventInput {
        occurred_at: occurred_at.into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(10.0),
        speed_mps: Some(0.0),
        source: "simulation".into(),
      },
    )?;
  }

  lived_moment_simulation_result(
    db_path,
    "lived_moment_protective_window",
    "Lived Moment Protective Window",
    4,
    parse_utc("2026-03-30T00:30:00Z")?,
    "Seeded a late sensitive home moment.",
  )
}

fn run_lived_moment_transition_window_simulation(
  db_path: &PathBuf,
) -> Result<SimulationRunResult, AppError> {
  create_companion_context_entry(
    db_path,
    &CreateCompanionContextEntryInput {
      category_key: "goals".into(),
      title: "Move toward the water".into(),
      body: "I want life to feel calmer, wider, and closer to the water again.".into(),
      tags: vec!["future".into(), "move".into(), "change".into()],
      notes: "Seeded lived-moment transition window.".into(),
    },
  )?;

  run_context_memory_pass(db_path)?;

  let entry = find_companion_context_entry_by_category_and_title(&Connection::open(db_path)?, "goals", "Move toward the water")?
    .ok_or_else(|| AppError::Message("Expected transition seed entry.".into()))?;

  update_companion_context_entry(
    db_path,
    &UpdateCompanionContextEntryInput {
      id: entry.id,
      title: entry.title,
      body: "I still want to move toward the water, but lately it feels unstable, close, and not fully decided.".into(),
      tags: vec!["future".into(), "shift".into(), "threshold".into()],
      notes: "Seeded drift for transition-heavy lived moment.".into(),
      is_active: true,
    },
  )?;

  create_reflection(
    db_path,
    &CreateReflectionInput {
      reflection_kind: "week_state".into(),
      text: "This week feels like a threshold instead of a stable continuation.".into(),
      linked_place_id: None,
      weight: 0.78,
      expires_at: None,
      is_sensitive: false,
    },
  )?;

  run_context_memory_pass(db_path)?;

  create_place(
    db_path,
    &CreatePlaceInput {
      label: "Riverside route".into(),
      latitude: Some(52.3705),
      longitude: Some(4.9125),
      radius_meters: 150,
      place_kind: "discovery".into(),
      meaning_kind: "return".into(),
      is_user_named: false,
      is_protected: false,
      notes: "A route connected to possible change.".into(),
    },
  )?;

  ingest_location_event(
    db_path,
    &LocationEventInput {
      occurred_at: "2026-03-29T17:40:00Z".into(),
      latitude: 52.3705,
      longitude: 4.9125,
      accuracy_meters: Some(16.0),
      speed_mps: Some(0.0),
      source: "simulation".into(),
    },
  )?;
  ingest_location_event(
    db_path,
    &LocationEventInput {
      occurred_at: "2026-03-29T18:25:00Z".into(),
      latitude: 52.3705,
      longitude: 4.9125,
      accuracy_meters: Some(16.0),
      speed_mps: Some(0.0),
      source: "simulation".into(),
    },
  )?;

  lived_moment_simulation_result(
    db_path,
    "lived_moment_transition_window",
    "Lived Moment Transition Window",
    5,
    parse_utc("2026-03-29T18:30:00Z")?,
    "Seeded drift and accumulated movement around a threshold.",
  )
}

fn build_simulation_suite_checks(
  scenario_results: &[SimulationRunResult],
) -> Vec<SimulationSuiteCheck> {
  let mut checks = Vec::new();

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "single_message_path")
  {
    checks.push(SimulationSuiteCheck {
      key: "single_message_path".into(),
      label: "Single message path creates exactly one draft".into(),
      passed: result.promoted_count == 1 && result.draft_count == 1,
      detail: format!(
        "Promoted {}, drafts {}.",
        result.promoted_count, result.draft_count
      ),
    });

    let draft = result.draft_preview.clone().unwrap_or_default().to_lowercase();
    let banned_terms = ["system", "test", "confidence", "memory engine", "reality check"];
    let leaked = banned_terms
      .iter()
      .filter(|term| draft.contains(**term))
      .copied()
      .collect::<Vec<_>>();
    checks.push(SimulationSuiteCheck {
      key: "message_hygiene".into(),
      label: "Single-message draft avoids internal wording".into(),
      passed: leaked.is_empty(),
      detail: if leaked.is_empty() {
        "No banned internal/system wording was found in the drafted message.".into()
      } else {
        format!("Draft still contains: {}.", leaked.join(", "))
      },
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "call_request_path")
  {
    checks.push(SimulationSuiteCheck {
      key: "call_request_path".into(),
      label: "Call-request path creates exactly one call draft".into(),
      passed: result.promoted_count == 1
        && result.draft_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|draft| draft.to_lowercase().contains("call you for a moment")),
      detail: format!(
        "Promoted {}, drafts {}, preview {:?}.",
        result.promoted_count, result.draft_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "accepted_call_request_starts_session")
  {
    checks.push(SimulationSuiteCheck {
      key: "accepted_call_request_starts_session".into(),
      label: "Accepted call request can hand off into an active call session".into(),
      passed: result.promoted_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.contains("active")),
      detail: format!(
        "Call handoff result {}, preview {:?}.",
        result.promoted_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "completed_call_session_is_logged")
  {
    checks.push(SimulationSuiteCheck {
      key: "completed_call_session_is_logged".into(),
      label: "Completed call sessions keep a visible summary".into(),
      passed: result.promoted_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.to_lowercase().contains("grounded call")),
      detail: format!(
        "Completed call result {}, preview {:?}.",
        result.promoted_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "quiet_hours_boundary")
  {
    checks.push(SimulationSuiteCheck {
      key: "quiet_hours_boundary".into(),
      label: "Quiet-hours scenario stays silent".into(),
      passed: result.promoted_count == 0 && result.draft_count == 0 && result.suppressed_count > 0,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "feedback_learning")
  {
    checks.push(SimulationSuiteCheck {
      key: "feedback_learning".into(),
      label: "Feedback-learning scenario suppresses future overreach".into(),
      passed: result.promoted_count == 0 && result.suppressed_count > 0,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "cooldown_blocks_second_message")
  {
    checks.push(SimulationSuiteCheck {
      key: "cooldown_blocks_second_message".into(),
      label: "Cooldown blocks a second strong message".into(),
      passed: result.promoted_count == 0 && result.draft_count == 0 && result.suppressed_count > 0,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "low_confidence_noise_batch")
  {
    checks.push(SimulationSuiteCheck {
      key: "low_confidence_noise_batch".into(),
      label: "Low-confidence noise stays silent".into(),
      passed: result.promoted_count == 0 && result.draft_count == 0 && result.suppressed_count >= 3,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "welcome_feedback_supports_future_promotion")
  {
    checks.push(SimulationSuiteCheck {
      key: "welcome_feedback_supports_future_promotion".into(),
      label: "Welcome feedback can support a similar future moment".into(),
      passed: result.promoted_count == 1 && result.draft_count == 1,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "repeat_moments_still_only_one_draft")
  {
    checks.push(SimulationSuiteCheck {
      key: "repeat_moments_still_only_one_draft".into(),
      label: "Several strong moments still collapse to one draft".into(),
      passed: result.promoted_count == 1 && result.draft_count == 1 && result.suppressed_count >= 2,
      detail: format!(
        "Promoted {}, suppressed {}, drafts {}.",
        result.promoted_count, result.suppressed_count, result.draft_count
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "repeated_place_promotes_to_stable_memory")
  {
    checks.push(SimulationSuiteCheck {
      key: "repeated_place_promotes_to_stable_memory".into(),
      label: "Repeated meaningful place can harden into stable memory".into(),
      passed: result.promoted_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.to_lowercase().contains("stable meaningful place")),
      detail: format!(
        "Stable promotions {}, memory items {}, preview {:?}.",
        result.promoted_count, result.draft_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "stale_week_state_fades")
  {
    checks.push(SimulationSuiteCheck {
      key: "stale_week_state_fades".into(),
      label: "Expired week-state memory leaves active status".into(),
      passed: result.suppressed_count == 1,
      detail: format!(
        "Moved out of active {}, memory items {}, preview {:?}.",
        result.suppressed_count, result.draft_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "accepted_call_request_strengthens_memory")
  {
    checks.push(SimulationSuiteCheck {
      key: "accepted_call_request_strengthens_memory".into(),
      label: "Accepted call requests strengthen positive call memory".into(),
      passed: result.promoted_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.to_lowercase().contains("welcome")),
      detail: format!(
        "Positive call-memory items {}, preview {:?}.",
        result.promoted_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "declined_call_request_softens_memory")
  {
    checks.push(SimulationSuiteCheck {
      key: "declined_call_request_softens_memory".into(),
      label: "Declined call requests record a lighter-touch memory".into(),
      passed: result.suppressed_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.to_lowercase().contains("lighter touch")),
      detail: format!(
        "Lighter-touch call-memory items {}, preview {:?}.",
        result.suppressed_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "sensitive_memory_waits_for_confirmation")
  {
    checks.push(SimulationSuiteCheck {
      key: "sensitive_memory_waits_for_confirmation".into(),
      label: "Sensitive memory stays tentative until confirmed".into(),
      passed: result.suppressed_count == 1,
      detail: format!(
        "Awaiting-confirmation items {}, preview {:?}.",
        result.suppressed_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "dismissed_sensitive_memory_stays_archived")
  {
    checks.push(SimulationSuiteCheck {
      key: "dismissed_sensitive_memory_stays_archived".into(),
      label: "Dismissed sensitive memory stays archived".into(),
      passed: result.suppressed_count == 1
        && result
          .draft_preview
          .as_ref()
          .is_some_and(|preview| preview.to_lowercase().contains("[archived]")),
      detail: format!(
        "Archived-after-dismiss items {}, preview {:?}.",
        result.suppressed_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "no_new_evidence_causes_no_memory_change")
  {
    checks.push(SimulationSuiteCheck {
      key: "no_new_evidence_causes_no_memory_change".into(),
      label: "Second growth pass stays stable when nothing new happened".into(),
      passed: result.suppressed_count == 0,
      detail: format!(
        "Substantive changes on second pass {}, preview {:?}.",
        result.suppressed_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "routine_place_does_not_become_rhythm_break")
  {
    checks.push(SimulationSuiteCheck {
      key: "routine_place_does_not_become_rhythm_break".into(),
      label: "Stable routine does not get misread as a rhythm break".into(),
      passed: result.suppressed_count == 1,
      detail: format!(
        "Routine-safe result {}, moments {}, preview {:?}.",
        result.suppressed_count, result.draft_count, result.draft_preview
      ),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "lived_moment_open_window")
  {
    let preview = result.draft_preview.clone().unwrap_or_default().to_lowercase();
    checks.push(SimulationSuiteCheck {
      key: "lived_moment_open_window".into(),
      label: "Open-window scenario reads as open or opportunity-rich".into(),
      passed: preview.contains("open") || preview.contains("opportunity-rich"),
      detail: format!("Preview {:?}.", result.draft_preview),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "lived_moment_protective_window")
  {
    let preview = result.draft_preview.clone().unwrap_or_default().to_lowercase();
    checks.push(SimulationSuiteCheck {
      key: "lived_moment_protective_window".into(),
      label: "Protective-window scenario leans protective or quiet".into(),
      passed: preview.contains("protective") || preview.contains("stay_quiet"),
      detail: format!("Preview {:?}.", result.draft_preview),
    });
  }

  if let Some(result) = scenario_results.iter().find(|item| item.scenario_key == "lived_moment_transition_window")
  {
    let preview = result.draft_preview.clone().unwrap_or_default().to_lowercase();
    checks.push(SimulationSuiteCheck {
      key: "lived_moment_transition_window".into(),
      label: "Transition-window scenario reads as transition-heavy or watchful".into(),
      passed: preview.contains("transition-heavy") || preview.contains("watch_for_escalation"),
      detail: format!("Preview {:?}.", result.draft_preview),
    });
  }

  checks
}

fn feedback_score(feedback_kind: &str) -> f64 {
  match feedback_kind {
    "helpful" => 0.25,
    "welcome" => 0.2,
    "mistimed" => -0.2,
    "intrusive" => -0.35,
    _ => 0.0,
  }
}

fn feedback_bias_for_moment_kind(
  connection: &Connection,
  moment_kind: &str,
) -> Result<f64, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT AVG(ofe.score)
      FROM outreach_feedback ofe
      JOIN outreach_events oe ON oe.id = ofe.outreach_event_id
      JOIN saved_moments sm ON sm.id = oe.saved_moment_id
      WHERE sm.moment_kind = ?1
    "#,
  )?;

  let average: Option<f64> = statement.query_row(params![moment_kind], |row| row.get(0))?;
  Ok(average.unwrap_or(0.0))
}

fn lived_moment_message_bias(snapshot: &LivedMomentSnapshot) -> f64 {
  let contact_bias = match snapshot.recommended_contact_mode.as_str() {
    "stay_silent" => -0.03,
    "send_light_message" => 0.04,
    "make_soft_suggestion" => 0.03,
    "suggest_human_contact" => 0.03,
    "send_warning" => -0.02,
    "escalate_to_call" => -0.05,
    _ => 0.0,
  };
  let signal_bias = match snapshot.recommended_signal.as_str() {
    "enrich_this_moment" => 0.02,
    "surface_this_opening" => 0.02,
    "watch_for_escalation" => -0.01,
    "warn_now" => -0.03,
    "stay_quiet" => -0.02,
    _ => 0.0,
  };
  f64::min(f64::max(contact_bias + signal_bias, -0.08_f64), 0.08_f64)
}

fn lived_moment_call_bias(snapshot: &LivedMomentSnapshot) -> f64 {
  let contact_bias = match snapshot.recommended_contact_mode.as_str() {
    "stay_silent" => -0.03,
    "send_light_message" => -0.02,
    "make_soft_suggestion" => -0.01,
    "suggest_human_contact" => 0.01,
    "send_warning" => 0.04,
    "escalate_to_call" => 0.06,
    _ => 0.0,
  };
  let signal_bias = match snapshot.recommended_signal.as_str() {
    "warn_now" => 0.04,
    "watch_for_escalation" => 0.02,
    "stay_quiet" => -0.02,
    "enrich_this_moment" => -0.01,
    "surface_this_opening" => -0.01,
    _ => 0.0,
  };
  f64::min(f64::max(contact_bias + signal_bias, -0.08_f64), 0.1_f64)
}

fn lived_moment_pillar(snapshot: &LivedMomentSnapshot) -> &'static str {
  match snapshot.recommended_signal.as_str() {
    "warn_now" => "situational_safeguarding",
    "surface_this_opening" => {
      if !snapshot.relational_bridges.is_empty() {
        "relational_bridging"
      } else {
        "opportunity_guidance"
      }
    }
    "watch_for_escalation" => "phase_navigation",
    "enrich_this_moment" => "lived_moment_enrichment",
    _ => {
      if !snapshot.relational_bridges.is_empty() {
        "relational_bridging"
      } else if snapshot.primary_assessment == "transition-heavy" {
        "phase_navigation"
      } else if !snapshot.opportunities.is_empty() {
        "opportunity_guidance"
      } else if !snapshot.safeguards.is_empty() {
        "situational_safeguarding"
      } else {
        "lived_moment_enrichment"
      }
    }
  }
}

fn escalation_stage(snapshot: &LivedMomentSnapshot) -> &'static str {
  match snapshot.recommended_contact_mode.as_str() {
    "stay_silent" => "silence",
    "send_light_message" => "light_message",
    "make_soft_suggestion" => "soft_suggestion",
    "suggest_human_contact" => "bridging_suggestion",
    "send_warning" => "warning_message",
    "escalate_to_call" => "call_escalation",
    _ => "silence",
  }
}

fn lived_moment_metadata(snapshot: &LivedMomentSnapshot) -> serde_json::Value {
  json!({
    "pillar": lived_moment_pillar(snapshot),
    "primaryAssessment": snapshot.primary_assessment,
    "recommendedSignal": snapshot.recommended_signal,
    "recommendedContactMode": snapshot.recommended_contact_mode,
    "contactRhythmHint": snapshot.contact_rhythm_hint,
    "recentContactLoad": snapshot.recent_contact_load,
    "recentContactSummary": snapshot.recent_contact_summary,
    "escalationStage": escalation_stage(snapshot),
    "topOpportunity": snapshot.opportunities.first().map(|item| item.kind.clone()),
    "topSafeguard": snapshot.safeguards.first().map(|item| item.kind.clone()),
    "topSituationalSignal": snapshot.situational_signals.first().map(|item| item.kind.clone()),
    "topRelationalBridge": snapshot.relational_bridges.first().map(|item| item.title.clone())
  })
}

fn run_message_decisions_at(
  db_path: &PathBuf,
  evaluation_time: DateTime<Utc>,
) -> Result<DecisionRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  let settings = load_settings(db_path)?;
  let lived_moment_snapshot =
    build_lived_moment_snapshot(&connection, &settings.timezone, evaluation_time)?;
  let lived_moment_bias = lived_moment_message_bias(&lived_moment_snapshot);
  let saved_moments = list_saved_moments(&connection)?;
  let rules = list_rules(&connection)?;
  let recent_outreach_at = latest_recent_outreach_at(&connection)?;
  let mut promoted_count = 0;
  let mut suppressed_count = 0;
  let mut decisions = Vec::new();
  let mut promotion_reserved = false;

  for moment in saved_moments
    .iter()
    .filter(|moment| moment.resolved_at.is_none())
    .filter(|moment| get_moment_decision_by_saved_moment_id(&connection, moment.id).is_err())
  {
    let feedback_bias = feedback_bias_for_moment_kind(&connection, &moment.moment_kind)?;
    let adjusted_confidence = (moment.confidence + feedback_bias + lived_moment_bias).clamp(0.0, 1.0);
    let (decision_kind, reason_summary, metadata, outreach_event_id) =
      if adjusted_confidence < settings.medium_confidence_threshold {
        (
          "suppress",
          "Suppressed because the moment confidence is below the medium-confidence threshold."
            .to_string(),
          json!({
            "confidence": moment.confidence,
            "adjustedConfidence": adjusted_confidence,
            "feedbackBias": feedback_bias,
            "livedMomentBias": lived_moment_bias,
            "threshold": settings.medium_confidence_threshold,
            "kind": "low_confidence",
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if is_in_protected_quiet_time(&settings, &rules, evaluation_time)? {
        (
          "suppress",
          "Suppressed because the current time falls inside sleep or protected quiet hours."
            .to_string(),
          json!({
            "kind": "protected_time",
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if promotion_reserved {
        (
          "suppress",
          "Suppressed because another stronger moment was already selected in this decision pass."
            .to_string(),
          json!({
            "kind": "batch_limit",
            "limit": 1,
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if let Some(last_outreach_at) = recent_outreach_at {
        let minutes_since = (evaluation_time - last_outreach_at).num_minutes();
        if minutes_since < settings.message_cooldown_minutes {
          (
            "suppress",
            "Suppressed because the message cooldown window is still active.".to_string(),
            json!({
              "kind": "cooldown",
              "minutesSinceLastOutreach": minutes_since,
              "cooldownMinutes": settings.message_cooldown_minutes,
              "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
            }),
            None,
          )
        } else {
          let outreach = create_draft_outreach(&connection, &settings, moment)?;
          (
            "promote_to_outreach",
            "Promoted because the moment cleared the deterministic message rules.".to_string(),
            json!({
              "kind": "eligible",
              "confidence": moment.confidence,
              "adjustedConfidence": adjusted_confidence,
              "feedbackBias": feedback_bias,
              "livedMomentBias": lived_moment_bias,
              "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
            }),
            Some(outreach.id),
          )
        }
      } else {
        let outreach = create_draft_outreach(&connection, &settings, moment)?;
        (
          "promote_to_outreach",
          "Promoted because the moment cleared the deterministic message rules.".to_string(),
          json!({
            "kind": "eligible",
            "confidence": moment.confidence,
            "adjustedConfidence": adjusted_confidence,
            "feedbackBias": feedback_bias,
            "livedMomentBias": lived_moment_bias,
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          Some(outreach.id),
        )
      };

    connection.execute(
      r#"
        INSERT INTO moment_decisions (
          saved_moment_id, decided_at, decision_kind, reason_summary,
          decision_metadata_json, created_outreach_event_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      "#,
      params![
        moment.id,
        evaluation_time.to_rfc3339(),
        decision_kind,
        reason_summary,
        metadata.to_string(),
        outreach_event_id
      ],
    )?;

    connection.execute(
      r#"
        UPDATE saved_moments
        SET
          action_taken = ?2,
          was_promoted_to_outreach = ?3,
          resolved_at = ?4
        WHERE id = ?1
      "#,
      params![
        moment.id,
        if decision_kind == "promote_to_outreach" {
          "outreach_candidate"
        } else {
          "suppressed"
        },
        decision_kind == "promote_to_outreach",
        evaluation_time.to_rfc3339()
      ],
    )?;

    let decision = get_moment_decision_by_saved_moment_id(&connection, moment.id)?;
    if decision.decision_kind == "promote_to_outreach" {
      promoted_count += 1;
      promotion_reserved = true;
    } else {
      suppressed_count += 1;
    }
    decisions.push(decision);
  }

  Ok(DecisionRunResult {
    promoted_count,
    suppressed_count,
    decisions,
  })
}

fn run_call_request_decisions_at(
  db_path: &PathBuf,
  evaluation_time: DateTime<Utc>,
) -> Result<DecisionRunResult, AppError> {
  let connection = Connection::open(db_path)?;
  let settings = load_settings(db_path)?;
  if !settings.call_requests_enabled {
    return Ok(DecisionRunResult {
      promoted_count: 0,
      suppressed_count: 0,
      decisions: Vec::new(),
    });
  }

  let lived_moment_snapshot =
    build_lived_moment_snapshot(&connection, &settings.timezone, evaluation_time)?;
  let lived_moment_bias = lived_moment_call_bias(&lived_moment_snapshot);
  let saved_moments = list_saved_moments(&connection)?;
  let rules = list_rules(&connection)?;
  let recent_outreach_at = latest_recent_outreach_at(&connection)?;
  let mut promoted_count = 0;
  let mut suppressed_count = 0;
  let mut decisions = Vec::new();
  let mut promotion_reserved = false;

  for moment in saved_moments
    .iter()
    .filter(|moment| moment.resolved_at.is_none())
    .filter(|moment| get_moment_decision_by_saved_moment_id(&connection, moment.id).is_err())
  {
    let feedback_bias = feedback_bias_for_moment_kind(&connection, &moment.moment_kind)?;
    let adjusted_confidence = (moment.confidence + feedback_bias + lived_moment_bias).clamp(0.0, 1.0);
    let (decision_kind, reason_summary, metadata, outreach_event_id) =
      if adjusted_confidence < settings.call_confidence_threshold {
        (
          "suppress",
          "Suppressed because the moment did not clear the stronger call-request threshold."
            .to_string(),
          json!({
            "confidence": moment.confidence,
            "adjustedConfidence": adjusted_confidence,
            "feedbackBias": feedback_bias,
            "livedMomentBias": lived_moment_bias,
            "threshold": settings.call_confidence_threshold,
            "kind": "call_threshold",
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if is_in_protected_quiet_time(&settings, &rules, evaluation_time)? {
        (
          "suppress",
          "Suppressed because the current time falls inside sleep or protected quiet hours."
            .to_string(),
          json!({
            "kind": "protected_time",
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if promotion_reserved {
        (
          "suppress",
          "Suppressed because another stronger moment was already selected for a call request."
            .to_string(),
          json!({
            "kind": "batch_limit",
            "limit": 1,
            "outreachKind": "call_request",
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          None,
        )
      } else if let Some(last_outreach_at) = recent_outreach_at {
        let minutes_since = (evaluation_time - last_outreach_at).num_minutes();
        if minutes_since < settings.call_cooldown_minutes {
          (
            "suppress",
            "Suppressed because the call-request cooldown window is still active.".to_string(),
            json!({
              "kind": "call_cooldown",
              "minutesSinceLastOutreach": minutes_since,
              "cooldownMinutes": settings.call_cooldown_minutes,
              "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
            }),
            None,
          )
        } else {
          let outreach = create_draft_outreach_with_kind(
            &connection,
            &settings,
            moment,
            "call_request",
          )?;
          (
            "promote_to_call_request",
            "Promoted because the moment cleared the stricter call-request rules.".to_string(),
            json!({
              "kind": "eligible_call_request",
              "confidence": moment.confidence,
              "adjustedConfidence": adjusted_confidence,
              "feedbackBias": feedback_bias,
              "livedMomentBias": lived_moment_bias,
              "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
            }),
            Some(outreach.id),
          )
        }
      } else {
        let outreach =
          create_draft_outreach_with_kind(&connection, &settings, moment, "call_request")?;
        (
          "promote_to_call_request",
          "Promoted because the moment cleared the stricter call-request rules.".to_string(),
          json!({
            "kind": "eligible_call_request",
            "confidence": moment.confidence,
            "adjustedConfidence": adjusted_confidence,
            "feedbackBias": feedback_bias,
            "livedMomentBias": lived_moment_bias,
            "livedMoment": lived_moment_metadata(&lived_moment_snapshot)
          }),
          Some(outreach.id),
        )
      };

    connection.execute(
      r#"
        INSERT INTO moment_decisions (
          saved_moment_id, decided_at, decision_kind, reason_summary,
          decision_metadata_json, created_outreach_event_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      "#,
      params![
        moment.id,
        evaluation_time.to_rfc3339(),
        decision_kind,
        reason_summary,
        metadata.to_string(),
        outreach_event_id
      ],
    )?;

    connection.execute(
      r#"
        UPDATE saved_moments
        SET
          action_taken = ?2,
          was_promoted_to_outreach = ?3,
          resolved_at = ?4
        WHERE id = ?1
      "#,
      params![
        moment.id,
        if decision_kind == "promote_to_call_request" {
          "call_request_candidate"
        } else {
          "suppressed"
        },
        decision_kind == "promote_to_call_request",
        evaluation_time.to_rfc3339()
      ],
    )?;

    let decision = get_moment_decision_by_saved_moment_id(&connection, moment.id)?;
    if decision.decision_kind == "promote_to_call_request" {
      promoted_count += 1;
      promotion_reserved = true;
    } else {
      suppressed_count += 1;
    }
    decisions.push(decision);
  }

  Ok(DecisionRunResult {
    promoted_count,
    suppressed_count,
    decisions,
  })
}

fn create_draft_outreach(
  connection: &Connection,
  settings: &AppSettings,
  moment: &SavedMoment,
) -> Result<OutreachEvent, AppError> {
  create_draft_outreach_with_kind(connection, settings, moment, "message")
}

fn create_draft_outreach_with_kind(
  connection: &Connection,
  settings: &AppSettings,
  moment: &SavedMoment,
  outreach_kind: &str,
) -> Result<OutreachEvent, AppError> {
  let variation_seed = message_variation_seed();
  let structured =
    build_structured_message_with_seed(connection, moment, variation_seed, outreach_kind)?;
  let draft = compose_grounded_message(settings, moment, &structured, variation_seed, outreach_kind)?;
  connection.execute(
    r#"
      INSERT INTO outreach_events (
        created_at, saved_moment_id, outreach_kind, channel, reason_summary,
        message_text, confidence, was_delivered, delivery_metadata_json, response_state
      ) VALUES (?1, ?2, ?3, 'north_star', ?4, ?5, ?6, 0, ?7, 'drafted')
    "#,
    params![
      Utc::now().to_rfc3339(),
      moment.id,
      outreach_kind,
      moment.inferred_significance,
      draft,
      moment.confidence,
      build_draft_metadata(settings, &structured)?
    ],
  )?;
  get_outreach_event_by_id(connection, connection.last_insert_rowid())
}

fn compose_grounded_message(
  settings: &AppSettings,
  moment: &SavedMoment,
  structured: &str,
  variation_seed: i64,
  outreach_kind: &str,
) -> Result<String, AppError> {
  if let Some(rewritten) =
    rewrite_with_lm_studio(settings, structured, moment, variation_seed, outreach_kind)?
  {
    return Ok(rewritten);
  }
  Ok(structured.to_string())
}

fn build_structured_message(
  connection: &Connection,
  moment: &SavedMoment,
) -> Result<String, AppError> {
  build_structured_message_with_seed(connection, moment, moment.id, "message")
}

fn build_structured_message_with_seed(
  connection: &Connection,
  moment: &SavedMoment,
  variation_seed: i64,
  outreach_kind: &str,
) -> Result<String, AppError> {
  let observed_context: serde_json::Value =
    serde_json::from_str(&moment.observed_context_json).unwrap_or_else(|_| json!({}));
  let place_label = match moment.place_id {
    Some(place_id) => get_place_by_id(connection, place_id).ok().map(|place| place.label),
    None => observed_context
      .get("placeLabel")
      .and_then(|value| value.as_str())
      .map(ToOwned::to_owned),
  }
  .and_then(|label| human_message_place_label(&label));
  let recent_week_state = latest_week_state_reflection(connection)?;
  let duration_minutes = observed_context
    .get("durationSeconds")
    .and_then(|value| value.as_i64())
    .map(|seconds| seconds / 60)
    .filter(|minutes| *minutes > 0);
  let baseline_minutes = observed_context
    .get("baselineDurationSeconds")
    .and_then(|value| value.as_i64())
    .map(|seconds| seconds / 60)
    .filter(|minutes| *minutes > 0);
  let closing = safe_message_closing(moment.id ^ variation_seed);

  if outreach_kind == "call_request" {
    let message = match moment.moment_kind.as_str() {
     "meaningful_departure" => {
       if let Some(place_label) = &place_label {
         format!(
            "Hey, you just left {place_label}, and this one feels like it might matter. Would it help if I call you for a moment?"
          )
        } else {
          "Hey, this moment feels like it might matter. Would it help if I call you for a moment?".to_string()
        }
      }
      "unusual_return" => {
        if let Some(place_label) = &place_label {
          format!(
            "Hey, I notice you keep coming back to {place_label}, and this one feels like it might matter. Would it help if I call you for a moment?"
          )
        } else {
          "Hey, I notice this place keeps coming up for you, and this one feels like it might matter. Would it help if I call you for a moment?".to_string()
        }
      }
      "long_pause" => "Hey, this pause feels like it might matter. Would it help if I call you for a moment?".to_string(),
      "rhythm_break" => "Hey, something about this moment feels like it might matter. Would it help if I call you for a moment?".to_string(),
      _ => "Hey, this moment feels like it might matter. Would it help if I call you for a moment?".to_string(),
    };

    return Ok(message);
  }

  let message = match moment.moment_kind.as_str() {
    "long_pause" => {
      if let (Some(place_label), Some(minutes), Some(baseline)) =
        (&place_label, duration_minutes, baseline_minutes)
      {
        format!(
          "Hey, I see you stayed at {place_label} a bit longer than usual, around {minutes} minutes instead of {baseline}. {closing}"
        )
      } else if let Some(minutes) = duration_minutes {
        format!(
          "Hey, I see you are pausing here for a while, around {minutes} minutes. {closing}"
        )
      } else {
        format!("Hey, I see you are pausing in this place for a bit. {closing}")
      }
    }
    "meaningful_departure" => {
      if let Some(place_label) = &place_label {
        format!(
          "Hey, you just left {place_label}. Places like that can linger a little, so {closing}"
        )
      } else {
        format!("Hey, it looks like you just left a place that may matter a bit. {closing}")
      }
    }
    "unusual_return" => {
      if let Some(place_label) = &place_label {
        format!(
          "Hey, I see you go back to {place_label} lately. {closing}"
        )
      } else {
        format!("Hey, I see you go back to this place more lately. {closing}")
      }
    }
    "rhythm_break" => {
      if recent_week_state.is_some() {
        format!("Hey, this stop feels a little different from your usual rhythm, especially this week. {closing}")
      } else {
        format!("Hey, this stop feels a little different from your usual rhythm. {closing}")
      }
    }
    _ => format!("Hey, something about this moment stood out a little, and {closing}"),
  };

  Ok(message)
}

fn message_variation_seed() -> i64 {
  Utc::now()
    .timestamp_nanos_opt()
    .unwrap_or_else(|| Utc::now().timestamp_micros() * 1_000)
}

fn safe_message_closing(seed: i64) -> &'static str {
  match seed.rem_euclid(4) {
    0 => "I'm here with you.",
    1 => "Just letting you know I'm here with you.",
    2 => "Just wanted you to know I'm here with you.",
    _ => "I'm right here with you.",
  }
}

fn human_message_place_label(label: &str) -> Option<String> {
  let trimmed = label.trim();
  if trimmed.is_empty() {
    return None;
  }

  let lowered = trimmed.to_lowercase();
  if ["reality check", "test", "seed", "system", "debug", "mock"]
    .iter()
    .any(|marker| lowered.contains(marker))
  {
    return None;
  }

  Some(trimmed.to_string())
}

fn latest_week_state_reflection(connection: &Connection) -> Result<Option<String>, AppError> {
  let mut statement = connection.prepare(
    r#"
      SELECT text
      FROM manual_reflections
      WHERE reflection_kind = 'week_state'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    "#,
  )?;

  let mut rows = statement.query([])?;
  if let Some(row) = rows.next()? {
    Ok(Some(row.get(0)?))
  } else {
    Ok(None)
  }
}

fn rewrite_with_lm_studio(
  settings: &AppSettings,
  structured_message: &str,
  moment: &SavedMoment,
  variation_seed: i64,
  outreach_kind: &str,
) -> Result<Option<String>, AppError> {
  if settings.lm_studio_endpoint.trim().is_empty()
    || settings.lm_studio_model.trim().is_empty()
    || settings.lm_studio_api_key.trim().is_empty()
  {
    return Ok(None);
  }

  let endpoint = settings
    .lm_studio_endpoint
    .trim_end_matches('/')
    .to_string();
  let mode_guidance = if outreach_kind == "call_request" {
    "This is a call-request draft, not a regular message. Keep it short, gentle, and earned. Ask simply whether a call would help for a moment. Do not sound urgent, demanding, or dramatic."
  } else {
    "This is a regular companion message. End simply and keep it grounded in quiet presence."
  };
  let preferred_closing = safe_message_closing(variation_seed);
  let alternate_closing = safe_message_closing(variation_seed + 1);
  let prompt = format!(
    "Lightly rewrite the following companion outreach draft. Keep the same meaning, keep the same facts, and stay close to the original, but allow one small natural variation in wording. Your job is to make it sound a little more human, not to explain more. Stay under 70 words. Do not add analysis, interpretation, reassurance, therapy language, or system-like wording. Do not mention system terms, model terms, memory-engine language, confidence scores, or internal/test place labels. If a place name sounds internal or synthetic, rewrite it into natural human wording instead of repeating it.\n\n{mode_guidance}\n\nPreferred style:\n- short\n- simple\n- human\n- calm\n- direct\n- presence over explanation\n\nGood examples:\n- Hey, I see you go to this place more lately. Just letting you know I'm here with you.\n- Hey, I notice this place keeps coming up for you. I'm here with you.\n- Hey, seems like this place has been showing up more lately. Just wanted you to know I'm here with you.\n- Hey, I keep seeing you come back here a bit more lately. I'm right here with you.\n- Hey, this feels like it might matter. Would it help if I call you for a moment?\n- Hey, this one feels worth pausing for. Would it help if I call you for a moment?\n\nAvoid examples like:\n- It felt more intentional than usual.\n- It seemed worth gently acknowledging.\n- No pressure to reply.\n- No need to reply.\n- I'm thinking of you.\n- I wanted to check in.\n- I didn't want to miss it either.\n- this feels heavier than usual.\n\nEnd simply. Do not keep using the exact same closing every time. For this pass, prefer a closing in the style of:\n- {preferred_closing}\nYou may also use a nearby allowed closing like:\n- {alternate_closing}\n\nAllowed closing family for regular messages:\n- I'm here with you.\n- Just letting you know I'm here with you.\n- Just wanted you to know I'm here with you.\n- I'm right here with you.\n\nReturn only one final message.\n\nMoment kind: {}\nDraft:\n{}",
    moment.moment_kind, structured_message
  );

  let client = reqwest::blocking::Client::new();
  let response = client
    .post(format!("{endpoint}/v1/chat/completions"))
    .bearer_auth(&settings.lm_studio_api_key)
    .json(&json!({
      "model": settings.lm_studio_model,
      "temperature": 0.7,
      "messages": [
        {
          "role": "system",
          "content": "You are a light-touch rewriter for short companion messages. Stay close to the provided draft. Make only small wording improvements. Sound human, simple, and warm. Do not sound managerial, fake-deep, mystical, analytical, therapeutic, or certain. Never expose system language, internal labels, test names, or database-like wording to the user."
        },
        {
          "role": "user",
          "content": prompt
        }
      ]
    }))
    .send();

  let response = match response {
    Ok(value) => value,
    Err(_) => return Ok(None),
  };

  let body: serde_json::Value = match response.json() {
    Ok(value) => value,
    Err(_) => return Ok(None),
  };

  let content = body
    .get("choices")
    .and_then(|value| value.as_array())
    .and_then(|choices| choices.first())
    .and_then(|choice| choice.get("message"))
    .and_then(|message| message.get("content"))
    .and_then(|content| content.as_str())
    .map(strip_think_blocks)
    .map(|content| content.trim().to_string())
    .map(|content| sanitize_lm_rewrite(&content))
    .filter(|content| !content.is_empty());

  Ok(content)
}

fn build_draft_metadata(
  settings: &AppSettings,
  structured_message: &str,
) -> Result<String, AppError> {
  let lm_enabled = !settings.lm_studio_endpoint.trim().is_empty()
    && !settings.lm_studio_model.trim().is_empty()
    && !settings.lm_studio_api_key.trim().is_empty();

  Ok(
    json!({
      "source": "decision_path",
      "composer": "grounded_structured",
      "lmStudioEnabled": lm_enabled,
      "structuredDraft": structured_message
    })
    .to_string(),
  )
}

fn strip_think_blocks(content: &str) -> String {
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

fn sanitize_lm_rewrite(content: &str) -> String {
  let banned_phrases = [
    "no pressure to reply",
    "no need to reply",
    "i'm thinking of you",
    "i am thinking of you",
    "wanted to check in",
    "i wanted to check in",
  ];

  let lowered = content.to_lowercase();
  if banned_phrases.iter().any(|phrase| lowered.contains(phrase)) {
    return String::new();
  }

  content.trim().to_string()
}

fn classify_call_request_reply(text: &str) -> Option<&'static str> {
  let normalized = text.trim().to_lowercase();
  if normalized.is_empty() {
    return None;
  }

  let accepted_markers = [
    "yes",
    "yeah",
    "yep",
    "sure",
    "okay",
    "ok",
    "please call",
    "call me",
    "you can call",
  ];
  if accepted_markers.iter().any(|marker| normalized.contains(marker)) {
    return Some("accepted");
  }

  let declined_markers = [
    "no",
    "not now",
    "later",
    "can't",
    "cant",
    "do not call",
    "don't call",
    "no thanks",
  ];
  if declined_markers.iter().any(|marker| normalized.contains(marker)) {
    return Some("declined");
  }

  None
}

fn call_outcome_response_state(outcome: &str) -> &'static str {
  match outcome {
    "completed" => "call_completed",
    "missed" => "missed",
    "declined" => "declined",
    "interrupted" => "call_interrupted",
    _ => "call_ended",
  }
}

fn is_in_protected_quiet_time(
  settings: &AppSettings,
  rules: &[ProtectedRule],
  evaluation_time: DateTime<Utc>,
) -> Result<bool, AppError> {
  let timezone: Tz = settings
    .timezone
    .parse()
    .map_err(|_| AppError::Message(format!("Unsupported timezone '{}'.", settings.timezone)))?;
  let local_time = evaluation_time.with_timezone(&timezone);
  let now_time = local_time.time();

  if time_in_window(
    now_time,
    parse_hhmm(&settings.sleep_window_start)?,
    parse_hhmm(&settings.sleep_window_end)?,
  ) {
    return Ok(true);
  }

  for rule in rules
    .iter()
    .filter(|rule| rule.is_active && rule.rule_kind == "protected_time" && rule.scope_kind == "global")
  {
    let payload: serde_json::Value = serde_json::from_str(&rule.value_json)?;
    let start = payload
      .get("start")
      .and_then(|value| value.as_str())
      .map(parse_hhmm)
      .transpose()?;
    let end = payload
      .get("end")
      .and_then(|value| value.as_str())
      .map(parse_hhmm)
      .transpose()?;

    if let (Some(start), Some(end)) = (start, end) {
      if time_in_window(now_time, start, end) {
        return Ok(true);
      }
    }
  }

  Ok(false)
}

fn parse_hhmm(value: &str) -> Result<NaiveTime, AppError> {
  NaiveTime::parse_from_str(value, "%H:%M")
    .map_err(|err| AppError::Message(format!("Invalid time '{}': {}", value, err)))
}

fn time_in_window(now: NaiveTime, start: NaiveTime, end: NaiveTime) -> bool {
  if start <= end {
    now >= start && now < end
  } else {
    now >= start || now < end
  }
}

fn list_repeated_places(connection: &Connection) -> Result<Vec<RepeatedPlaceSummary>, AppError> {
  let visits = list_visits(connection)?;
  let mut summaries = std::collections::BTreeMap::<String, RepeatedPlaceSummary>::new();

  for visit in visits.into_iter().filter(|visit| visit.duration_seconds > 0) {
    let context = serde_json::from_str::<serde_json::Value>(&visit.raw_context_json)
      .unwrap_or_else(|_| json!({}));
    let lat = context
      .get("anchor_latitude")
      .and_then(|value| value.as_f64())
      .unwrap_or(0.0);
    let lng = context
      .get("anchor_longitude")
      .and_then(|value| value.as_f64())
      .unwrap_or(0.0);
    let bucket_lat = (lat * 1000.0).round() / 1000.0;
    let bucket_lng = (lng * 1000.0).round() / 1000.0;
    let key = format!("{bucket_lat:.3}:{bucket_lng:.3}");

    let entry = summaries.entry(key.clone()).or_insert(RepeatedPlaceSummary {
      key: key.clone(),
      label: format!("Repeated area {bucket_lat:.3}, {bucket_lng:.3}"),
      visit_count: 0,
      total_duration_seconds: 0,
      average_duration_seconds: 0,
      latitude: bucket_lat,
      longitude: bucket_lng,
    });
    entry.visit_count += 1;
    entry.total_duration_seconds += visit.duration_seconds;
  }

  let mut items = summaries
    .into_values()
    .filter(|summary| summary.visit_count >= 2)
    .map(|mut summary| {
      summary.average_duration_seconds =
        summary.total_duration_seconds / summary.visit_count as i64;
      summary
    })
    .collect::<Vec<_>>();

  items.sort_by(|left, right| right.visit_count.cmp(&left.visit_count));
  Ok(items)
}

fn derive_saved_moments(connection: &Connection) -> Result<(), AppError> {
  let visits = list_visits(connection)?;
  let places = list_places(connection)?;
  let baseline = build_rhythm_baseline(&visits);
  let reflections = list_reflections(connection)?;
  let week_has_weight = reflections.iter().any(|reflection| {
    reflection.reflection_kind == "week_state"
      && (reflection.text.to_lowercase().contains("heavy")
        || reflection.text.to_lowercase().contains("uncertain")
        || reflection.text.to_lowercase().contains("beautiful"))
  });

  for (index, visit) in visits.iter().enumerate() {
    if visit.departure_mode != "moving" || visit.duration_seconds <= 0 {
      continue;
    }

    let start = parse_utc(&visit.started_at)?;
    let previous_visits = visits
      .iter()
      .skip(index + 1)
      .filter(|candidate| candidate.duration_seconds > 0)
      .collect::<Vec<_>>();
    let related_place = visit
      .place_id
      .and_then(|place_id| places.iter().find(|place| place.id == place_id));
    let place_visit_count = visit
      .place_id
      .map(|place_id| visits_for_place(&visits, place_id))
      .unwrap_or_default();
    let baseline_entry = baseline
      .iter()
      .find(|entry| {
        entry.day_of_week == start.weekday().num_days_from_monday()
          && entry.hour_bucket == start.hour()
      });
    let context_bucket = bucket_key_from_visit(visit);
    let prior_same_bucket = context_bucket
      .as_deref()
      .map(|bucket| {
        previous_visits
          .iter()
          .filter(|candidate| bucket_key_from_visit(candidate).as_deref() == Some(bucket))
          .count()
      })
      .unwrap_or_default();
    let routine_signal = baseline_entry.is_some() || prior_same_bucket >= 2 || place_visit_count >= 3;

    if visit.duration_seconds >= 45 * 60 {
      let typical_duration = baseline_entry
        .map(|entry| entry.average_duration_seconds)
        .unwrap_or(20 * 60);
      let ratio = visit.duration_seconds as f64 / typical_duration.max(1) as f64;
      if ratio >= 1.5 || baseline_entry.is_none() {
        let confidence = (0.45 + (visit.duration_seconds as f64 / 7200.0).min(0.3)).min(0.82);
        insert_saved_moment(
          connection,
          visit,
          "long_pause",
          json!({
            "durationSeconds": visit.duration_seconds,
            "baselineDurationSeconds": typical_duration,
            "placeId": visit.place_id,
            "weekHasWeight": week_has_weight,
            "placeVisitCount": place_visit_count,
            "routineSignal": routine_signal
          }),
          if week_has_weight {
            "A longer-than-usual pause stood out against the current week context."
          } else if routine_signal {
            "A longer pause stood out even against an already familiar rhythm."
          } else {
            "A longer-than-usual pause stood out against the recent visit baseline."
          },
          confidence,
        )?;
      }
    }

    if let Some(place) = related_place {
      if place.is_user_named || place.significance_score >= 0.7 || place.is_protected {
        let confidence =
          (0.58 + if place.is_protected { 0.12 } else { 0.0 } + (place.significance_score * 0.15))
            .min(0.9);
        let significance_text = if place.is_protected {
          "A departure from a protected place looked meaningful and should be handled gently."
        } else if place_visit_count >= 3 || place.significance_score >= 0.85 {
          "A departure from a place that now looks like part of your emotional map felt worth keeping."
        } else {
          "A departure from a place that seems to be gaining meaning looked worth keeping."
        };
        insert_saved_moment(
          connection,
          visit,
          "meaningful_departure",
          json!({
            "placeLabel": place.label,
            "placeKind": place.place_kind,
            "meaningKind": place.meaning_kind,
            "durationSeconds": visit.duration_seconds,
            "placeVisitCount": place_visit_count,
            "routineSignal": routine_signal,
            "evidenceSources": ["place_significance", "place_repetition"]
          }),
          significance_text,
          confidence,
        )?;
      }
    }

    if let Some(context) = context_bucket {
      if prior_same_bucket >= 2 {
        let prior_latest = previous_visits
          .iter()
          .find(|candidate| bucket_key_from_visit(candidate).as_deref() == Some(context.as_str()));
        let gap_hours = prior_latest
          .and_then(|candidate| {
            let previous_end = parse_utc(candidate.ended_at.as_ref()?).ok()?;
            let current_start = parse_utc(&visit.started_at).ok()?;
            Some((current_start - previous_end).num_hours())
          })
          .unwrap_or_default();
        if gap_hours >= 24 {
          insert_saved_moment(
            connection,
            visit,
            "unusual_return",
            json!({
              "bucket": context,
              "priorVisitCount": prior_same_bucket,
              "gapHours": gap_hours,
              "durationSeconds": visit.duration_seconds,
              "placeVisitCount": place_visit_count,
              "routineSignal": routine_signal
            }),
            if place_visit_count >= 3 {
              "A return to a well-known place after a real gap looked more deliberate than routine."
            } else {
              "A return to a repeated place after some time away stood out from the recent pattern."
            },
            if place_visit_count >= 3 { 0.67 } else { 0.61 },
          )?;
        }
      }
    }

    if baseline_entry.is_none() && visit.duration_seconds >= 30 * 60 && !routine_signal {
      insert_saved_moment(
        connection,
        visit,
        "rhythm_break",
        json!({
          "dayOfWeek": start.weekday().num_days_from_monday(),
          "hourBucket": start.hour(),
          "durationSeconds": visit.duration_seconds,
          "placeVisitCount": place_visit_count,
          "routineSignal": routine_signal
        }),
        "This visit landed outside the known rhythm baseline and looked like a break from routine.",
        0.57,
      )?;
    }
  }

  Ok(())
}

fn insert_saved_moment(
  connection: &Connection,
  visit: &PlaceVisit,
  moment_kind: &str,
  observed_context_json: serde_json::Value,
  inferred_significance: &str,
  confidence: f64,
) -> Result<(), AppError> {
  connection.execute(
    r#"
      INSERT OR IGNORE INTO saved_moments (
        created_at, visit_id, place_id, moment_kind, observed_context_json,
        inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'silent_save', 0, NULL)
    "#,
    params![
      Utc::now().to_rfc3339(),
      visit.id,
      visit.place_id,
      moment_kind,
      observed_context_json.to_string(),
      inferred_significance,
      confidence
    ],
  )?;
  Ok(())
}

fn build_rhythm_baseline(visits: &[PlaceVisit]) -> Vec<RhythmBaselineEntry> {
  let mut counts = std::collections::BTreeMap::<(u32, u32), (usize, i64)>::new();

  for visit in visits.iter().filter(|visit| visit.duration_seconds > 0) {
    if let Ok(start) = parse_utc(&visit.started_at) {
      let key = (start.weekday().num_days_from_monday(), start.hour());
      let entry = counts.entry(key).or_insert((0, 0));
      entry.0 += 1;
      entry.1 += visit.duration_seconds;
    }
  }

  counts
    .into_iter()
    .map(|((day_of_week, hour_bucket), (visit_count, total_duration))| RhythmBaselineEntry {
      day_of_week,
      hour_bucket,
      visit_count,
      average_duration_seconds: total_duration / visit_count.max(1) as i64,
    })
    .filter(|entry| entry.visit_count >= 2)
    .collect()
}

fn visits_for_place(visits: &[PlaceVisit], place_id: i64) -> usize {
  visits
    .iter()
    .filter(|candidate| candidate.place_id == Some(place_id) && candidate.duration_seconds > 0)
    .count()
}

fn bucket_key_from_visit(visit: &PlaceVisit) -> Option<String> {
  let context = serde_json::from_str::<serde_json::Value>(&visit.raw_context_json).ok()?;
  let lat = context.get("anchor_latitude")?.as_f64()?;
  let lng = context.get("anchor_longitude")?.as_f64()?;
  Some(format!(
    "{:.3}:{:.3}",
    (lat * 1000.0).round() / 1000.0,
    (lng * 1000.0).round() / 1000.0
  ))
}

fn infer_sleep_window(visits: &[PlaceVisit]) -> InferredSleepWindow {
  let overnight_visits = visits
    .iter()
    .filter_map(|visit| {
      if visit.duration_seconds < 3 * 60 * 60 {
        return None;
      }

      let start = parse_utc(&visit.started_at).ok()?;
      let end = parse_utc(visit.ended_at.as_ref().unwrap_or(&visit.started_at)).ok()?;

      if start.hour() >= 20 || start.hour() <= 3 || end.hour() <= 10 {
        Some((start, end))
      } else {
        None
      }
    })
    .collect::<Vec<_>>();

  if overnight_visits.is_empty() {
    return InferredSleepWindow {
      start: "23:00".into(),
      end: "07:00".into(),
      confidence: 0.2,
      supporting_visit_count: 0,
    };
  }

  let start_avg_minutes = overnight_visits
    .iter()
    .map(|(start, _)| normalize_sleep_start_minutes(start.hour() as i64 * 60 + start.minute() as i64))
    .sum::<i64>()
    / overnight_visits.len() as i64;
  let end_avg_minutes = overnight_visits
    .iter()
    .map(|(_, end)| end.hour() as i64 * 60 + end.minute() as i64)
    .sum::<i64>()
    / overnight_visits.len() as i64;

  InferredSleepWindow {
    start: format_hhmm(start_avg_minutes % (24 * 60)),
    end: format_hhmm(end_avg_minutes % (24 * 60)),
    confidence: (0.35 + (overnight_visits.len() as f64 * 0.15)).min(0.95),
    supporting_visit_count: overnight_visits.len(),
  }
}

fn normalize_sleep_start_minutes(minutes: i64) -> i64 {
  if minutes < 12 * 60 {
    minutes + 24 * 60
  } else {
    minutes
  }
}

fn format_hhmm(total_minutes: i64) -> String {
  let normalized = ((total_minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  let hours = normalized / 60;
  let minutes = normalized % 60;
  format!("{hours:02}:{minutes:02}")
}

fn parse_utc(value: &str) -> Result<DateTime<Utc>, AppError> {
  Ok(DateTime::parse_from_rfc3339(value)
    .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?
    .with_timezone(&Utc))
}

fn haversine_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
  let earth_radius_m = 6_371_000.0_f64;
  let dlat = (lat2 - lat1).to_radians();
  let dlon = (lon2 - lon1).to_radians();
  let lat1 = lat1.to_radians();
  let lat2 = lat2.to_radians();

  let a = (dlat / 2.0).sin().powi(2)
    + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
  let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
  earth_radius_m * c
}

#[cfg(test)]
mod tests {
  use std::path::PathBuf;

  use tempfile::tempdir;

  use super::*;

  fn test_db_path() -> PathBuf {
    let temp = tempdir().expect("temp dir");
    let path = temp.path().join("phase2.sqlite");
    std::mem::forget(temp);
    path
  }

  fn init_test_db(path: &PathBuf) {
    let connection = Connection::open(path).expect("open test db");
    apply_schema(&connection).expect("apply schema");
  }

  #[test]
  fn location_ingestion_creates_passive_context() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let events = vec![
      LocationEventInput {
        occurred_at: "2026-03-20T22:15:00Z".into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(20.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
      LocationEventInput {
        occurred_at: "2026-03-21T07:05:00Z".into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(20.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
      LocationEventInput {
        occurred_at: "2026-03-21T07:20:00Z".into(),
        latitude: 52.3699,
        longitude: 4.9101,
        accuracy_meters: Some(20.0),
        speed_mps: Some(4.2),
        source: "test".into(),
      },
      LocationEventInput {
        occurred_at: "2026-03-21T22:40:00Z".into(),
        latitude: 52.3677,
        longitude: 4.9040,
        accuracy_meters: Some(18.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
      LocationEventInput {
        occurred_at: "2026-03-22T06:55:00Z".into(),
        latitude: 52.3677,
        longitude: 4.9040,
        accuracy_meters: Some(18.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
      LocationEventInput {
        occurred_at: "2026-03-22T07:10:00Z".into(),
        latitude: 52.3720,
        longitude: 4.9150,
        accuracy_meters: Some(20.0),
        speed_mps: Some(3.5),
        source: "test".into(),
      },
    ];

    for event in &events {
      ingest_location_event(&db_path, event).expect("ingest event");
    }

    let snapshot = passive_context_snapshot(&db_path).expect("snapshot");

    assert_eq!(snapshot.raw_events.len(), events.len());
    assert!(!snapshot.visits.is_empty());
    assert!(!snapshot.repeated_places.is_empty());
    assert_eq!(snapshot.inferred_sleep_window.supporting_visit_count, 2);
    assert!(snapshot.inferred_sleep_window.confidence > 0.4);
  }

  #[test]
  fn lived_moment_snapshot_defaults_to_ordinary_when_context_is_thin() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    let snapshot = build_lived_moment_snapshot(
      &connection,
      "Europe/Amsterdam",
      parse_utc("2026-03-29T10:00:00Z").expect("parse time"),
    )
    .expect("lived moment snapshot");

    assert_eq!(snapshot.primary_assessment, "ordinary");
    assert_eq!(snapshot.recommended_signal, "stay_quiet");
    assert_eq!(snapshot.contact_rhythm_hint, "stay_quiet");
    assert_eq!(snapshot.recommended_contact_mode, "stay_silent");
    assert_eq!(snapshot.action_bias, "watchful_silence");
    assert!(snapshot.assessments.iter().any(|assessment| assessment.kind == "ordinary"));
    assert!(snapshot.actionable_signals.iter().any(|signal| signal.kind == "stay_quiet"));
    assert!(snapshot.safeguards.iter().any(|safeguard| safeguard.kind == "protect_quiet_window"));
    assert!(snapshot
      .situational_signals
      .iter()
      .any(|signal| signal.kind == "contact_air_gap" || signal.kind == "active_contact_cooldown"));
    assert!(snapshot.relational_bridges.is_empty());
    assert!(snapshot.contact_rhythm_options.iter().any(|option| option.level == "stay_silent"));
  }

  #[test]
  fn lived_moment_snapshot_surfaces_open_and_transition_heavy_when_evidence_accumulates() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let place = create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Canal Bench".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 140,
        place_kind: "reflection".into(),
        meaning_kind: "possibility".into(),
        is_user_named: true,
        is_protected: false,
        notes: "A place that feels open, alive, and full of possibility.".into(),
      },
    )
    .expect("create place");

    let entry = create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "hobbies".into(),
        title: "Night walks".into(),
        body: "Night walks by the canal make me feel open and like life might widen again.".into(),
        tags: vec!["walks".into(), "alive".into(), "outside".into()],
        notes: "Initial grounding memory.".into(),
      },
    )
    .expect("create context entry");

    run_context_memory_pass(&db_path).expect("first context pass");

    update_companion_context_entry(
      &db_path,
      &UpdateCompanionContextEntryInput {
        id: entry.id,
        title: entry.title.clone(),
        body: "Night walks by the canal still matter, but lately they feel unstable and different from before.".into(),
        tags: vec!["walks".into(), "change".into(), "alive".into()],
        notes: "Shifted wording to create lived drift.".into(),
        is_active: true,
      },
    )
    .expect("update context entry");

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "week_state".into(),
        text: "Tonight feels open, alive, and like something could happen if I notice it in time.".into(),
        linked_place_id: Some(place.id),
        weight: 0.82,
        expires_at: None,
        is_sensitive: false,
      },
    )
    .expect("create reflection");

    run_context_memory_pass(&db_path).expect("second context pass");

    ingest_location_event(
      &db_path,
      &LocationEventInput {
        occurred_at: "2026-03-29T20:05:00Z".into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(15.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
    )
    .expect("ingest still event");
    ingest_location_event(
      &db_path,
      &LocationEventInput {
        occurred_at: "2026-03-29T20:42:00Z".into(),
        latitude: 52.3676,
        longitude: 4.9041,
        accuracy_meters: Some(15.0),
        speed_mps: Some(0.0),
        source: "test".into(),
      },
    )
    .expect("ingest second still event");

    let connection = Connection::open(&db_path).expect("open db");
    let snapshot = build_lived_moment_snapshot(
      &connection,
      "Europe/Amsterdam",
      parse_utc("2026-03-29T20:45:00Z").expect("parse time"),
    )
    .expect("lived moment snapshot");

    assert_eq!(snapshot.matched_place.as_ref().map(|item| item.id), Some(place.id));
    assert!(snapshot.related_memories.iter().any(|memory| memory.relevance_score >= 0.5));
    assert!(snapshot.assessments.iter().any(|assessment| assessment.kind == "open"));
    assert!(snapshot.assessments.iter().any(|assessment| assessment.kind == "opportunity-rich"));
    assert!(snapshot.assessments.iter().any(|assessment| assessment.kind == "transition-heavy"));
    assert!(snapshot.actionable_signals.iter().any(|signal| signal.kind == "enrich_this_moment"));
    assert!(snapshot.actionable_signals.iter().any(|signal| signal.kind == "surface_this_opening"));
    assert!(snapshot
      .situational_signals
      .iter()
      .any(|signal| signal.kind == "meaningful_place_window"));
    assert!(snapshot.opportunities.iter().any(|opportunity| opportunity.kind == "enrichment_window"));
    assert!(snapshot.opportunities.iter().any(|opportunity| opportunity.kind == "place_based_opening"));
    assert!(!snapshot.contact_rhythm_options.is_empty());
    assert!(!snapshot.recent_contact_summary.is_empty());
    assert!(matches!(
      snapshot.contact_rhythm_hint.as_str(),
      "light_suggestion" | "orient_softly"
    ));
  }

  #[test]
  fn lived_moment_snapshot_can_surface_relational_bridges() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "friends".into(),
        title: "Mara".into(),
        body: "Mara is one of the people I trust when things get noisy.".into(),
        tags: vec!["support".into(), "close".into(), "important".into()],
        notes: "A steady friend and good call if life gets loud.".into(),
      },
    )
    .expect("create friend context");

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "week_state".into(),
        text: "I keep thinking about Mara tonight and it feels like reaching out could help.".into(),
        linked_place_id: None,
        weight: 0.84,
        expires_at: None,
        is_sensitive: false,
      },
    )
    .expect("create reflection");

    run_context_memory_pass(&db_path).expect("run context pass");

    let connection = Connection::open(&db_path).expect("open db");
    let snapshot = build_lived_moment_snapshot(
      &connection,
      "Europe/Amsterdam",
      parse_utc("2026-03-29T19:30:00Z").expect("parse time"),
    )
    .expect("lived moment snapshot");

    assert!(snapshot.relational_bridges.iter().any(|bridge| {
      bridge.title == "Mara"
        && matches!(bridge.bridge_kind.as_str(), "light_reconnect" | "supportive_reach")
    }));
    assert!(snapshot.contact_rhythm_options.iter().any(|option| option.level == "suggest_human_contact"));
    assert!(matches!(
      snapshot.recommended_contact_mode.as_str(),
      "suggest_human_contact" | "send_light_message" | "make_soft_suggestion"
    ));
  }

  #[test]
  fn phase_three_generates_saved_moments_and_baseline() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Parents' place".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 120,
        place_kind: "family".into(),
        meaning_kind: "belonging".into(),
        is_user_named: true,
        is_protected: false,
        notes: "Family weight lives here".into(),
      },
    )
    .expect("create place");

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "week_state".into(),
        text: "This week feels heavy.".into(),
        linked_place_id: None,
        weight: 0.8,
        expires_at: None,
        is_sensitive: false,
      },
    )
    .expect("create reflection");

    let events = vec![
      ("2026-03-02T18:00:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-02T18:35:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-02T18:40:00Z", 52.3720, 4.9150, 3.8),
      ("2026-03-09T18:05:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-09T18:40:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-09T18:45:00Z", 52.3720, 4.9150, 3.8),
      ("2026-03-16T18:10:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-16T19:50:00Z", 52.3676, 4.9041, 0.0),
      ("2026-03-16T19:55:00Z", 52.3720, 4.9150, 3.8),
    ];

    for (occurred_at, latitude, longitude, speed_mps) in events {
      ingest_location_event(
        &db_path,
        &LocationEventInput {
          occurred_at: occurred_at.into(),
          latitude,
          longitude,
          accuracy_meters: Some(15.0),
          speed_mps: Some(speed_mps),
          source: "test".into(),
        },
      )
      .expect("ingest");
    }

    let snapshot = phase_three_snapshot(&db_path).expect("phase three snapshot");

    assert!(!snapshot.saved_moments.is_empty());
    assert!(snapshot
      .saved_moments
      .iter()
      .any(|moment| moment.moment_kind == "meaningful_departure"));
    assert!(snapshot
      .saved_moments
      .iter()
      .any(|moment| moment.moment_kind == "long_pause"));
    assert!(!snapshot.rhythm_baseline.is_empty());
  }

  #[test]
  fn decision_path_promotes_and_suppresses_moments() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO saved_moments (
            created_at, visit_id, place_id, moment_kind, observed_context_json,
            inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
          ) VALUES
          (?1, 1, NULL, 'long_pause', '{}', 'High confidence pause', 0.82, 'silent_save', 0, NULL),
          (?2, 2, NULL, 'rhythm_break', '{}', 'Low confidence break', 0.42, 'silent_save', 0, NULL)
        "#,
        params![
          "2026-03-23T10:00:00Z",
          "2026-03-23T10:05:00Z",
        ],
      )
      .expect("seed moments");

    let result = run_message_decisions_at(
      &db_path,
      parse_utc("2026-03-23T14:00:00Z").expect("evaluation time"),
    )
    .expect("run decisions");

    assert_eq!(result.promoted_count, 1);
    assert_eq!(result.suppressed_count, 1);

    let snapshot = decision_snapshot(&db_path).expect("decision snapshot");
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_kind == "promote_to_outreach"));
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.reason_summary.contains("confidence")));
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_metadata_json.contains("\"livedMoment\"")));
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_metadata_json.contains("\"pillar\"")));
    assert!(snapshot
      .outreach_events
      .iter()
      .any(|event| event.response_state == "drafted"));
    assert!(snapshot
      .outreach_events
      .iter()
      .any(|event| event.message_text.contains("I'm here with you")));
  }

  #[test]
  fn call_request_path_promotes_high_confidence_moment() {
    let db_path = test_db_path();
    init_test_db(&db_path);
    let mut settings = load_settings(&db_path).expect("load settings");
    settings.call_requests_enabled = true;
    settings.call_confidence_threshold = 0.85;
    settings.call_cooldown_minutes = 720;
    save_settings(&db_path, &settings).expect("save settings");

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO saved_moments (
            created_at, visit_id, place_id, moment_kind, observed_context_json,
            inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
          ) VALUES
          (?1, 1, NULL, 'meaningful_departure', '{}', 'High confidence departure', 0.92, 'silent_save', 0, NULL)
        "#,
        params!["2026-03-23T10:00:00Z"],
      )
      .expect("seed moment");

    let result = run_call_request_decisions_at(
      &db_path,
      parse_utc("2026-03-23T14:00:00Z").expect("evaluation time"),
    )
    .expect("run call decisions");

    assert_eq!(result.promoted_count, 1);
    assert_eq!(result.suppressed_count, 0);

    let snapshot = decision_snapshot(&db_path).expect("decision snapshot");
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_kind == "promote_to_call_request"));
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_metadata_json.contains("\"escalationStage\"")));
    assert!(snapshot.outreach_events.iter().any(|event| {
      event.outreach_kind == "call_request"
        && event.message_text.to_lowercase().contains("call you for a moment")
    }));
  }

  #[test]
  fn dispatch_payload_for_call_request_uses_lived_reasoning() {
    let db_path = test_db_path();
    init_test_db(&db_path);
    let mut settings = load_settings(&db_path).expect("load settings");
    settings.call_requests_enabled = true;
    save_settings(&db_path, &settings).expect("save settings");

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO saved_moments (
            created_at, visit_id, place_id, moment_kind, observed_context_json,
            inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
          ) VALUES
          (?1, 1, NULL, 'meaningful_departure', '{}', 'Threshold moment', 0.92, 'silent_save', 0, NULL)
        "#,
        params!["2026-03-23T10:00:00Z"],
      )
      .expect("seed moment");

    run_call_request_decisions_at(
      &db_path,
      parse_utc("2026-03-23T14:00:00Z").expect("evaluation time"),
    )
    .expect("run call decisions");

    let draft = drafted_outreach_events(&db_path)
      .expect("drafts")
      .into_iter()
      .find(|event| event.outreach_kind == "call_request")
      .expect("call draft");
    let (_, payload, detail) =
      build_dispatch_payload_for_outreach(&db_path, draft.id).expect("build payload");

    assert!(!payload.trim().is_empty());
    assert_ne!(payload, draft.message_text);
    assert!(detail.contains("Sending a live North Star check-in"));
  }

  #[test]
  fn mark_outreach_event_dispatched_marks_sent_and_records_payload() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
          ) VALUES (?1, NULL, 'message', 'north_star', 'test reason', 'hello there', 0.78, 0, '{}', 'drafted')
        "#,
        params!["2026-03-23T10:00:00Z"],
      )
      .expect("seed outreach");
    let outreach_id = connection.last_insert_rowid();

    let updated = mark_outreach_event_dispatched(
      &db_path,
      outreach_id,
      "hello there",
      "Dispatching message shaped by lived_moment_enrichment / open / enrich_this_moment.",
    )
    .expect("mark dispatched");

    assert!(updated.was_delivered);
    assert_eq!(updated.response_state, "sent");
    assert!(updated.delivery_metadata_json.contains("\"dispatchedPayload\""));
    assert!(updated.delivery_metadata_json.contains("\"northStarDetail\""));
  }

  #[test]
  fn next_auto_dispatchable_outreach_event_picks_safe_message_draft() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            id, created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
          ) VALUES
          (101, ?1, 1, 'message', 'north_star', 'Safe message', 'hello', 0.7, 0, '{}', 'drafted')
        "#,
        params!["2026-03-23T10:00:00Z"],
      )
      .expect("seed outreach");
    connection
      .execute(
        r#"
          INSERT INTO moment_decisions (
            saved_moment_id, decided_at, decision_kind, reason_summary,
            decision_metadata_json, created_outreach_event_id
          ) VALUES
          (1, ?1, 'promote_to_outreach', 'Eligible', ?2, 101)
        "#,
        params![
          "2026-03-23T10:00:00Z",
          json!({
            "livedMoment": {
              "recommendedContactMode": "send_light_message"
            }
          })
          .to_string()
        ],
      )
      .expect("seed decision");

    let (candidate, held, reason) =
      next_auto_dispatchable_outreach_event(&db_path).expect("auto dispatch candidate");

    assert_eq!(candidate.expect("candidate").id, 101);
    assert!(held.is_none());
    assert_eq!(
      reason.expect("reason"),
      "Ready to auto-send as a light message."
    );
  }

  #[test]
  fn next_auto_dispatchable_outreach_event_holds_call_request() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            id, created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
          ) VALUES
          (202, ?1, 1, 'call_request', 'north_star', 'Manual call', 'call me', 0.9, 0, '{}', 'drafted')
        "#,
        params!["2026-03-23T10:00:00Z"],
      )
      .expect("seed outreach");
    connection
      .execute(
        r#"
          INSERT INTO moment_decisions (
            saved_moment_id, decided_at, decision_kind, reason_summary,
            decision_metadata_json, created_outreach_event_id
          ) VALUES
          (1, ?1, 'promote_to_call_request', 'Eligible', ?2, 202)
        "#,
        params![
          "2026-03-23T10:00:00Z",
          json!({
            "livedMoment": {
              "recommendedContactMode": "escalate_to_call"
            }
          })
          .to_string()
        ],
      )
      .expect("seed decision");

    let (candidate, held, reason) =
      next_auto_dispatchable_outreach_event(&db_path).expect("auto dispatch candidate");

    assert!(candidate.is_none());
    assert_eq!(held.expect("held outreach").id, 202);
    assert_eq!(
      reason.expect("reason"),
      "Call requests stay manual for now so live outreach remains deliberate."
    );
  }

  #[test]
  fn decision_pass_limits_outreach_to_one_message() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO saved_moments (
            created_at, visit_id, place_id, moment_kind, observed_context_json,
            inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
          ) VALUES
          (?1, 1, NULL, 'long_pause', '{}', 'First strong moment', 0.82, 'silent_save', 0, NULL),
          (?2, 2, NULL, 'meaningful_departure', '{}', 'Second strong moment', 0.8, 'silent_save', 0, NULL)
        "#,
        params![
          "2026-03-23T10:00:00Z",
          "2026-03-23T10:05:00Z",
        ],
      )
      .expect("seed moments");

    let result = run_message_decisions_at(
      &db_path,
      parse_utc("2026-03-23T14:00:00Z").expect("evaluation time"),
    )
    .expect("run decisions");

    assert_eq!(result.promoted_count, 1);
    assert_eq!(result.suppressed_count, 1);

    let snapshot = decision_snapshot(&db_path).expect("decision snapshot");
    let drafted_count = snapshot
      .outreach_events
      .iter()
      .filter(|event| event.response_state == "drafted")
      .count();
    assert_eq!(drafted_count, 1);
    assert!(snapshot
      .decisions
      .iter()
      .any(|decision| decision.decision_metadata_json.contains("\"batch_limit\"")));
  }

  #[test]
  fn strips_lm_studio_think_blocks() {
    let raw = "<think>hidden reasoning</think>Visible answer.";
    assert_eq!(strip_think_blocks(raw), "Visible answer.");
  }

  #[test]
  fn hides_internal_place_labels_from_messages() {
    assert_eq!(human_message_place_label("Reality Check Family Stop"), None);
    assert_eq!(human_message_place_label("Test Place"), None);
    assert_eq!(
      human_message_place_label("Riverside Cafe"),
      Some("Riverside Cafe".into())
    );
  }

  #[test]
  fn simulation_single_message_creates_only_one_draft() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let result = run_simulation_scenario(
      &db_path,
      &SimulationRunInput {
        scenario_key: "single_message_path".into(),
        clear_existing: true,
      },
    )
    .expect("run simulation");

    assert_eq!(result.promoted_count, 1);
    assert_eq!(result.draft_count, 1);
  }

  #[test]
  fn lived_moment_open_window_simulation_reads_as_opening() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let result = run_simulation_scenario(
      &db_path,
      &SimulationRunInput {
        scenario_key: "lived_moment_open_window".into(),
        clear_existing: true,
      },
    )
    .expect("run simulation");

    let preview = result.draft_preview.unwrap_or_default().to_lowercase();
    assert!(preview.contains("open") || preview.contains("opportunity-rich"));
  }

  #[test]
  fn context_memory_pass_creates_interpreted_memory_and_detectors() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "friends".into(),
        title: "Mara".into(),
        body: "A close friend I trust when things feel noisy.".into(),
        tags: vec!["support".into(), "important".into()],
        notes: "Protect this gently.".into(),
      },
    )
    .expect("create companion context entry");

    let snapshot = run_context_memory_pass(&db_path).expect("run context memory pass");

    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "manual_context_entry"
        && item.source_entry_title == "Mara"
        && item.memory_type == "relational_memory"
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.detector_type == "emergence" || record.detector_type == "protection"
    }));
    assert!(!snapshot.evolution_states.is_empty());
    assert_eq!(snapshot.tectonic_timeline.len(), 1);
  }

  #[test]
  fn archived_context_entry_becomes_historical_memory() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let entry = create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "goals".into(),
        title: "Move closer to the water".into(),
        body: "I want home to feel calmer and more open.".into(),
        tags: vec!["future".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    run_context_memory_pass(&db_path).expect("first memory pass");
    archive_companion_context_entry(&db_path, entry.id).expect("archive context entry");

    let snapshot = run_context_memory_pass(&db_path).expect("second memory pass");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_ref_id == Some(entry.id) && item.status == "historical" && item.archived_at.is_some()
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.detector_type == "drift" && record.direction == "receding"
    }));
  }

  #[test]
  fn context_memory_pass_adds_lived_call_detectors() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "friends".into(),
        title: "Mara".into(),
        body: "A close friend who helps me settle.".into(),
        tags: vec!["support".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let created_at = Utc::now().to_rfc3339();
    let started_at = (Utc::now() - Duration::minutes(14)).to_rfc3339();
    let ended_at = (Utc::now() - Duration::minutes(2)).to_rfc3339();
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          created_at,
          started_at,
          ended_at,
          "The call felt calm and safe.",
          "We had a grounded call about stress and feeling overwhelmed.",
          720_i64
        ],
      )
      .expect("seed call session");

    let snapshot = run_context_memory_pass(&db_path).expect("run context memory pass");
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "interaction_field"
        && record.detector_type == "reinforcement"
        && record.direction == "warming"
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "interaction_boundary"
        && record.detector_type == "protection"
        && record.target_key == "contact_safety"
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "conversation_theme"
        && record.detector_type == "tension"
        && record.target_key == "weight_in_contact"
    }));
    let summary: serde_json::Value = serde_json::from_str(&snapshot.tectonic_timeline[0].summary_json).expect("parse summary");
    assert!(summary
      .get("regionContinuity")
      .and_then(|value| value.as_array())
      .is_some_and(|regions| regions.iter().any(|region| {
        region.get("regionId").and_then(|value| value.as_str()) == Some("region:interaction_field")
      })));
  }

  #[test]
  fn context_memory_pass_adds_memory_specific_observation_reinforcement() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let entry = create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "music".into(),
        title: "Hippy music".into(),
        body: "It still helps me settle and feel like myself.".into(),
        tags: vec!["jam".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let created_at = Utc::now().to_rfc3339();
    let started_at = (Utc::now() - Duration::minutes(10)).to_rfc3339();
    let ended_at = (Utc::now() - Duration::minutes(2)).to_rfc3339();
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          created_at,
          started_at,
          ended_at,
          "We kept coming back to hippy music and jam sessions.",
          "Hippy music still feels important and grounding lately.",
          540_i64
        ],
      )
      .expect("seed call session");

    let snapshot = run_context_memory_pass(&db_path).expect("run context memory pass");
    let matching_memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_ref_id == Some(entry.id) && item.memory_type == "preference_memory")
      .expect("matching memory item");

    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_key == matching_memory.memory_key
        && record.detector_type == "reinforcement"
        && record.direction == "echoing"
    }));
  }

  #[test]
  fn context_memory_pass_marks_diverging_truth_when_live_contact_contradicts_manual_context() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let entry = create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "favorite_food".into(),
        title: "Spicy food".into(),
        body: "I love it and always come back to it.".into(),
        tags: vec!["favorite".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let created_at = Utc::now().to_rfc3339();
    let started_at = (Utc::now() - Duration::minutes(12)).to_rfc3339();
    let ended_at = (Utc::now() - Duration::minutes(1)).to_rfc3339();
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          created_at,
          started_at,
          ended_at,
          "We talked about spicy food and how it does not really fit anymore.",
          "I don't like spicy food anymore and usually avoid it now.",
          600_i64
        ],
      )
      .expect("seed contradicting call session");

    let snapshot = run_context_memory_pass(&db_path).expect("run context memory pass");
    let matching_memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_ref_id == Some(entry.id) && item.memory_type == "preference_memory")
      .expect("matching memory item");
    let evolution = snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == matching_memory.id)
      .expect("evolution state");

    assert_eq!(evolution.truth_alignment, "diverging");
    assert!(evolution.observed_challenge_score > evolution.observed_support_score);
    assert!(
      evolution.observed_truth_summary.to_lowercase().contains("pull")
        || evolution.alignment_summary.to_lowercase().contains("pull")
    );
  }

  #[test]
  fn context_memory_pass_marks_manual_reversal_as_unsettled_truth() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let entry = create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "career".into(),
        title: "Akai MPC".into(),
        body: "I love using it and keep coming back to it.".into(),
        tags: vec!["music".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    run_context_memory_pass(&db_path).expect("first pass");

    update_companion_context_entry(
      &db_path,
      &UpdateCompanionContextEntryInput {
        id: entry.id,
        title: "Akai MPC".into(),
        body: "I do not like the Akai MPC anymore and mostly avoid using it.".into(),
        tags: vec!["music".into()],
        notes: String::new(),
        is_active: true,
      },
    )
    .expect("update entry");

    let snapshot = run_context_memory_pass(&db_path).expect("second pass");
    let matching_memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_ref_id == Some(entry.id))
      .expect("matching memory item");
    let evolution = snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == matching_memory.id)
      .expect("evolution state");

    assert!(evolution.truth_alignment == "watching" || evolution.truth_alignment == "diverging");
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_key == matching_memory.memory_key
        && record.detector_type == "tension"
        && record.direction == "reversing"
    }));
  }

  #[test]
  fn seeded_title_with_brackets_still_matches_lived_observation_terms() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO companion_context_entries (
            category_key, title, body, tags_json, notes, display_order, is_active, deleted_at, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, 0, 1, NULL, ?6, ?6)
        "#,
        params![
          "career",
          "[Seed] Akai MPC",
          "I really like the Akai MPC and keep coming back to it.",
          serde_json::to_string(&vec!["seeded", "music"]).expect("tags"),
          "seeded",
          Utc::now().to_rfc3339(),
        ],
      )
      .expect("seed context entry");

    let now = Utc::now();
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          now.to_rfc3339(),
          (now - Duration::minutes(12)).to_rfc3339(),
          (now - Duration::minutes(2)).to_rfc3339(),
          "The Akai MPC does not fit anymore.",
          "I don't really like the Akai MPC anymore and mostly avoid using it now.",
          600_i64,
        ],
      )
      .expect("seed call session");

    let snapshot = run_context_memory_pass(&db_path).expect("run pass");
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "memory_item"
        && record.direction == "contradicting"
        && record.summary.to_lowercase().contains("akai mpc")
    }));
  }

  #[test]
  fn repeated_contradiction_pass_accumulates_divergence_history() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "career".into(),
        title: "[Seed] Akai MPC".into(),
        body: "I really like the Akai MPC and keep coming back to it.".into(),
        tags: vec!["seeded".into(), "music".into()],
        notes: "accumulation seed".into(),
      },
    )
    .expect("create seeded context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let now = Utc::now();
    for offset_minutes in [12_i64, 30_i64] {
      connection
        .execute(
          r#"
            INSERT INTO call_sessions (
              created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
              started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
            ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
          "#,
          params![
            now.to_rfc3339(),
            (now - Duration::minutes(offset_minutes)).to_rfc3339(),
            (now - Duration::minutes(offset_minutes - 8)).to_rfc3339(),
            "The Akai MPC does not fit anymore.",
            "I don't really like the Akai MPC anymore and mostly avoid using it now.",
            600_i64,
          ],
        )
        .expect("seed contradictory call session");
    }

    let first_snapshot = run_context_memory_pass(&db_path).expect("first contradiction pass");
    let first_memory = first_snapshot
      .memory_items
      .iter()
      .find(|item| item.source_entry_title == "[Seed] Akai MPC" && item.memory_type == "behavioral_memory")
      .expect("seeded behavioral memory");
    let first_evolution = first_snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == first_memory.id)
      .expect("first evolution");

    let later = Utc::now() + Duration::minutes(1);
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          later.to_rfc3339(),
          (later - Duration::minutes(9)).to_rfc3339(),
          (later - Duration::minutes(1)).to_rfc3339(),
          "The Akai MPC still feels wrong lately.",
          "I avoid the Akai MPC now and it does not feel like me anymore.",
          540_i64,
        ],
      )
      .expect("seed later contradictory call session");

    let second_snapshot = run_context_memory_pass(&db_path).expect("second contradiction pass");
    let second_memory = second_snapshot
      .memory_items
      .iter()
      .find(|item| item.source_entry_title == "[Seed] Akai MPC" && item.memory_type == "behavioral_memory")
      .expect("seeded behavioral memory second");
    let second_evolution = second_snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == second_memory.id)
      .expect("second evolution");

    assert!(second_evolution.cumulative_divergence_score >= first_evolution.cumulative_divergence_score);
    assert!(second_evolution.cumulative_challenge_score >= first_evolution.cumulative_challenge_score);
  }

  #[test]
  fn north_star_call_review_import_can_match_and_challenge_memory() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "career".into(),
        title: "[Seed] Akai MPC".into(),
        body: "I really like the Akai MPC and keep coming back to it.".into(),
        tags: vec!["seeded".into(), "music".into()],
        notes: "review challenge seed".into(),
      },
    )
    .expect("create seeded context entry");

    store_north_star_call_reviews(
      &db_path,
      &[NorthStarCallReview {
        review_id: "review-1".into(),
        call_id: "call-1".into(),
        user_handle: "seeded-user".into(),
        sentiment: "tense".into(),
        notes: "The Akai MPC does not feel like me anymore and I keep pulling away from it now.".into(),
        created_at: Utc::now().to_rfc3339(),
      }],
    )
    .expect("store north star call review");

    let snapshot = run_context_memory_pass(&db_path).expect("run pass");
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "memory_item"
        && record.detector_type == "tension"
        && record.direction == "reviewing"
        && record.evidence_json.contains("north_star_call_review_memory_match")
    }));

    let memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_entry_title == "[Seed] Akai MPC" && item.memory_type == "behavioral_memory")
      .expect("seeded behavioral memory");
    let evolution = snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == memory.id)
      .expect("evolution state");
    assert!(evolution.truth_alignment == "watching" || evolution.truth_alignment == "diverging");
  }

  #[test]
  fn cross_source_challenge_increases_source_coherence_for_memory() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "career".into(),
        title: "[Seed] Akai MPC".into(),
        body: "I really like the Akai MPC and keep coming back to it.".into(),
        tags: vec!["seeded".into(), "music".into()],
        notes: "cross-source challenge seed".into(),
      },
    )
    .expect("create seeded context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let now = Utc::now();
    connection
      .execute(
        r#"
          INSERT INTO call_sessions (
            created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
            started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
          ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
        "#,
        params![
          now.to_rfc3339(),
          (now - Duration::minutes(10)).to_rfc3339(),
          (now - Duration::minutes(2)).to_rfc3339(),
          "The Akai MPC feels wrong now.",
          "I do not really like the Akai MPC anymore and I mostly avoid it now.",
          480_i64,
        ],
      )
      .expect("insert contradictory call session");

    store_north_star_call_reviews(
      &db_path,
      &[NorthStarCallReview {
        review_id: "review-1".into(),
        call_id: "call-1".into(),
        user_handle: "seeded-user".into(),
        sentiment: "tense".into(),
        notes: "The Akai MPC does not feel like me anymore and I keep pulling away from it.".into(),
        created_at: now.to_rfc3339(),
      }],
    )
    .expect("store challenge review");

    let outreach_id = {
      connection
        .execute(
          r#"
            INSERT INTO outreach_events (
              created_at, saved_moment_id, outreach_kind, channel, reason_summary,
              message_text, confidence, was_delivered, delivery_metadata_json, response_state
            ) VALUES (?1, NULL, 'message', 'north_star', 'seed', 'seed', 0.76, 1, '{}', 'sent')
          "#,
          params![now.to_rfc3339()],
        )
        .expect("insert outreach");
      connection.last_insert_rowid()
    };

    submit_outreach_feedback(
      &db_path,
      &SubmitFeedbackInput {
        outreach_event_id: outreach_id,
        feedback_kind: "intrusive".into(),
        notes: "Bringing up the Akai MPC felt too much because I am pulling away from it now.".into(),
      },
    )
    .expect("submit feedback");

    let snapshot = run_context_memory_pass(&db_path).expect("run pass");
    let memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_entry_title == "[Seed] Akai MPC" && item.memory_type == "behavioral_memory")
      .expect("seeded memory");
    let evolution = snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == memory.id)
      .expect("evolution");

    assert!(evolution.challenge_source_count >= 2);
    assert!(evolution.source_coherence_score > 0.25);
    assert!(evolution.observed_evidence_summary.to_lowercase().contains("challenge seen across"));
  }

  #[test]
  fn repeated_cross_source_contradiction_becomes_temporal_phase_shift() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "career".into(),
        title: "[Seed] Akai MPC".into(),
        body: "I really like the Akai MPC and keep coming back to it.".into(),
        tags: vec!["seeded".into(), "music".into()],
        notes: "temporal phase shift seed".into(),
      },
    )
    .expect("create context entry");

    let connection = Connection::open(&db_path).expect("open db");
    let now = Utc::now();
    for offset in [30_i64, 18_i64, 6_i64] {
      connection
        .execute(
          r#"
            INSERT INTO call_sessions (
              created_at, outreach_event_id, saved_moment_id, handoff_kind, session_state,
              started_at, ended_at, outcome, notes, transcript_summary, duration_seconds
            ) VALUES (?1, NULL, NULL, 'manual', 'ended', ?2, ?3, 'completed', ?4, ?5, ?6)
          "#,
          params![
            now.to_rfc3339(),
            (now - Duration::minutes(offset)).to_rfc3339(),
            (now - Duration::minutes(offset - 5)).to_rfc3339(),
            "The Akai MPC feels wrong and distant now.",
            "I keep pulling away from the Akai MPC and it does not feel like me anymore.",
            420_i64,
          ],
        )
        .expect("insert call session");

      store_north_star_call_reviews(
        &db_path,
        &[NorthStarCallReview {
          review_id: format!("review-{offset}"),
          call_id: format!("call-{offset}"),
          user_handle: "seeded-user".into(),
          sentiment: "tense".into(),
          notes: "The Akai MPC feels off and I keep moving away from it now.".into(),
          created_at: (now - Duration::minutes(offset)).to_rfc3339(),
        }],
      )
      .expect("store call review");

      run_context_memory_pass(&db_path).expect("run pass");
    }

    let snapshot = run_context_memory_pass(&db_path).expect("run final pass");
    let memory = snapshot
      .memory_items
      .iter()
      .find(|item| item.source_entry_title == "[Seed] Akai MPC" && item.memory_type == "behavioral_memory")
      .expect("seeded memory");
    let evolution = snapshot
      .evolution_states
      .iter()
      .find(|state| state.memory_item_id == memory.id)
      .expect("evolution");

    assert!(evolution.sustained_divergence_score > 0.35);
    assert!(evolution.phase_shift_score > 0.42);
    assert!(evolution.phase_shift_state == "shifting" || evolution.phase_shift_state == "sustained_shift");
  }

  #[test]
  fn store_north_star_call_reviews_deduplicates_review_ids() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let review = NorthStarCallReview {
      review_id: "review-1".into(),
      call_id: "call-1".into(),
      user_handle: "seeded-user".into(),
      sentiment: "warm".into(),
      notes: "Still feels grounding.".into(),
      created_at: Utc::now().to_rfc3339(),
    };

    let first = store_north_star_call_reviews(&db_path, std::slice::from_ref(&review)).expect("first store");
    let second = store_north_star_call_reviews(&db_path, &[review]).expect("second store");

    assert_eq!(first, 1);
    assert_eq!(second, 0);

    let connection = Connection::open(&db_path).expect("open db");
    let stored_count: i64 = connection
      .query_row("SELECT COUNT(*) FROM north_star_call_reviews", [], |row| row.get(0))
      .expect("count stored reviews");
    assert_eq!(stored_count, 1);
  }

  #[test]
  fn context_memory_pass_adds_outreach_feedback_detectors() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let connection = Connection::open(&db_path).expect("open db");
    let created_at = Utc::now().to_rfc3339();
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
          ) VALUES
          (?1, NULL, 'message', 'north_star', 'helpful seed', 'seed', 0.82, 1, '{}', 'sent'),
          (?2, NULL, 'call_request', 'north_star', 'intrusive seed', 'seed', 0.88, 1, '{}', 'sent')
        "#,
        params![created_at, created_at],
      )
      .expect("seed outreach events");

    submit_outreach_feedback(
      &db_path,
      &SubmitFeedbackInput {
        outreach_event_id: 1,
        feedback_kind: "helpful".into(),
        notes: "That landed well.".into(),
      },
    )
    .expect("submit helpful feedback");

    submit_outreach_feedback(
      &db_path,
      &SubmitFeedbackInput {
        outreach_event_id: 2,
        feedback_kind: "intrusive".into(),
        notes: "That felt too much.".into(),
      },
    )
    .expect("submit intrusive feedback");

    let snapshot = run_context_memory_pass(&db_path).expect("run context memory pass");
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "outreach_path"
        && record.detector_type == "reinforcement"
        && record.direction == "welcoming"
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "outreach_path"
        && record.detector_type == "tension"
        && record.direction == "resisting"
    }));
    assert!(snapshot.detector_records.iter().any(|record| {
      record.target_kind == "interaction_boundary"
        && record.detector_type == "protection"
        && record.target_key == "outreach_timing_boundary"
    }));
  }

  #[test]
  fn reset_runtime_data_keeps_manual_context_but_clears_generated_memory_layers() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_companion_context_entry(
      &db_path,
      &CreateCompanionContextEntryInput {
        category_key: "friends".into(),
        title: "Mara".into(),
        body: "A close friend who matters.".into(),
        tags: vec!["important".into()],
        notes: String::new(),
      },
    )
    .expect("create companion context entry");

    run_context_memory_pass(&db_path).expect("run context memory pass");
    reset_runtime_data(&db_path).expect("reset runtime data");

    let companion_snapshot = companion_context_snapshot(&db_path).expect("companion context snapshot");
    let memory_snapshot = memory_system_snapshot(&db_path).expect("memory system snapshot");
    let passive_snapshot = passive_context_snapshot(&db_path).expect("passive context snapshot");

    assert_eq!(companion_snapshot.categories.iter().map(|section| section.entries.len()).sum::<usize>(), 1);
    assert!(memory_snapshot.memory_items.is_empty());
    assert!(memory_snapshot.detector_records.is_empty());
    assert!(memory_snapshot.evolution_states.is_empty());
    assert!(memory_snapshot.tectonic_timeline.is_empty());
    assert!(passive_snapshot.raw_events.is_empty());
    assert!(passive_snapshot.visits.is_empty());
  }

  #[test]
  fn memory_growth_creates_items_from_places_without_manual_reflection() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Riverside bench".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 120,
        place_kind: "nature".into(),
        meaning_kind: "reflection".into(),
        is_user_named: true,
        is_protected: false,
        notes: "Keeps coming up".into(),
      },
    )
    .expect("create place");

    let snapshot = run_memory_growth_pass(&db_path).expect("run memory growth");
    assert!(snapshot.active_count >= 1);
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "place" && item.content.to_lowercase().contains("riverside bench")
    }));
  }

  #[test]
  fn memory_item_can_be_confirmed() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "meaning".into(),
        text: "A vulnerable truth.".into(),
        linked_place_id: None,
        weight: 0.8,
        expires_at: None,
        is_sensitive: true,
      },
    )
    .expect("create sensitive reflection");

    let snapshot = run_memory_growth_pass(&db_path).expect("run memory growth");
    let awaiting = snapshot
      .memory_items
      .iter()
      .find(|item| item.requires_confirmation)
      .expect("awaiting confirmation item");

    let updated = update_memory_item(
      &db_path,
      &UpdateMemoryItemInput {
        id: awaiting.id,
        action: "confirm".into(),
      },
    )
    .expect("confirm memory item");

    let confirmed = updated
      .memory_items
      .iter()
      .find(|item| item.id == awaiting.id)
      .expect("confirmed item");
    assert_eq!(confirmed.status, "active");
    assert!(!confirmed.requires_confirmation);
    assert!(confirmed.reinforced_at.is_some());
  }

  #[test]
  fn memory_item_can_be_dismissed() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "meaning".into(),
        text: "A private guess.".into(),
        linked_place_id: None,
        weight: 0.8,
        expires_at: None,
        is_sensitive: true,
      },
    )
    .expect("create sensitive reflection");

    let snapshot = run_memory_growth_pass(&db_path).expect("run memory growth");
    let awaiting = snapshot
      .memory_items
      .iter()
      .find(|item| item.requires_confirmation)
      .expect("awaiting confirmation item");

    let updated = update_memory_item(
      &db_path,
      &UpdateMemoryItemInput {
        id: awaiting.id,
        action: "dismiss".into(),
      },
    )
    .expect("dismiss memory item");

    let dismissed = updated
      .memory_items
      .iter()
      .find(|item| item.id == awaiting.id)
      .expect("dismissed item");
    assert_eq!(dismissed.status, "archived");
    assert!(!dismissed.requires_confirmation);
  }

  #[test]
  fn repeated_place_memory_promotes_to_stable() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let place = create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Riverside bench".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 120,
        place_kind: "nature".into(),
        meaning_kind: "reflection".into(),
        is_user_named: true,
        is_protected: false,
        notes: "Keeps coming up".into(),
      },
    )
    .expect("create place");

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO place_visits (
            place_id, started_at, ended_at, duration_seconds, arrival_mode, departure_mode,
            was_stationary, confidence, raw_context_json
          ) VALUES
          (?1, ?2, ?3, 3600, 'walking', 'walking', 1, 0.9, '{}'),
          (?1, ?4, ?5, 3600, 'walking', 'walking', 1, 0.9, '{}'),
          (?1, ?6, ?7, 3600, 'walking', 'walking', 1, 0.9, '{}')
        "#,
        params![
          place.id,
          "2026-03-20T09:00:00Z",
          "2026-03-20T10:00:00Z",
          "2026-03-21T09:00:00Z",
          "2026-03-21T10:00:00Z",
          "2026-03-22T09:00:00Z",
          "2026-03-22T10:00:00Z",
        ],
      )
      .expect("seed visits");

    let snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "place"
        && item.memory_type == "stable"
        && item.content.to_lowercase().contains("stable meaningful place")
    }));
  }

  #[test]
  fn expired_week_state_memory_fades() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "week_state".into(),
        text: "This week felt heavy.".into(),
        linked_place_id: None,
        weight: 0.7,
        expires_at: Some("2026-03-01T00:00:00Z".into()),
        is_sensitive: false,
      },
    )
    .expect("create reflection");

    let snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "manual_reflection"
        && item.memory_type == "short_lived"
        && item.status != "active"
    }));
  }

  #[test]
  fn accepted_call_request_creates_positive_call_memory() {
    let db_path = test_db_path();
    init_test_db(&db_path);
    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'drafted')
        "#,
        params![
          "2026-03-23T10:00:00Z",
          json!({ "chat_id": "8713170057" }).to_string()
        ],
      )
      .expect("seed call outreach");

    save_inbound_message(
      &db_path,
      2001,
      Some(601),
      "8713170057",
      Some("user"),
      "Yes, please call me.",
      "2026-03-23T10:02:00Z",
    )
    .expect("save reply");

    let snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "call_outcome_pattern"
        && item.content.to_lowercase().contains("welcome")
    }));
  }

  #[test]
  fn declined_call_request_creates_lighter_touch_memory() {
    let db_path = test_db_path();
    init_test_db(&db_path);
    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, NULL, 'call_request', 'north_star', 'call seed', 'Would it help if I call you for a moment?', 0.91, 1, ?2, 'drafted')
        "#,
        params![
          "2026-03-23T10:00:00Z",
          json!({ "chat_id": "8713170057" }).to_string()
        ],
      )
      .expect("seed call outreach");

    save_inbound_message(
      &db_path,
      2002,
      Some(602),
      "8713170057",
      Some("user"),
      "Not now, maybe later.",
      "2026-03-23T10:02:00Z",
    )
    .expect("save reply");

    let snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "call_outcome_pattern"
        && item.content.to_lowercase().contains("lighter touch")
    }));
  }

  #[test]
  fn sensitive_memory_stays_awaiting_confirmation() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "meaning".into(),
        text: "A very personal interpretation.".into(),
        linked_place_id: None,
        weight: 0.76,
        expires_at: None,
        is_sensitive: true,
      },
    )
    .expect("create reflection");

    let snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    assert!(snapshot.memory_items.iter().any(|item| {
      item.source_kind == "manual_reflection"
        && item.status == "awaiting_confirmation"
        && item.requires_confirmation
    }));
  }

  #[test]
  fn dismissed_sensitive_memory_stays_archived_after_future_growth() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_reflection(
      &db_path,
      &CreateReflectionInput {
        reflection_kind: "meaning".into(),
        text: "Do not keep this by default.".into(),
        linked_place_id: None,
        weight: 0.8,
        expires_at: None,
        is_sensitive: true,
      },
    )
    .expect("create reflection");

    let first_snapshot = run_memory_growth_pass(&db_path).expect("run growth");
    let waiting_item = first_snapshot
      .memory_items
      .iter()
      .find(|item| item.requires_confirmation)
      .expect("awaiting item");

    update_memory_item(
      &db_path,
      &UpdateMemoryItemInput {
        id: waiting_item.id,
        action: "dismiss".into(),
      },
    )
    .expect("dismiss item");

    let second_snapshot = run_memory_growth_pass(&db_path).expect("run growth again");
    let archived_item = second_snapshot
      .memory_items
      .iter()
      .find(|item| item.id == waiting_item.id)
      .expect("same item exists");
    assert_eq!(archived_item.status, "archived");
  }

  #[test]
  fn second_growth_pass_with_no_new_evidence_makes_no_substantive_changes() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Still water spot".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 120,
        place_kind: "reflection".into(),
        meaning_kind: "reflection".into(),
        is_user_named: true,
        is_protected: false,
        notes: "Already meaningful.".into(),
      },
    )
    .expect("create place");

    let first = run_memory_growth_pass(&db_path).expect("first growth");
    let second = run_memory_growth_pass(&db_path).expect("second growth");

    assert_eq!(first.memory_items.len(), second.memory_items.len());
    for item in &second.memory_items {
      let previous = first
        .memory_items
        .iter()
        .find(|candidate| candidate.id == item.id)
        .expect("matching item");
      assert_eq!(previous.memory_type, item.memory_type);
      assert_eq!(previous.status, item.status);
      assert_eq!(previous.reinforced_at, item.reinforced_at);
    }
  }

  #[test]
  fn repeated_routine_place_does_not_create_rhythm_break() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let place = create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Morning cafe".into(),
        latitude: Some(52.3676),
        longitude: Some(4.9041),
        radius_meters: 100,
        place_kind: "routine".into(),
        meaning_kind: "return".into(),
        is_user_named: true,
        is_protected: false,
        notes: "Often part of the morning rhythm.".into(),
      },
    )
    .expect("create place");

    let connection = Connection::open(&db_path).expect("open db");
    connection
      .execute(
        r#"
          INSERT INTO place_visits (
            place_id, started_at, ended_at, duration_seconds, arrival_mode, departure_mode,
            was_stationary, confidence, raw_context_json
          ) VALUES
          (?1, ?2, ?3, 2400, 'walking', 'moving', 1, 0.9, ?4),
          (?1, ?5, ?6, 2400, 'walking', 'moving', 1, 0.9, ?7),
          (?1, ?8, ?9, 2400, 'walking', 'moving', 1, 0.9, ?10)
        "#,
        params![
          place.id,
          "2026-03-10T09:00:00Z",
          "2026-03-10T09:40:00Z",
          json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
          "2026-03-17T09:05:00Z",
          "2026-03-17T09:45:00Z",
          json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
          "2026-03-24T09:10:00Z",
          "2026-03-24T09:50:00Z",
          json!({"anchor_latitude": 52.3676, "anchor_longitude": 4.9041}).to_string(),
        ],
      )
      .expect("seed visits");

    derive_saved_moments(&connection).expect("derive moments");
    let moments = list_saved_moments(&connection).expect("list moments");
    assert!(!moments.iter().any(|moment| moment.moment_kind == "rhythm_break"));
  }

  #[test]
  fn automated_simulation_suite_passes_core_checks() {
    let result = run_automated_simulation_suite().expect("run suite");
    assert_eq!(
      result.passed_count,
      result.total_count,
      "failed checks: {:?}",
      result
        .checks
        .iter()
        .filter(|check| !check.passed)
        .collect::<Vec<_>>()
    );
    assert!(result.total_count >= 7);
  }

  #[test]
  fn negative_feedback_reduces_future_moment_confidence() {
    let db_path = test_db_path();
    init_test_db(&db_path);
    let connection = Connection::open(&db_path).expect("open db");

    connection
      .execute(
        r#"
          INSERT INTO saved_moments (
            created_at, visit_id, place_id, moment_kind, observed_context_json,
            inferred_significance, confidence, action_taken, was_promoted_to_outreach, resolved_at
          ) VALUES
          (?1, 1, NULL, 'long_pause', '{}', 'Past long pause', 0.82, 'outreach_candidate', 1, ?2),
          (?3, 2, NULL, 'long_pause', '{}', 'Future long pause', 0.62, 'silent_save', 0, NULL)
        "#,
        params![
          "2026-03-20T10:00:00Z",
          "2026-03-20T10:05:00Z",
          "2026-03-23T10:00:00Z",
        ],
      )
      .expect("seed moments");

    connection
      .execute(
        r#"
          INSERT INTO outreach_events (
            created_at, saved_moment_id, outreach_kind, channel, reason_summary,
            message_text, confidence, was_delivered, delivery_metadata_json, response_state
) VALUES (?1, 1, 'message', 'north_star', 'seed', 'seed', 0.82, 1, '{}', 'sent')
        "#,
        params!["2026-03-20T10:06:00Z"],
      )
      .expect("seed outreach");

    submit_outreach_feedback(
      &db_path,
      &SubmitFeedbackInput {
        outreach_event_id: 1,
        feedback_kind: "intrusive".into(),
        notes: String::new(),
      },
    )
    .expect("submit feedback");

    let result = run_message_decisions_at(
      &db_path,
      parse_utc("2026-03-23T14:00:00Z").expect("evaluation time"),
    )
    .expect("run decisions");

    assert_eq!(result.promoted_count, 0);
    assert_eq!(result.suppressed_count, 1);
    assert!(result.decisions[0].reason_summary.contains("confidence"));
  }

  #[test]
  fn review_updates_persist_for_places_and_rules() {
    let db_path = test_db_path();
    init_test_db(&db_path);

    let place = create_place(
      &db_path,
      &CreatePlaceInput {
        label: "Bench".into(),
        latitude: Some(52.36),
        longitude: Some(4.90),
        radius_meters: 60,
        place_kind: "nature".into(),
        meaning_kind: "uncertain".into(),
        is_user_named: true,
        is_protected: false,
        notes: String::new(),
      },
    )
    .expect("create place");

    let rule = create_rule(
      &db_path,
      &CreateRuleInput {
        rule_kind: "protected_time".into(),
        scope_kind: "global".into(),
        scope_ref_id: None,
        value_json: "{\"start\":\"22:00\",\"end\":\"07:00\"}".into(),
        is_active: true,
      },
    )
    .expect("create rule");

    let updated_place = update_place(
      &db_path,
      &UpdatePlaceInput {
        id: place.id,
        meaning_kind: "reflection".into(),
        significance_score: 0.9,
        is_protected: true,
        notes: "Actually meaningful.".into(),
      },
    )
    .expect("update place");

    let updated_rule = update_rule(
      &db_path,
      &UpdateRuleInput {
        id: rule.id,
        is_active: false,
        value_json: "{\"start\":\"23:00\",\"end\":\"08:00\"}".into(),
      },
    )
    .expect("update rule");

    assert_eq!(updated_place.meaning_kind, "reflection");
    assert!(updated_place.is_protected);
    assert_eq!(updated_rule.is_active, false);
    assert!(updated_rule.value_json.contains("23:00"));
  }
}
