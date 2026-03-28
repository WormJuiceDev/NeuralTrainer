mod commands;
mod db;
mod error;
mod models;
mod north_star;
mod state;
mod voice;

use std::sync::{Arc, Mutex};

use chrono::Utc;
use state::AppState;
use tauri::Manager;

pub fn run() {
  let (app_data_dir, db_path, initialized_at) =
    db::init_storage().expect("failed to initialize storage");

  let initial_events = vec![
    format!("Storage initialized at {}.", initialized_at),
    format!("SQLite ready at {}.", db_path.display()),
    format!("App booted at {}.", Utc::now().to_rfc3339()),
  ];

  tauri::Builder::default()
    .manage(AppState {
      db_path: Arc::new(db_path),
      app_data_dir: Arc::new(app_data_dir),
      recent_events: Arc::new(Mutex::new(initial_events)),
      last_initialized_at: Arc::new(initialized_at),
      voice_worker: Arc::new(Mutex::new(None)),
      speech_stream_worker: Arc::new(Mutex::new(None)),
      kokoro_fastapi_runtime: Arc::new(Mutex::new(None)),
      active_call_session_id: Arc::new(Mutex::new(None)),
    })
    .invoke_handler(tauri::generate_handler![
      commands::load_settings,
      commands::save_settings,
      commands::get_diagnostics,
      commands::get_companion_context_snapshot,
      commands::get_companion_home_snapshot,
      commands::create_companion_context_category,
      commands::update_companion_context_category_icon,
      commands::create_companion_context_entry,
      commands::update_companion_context_entry,
      commands::archive_companion_context_entry,
      commands::reorder_companion_context_entries,
      commands::delete_companion_context_category,
      commands::get_north_star_snapshot,
      commands::get_north_star_runtime_snapshot,
      commands::create_north_star_session,
      commands::bind_north_star_desktop,
      commands::send_north_star_heartbeat,
      commands::send_north_star_message,
      commands::send_north_star_call_request,
      commands::pull_north_star_location_events,
      commands::import_north_star_call_reviews,
      commands::process_next_north_star_call_turn,
      commands::process_north_star_live_turn,
      commands::start_north_star_live_turn_stream,
      commands::complete_north_star_live_speech_stream,
      commands::send_north_star_webrtc_signal,
      commands::pull_north_star_webrtc_signals,
      commands::get_north_star_rtc_config,
      commands::get_voice_snapshot,
      commands::get_call_session_snapshot,
      commands::get_call_turns_for_session,
      commands::download_kokoro_assets,
      commands::prepare_kokoro_runtime,
      commands::setup_local_speech,
      commands::synthesize_voice_preview,
      commands::synthesize_north_star_phrase,
      commands::synthesize_north_star_opening,
      commands::get_speech_stream_snapshot,
      commands::start_speech_stream,
      commands::push_speech_stream_audio,
      commands::stop_speech_stream_and_reply,
      commands::run_call_turn,
      commands::clear_voice_assets,
      commands::clear_all_local_data,
      commands::create_place,
      commands::create_rule,
      commands::update_place,
      commands::update_rule,
      commands::create_reflection,
      commands::get_memory_growth_snapshot,
      commands::run_memory_growth_pass,
      commands::update_memory_item,
      commands::get_phase_one_snapshot,
      commands::ingest_location_event,
      commands::get_passive_context_snapshot,
      commands::get_phase_three_snapshot,
      commands::start_call_session,
      commands::start_north_star_accepted_call,
      commands::end_call_session,
      commands::run_message_decisions,
      commands::run_call_request_decisions,
      commands::get_decision_snapshot,
      commands::get_mvp_reality_check_snapshot,
      commands::seed_mvp_reality_check_scenario,
      commands::reset_runtime_data,
      commands::list_simulation_scenarios,
      commands::run_simulation_scenario,
      commands::run_automated_simulation_suite
    ])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        window.set_title("Neural Trainer")?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
