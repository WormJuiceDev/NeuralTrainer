use std::{fs, path::{Path, PathBuf}, process::Command};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
  error::AppError,
  models::{AppSettings, TelegramCallActionResult, TelegramCallTransportSnapshot},
  telegram_user,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const TELEGRAM_CALL_SCRIPT: &str = include_str!("../scripts/telegram_call.py");

pub fn snapshot(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramCallTransportSnapshot, AppError> {
  let paths = resolve_paths(app_data_dir);
  let configured = is_configured(settings);
  let user_snapshot = telegram_user::snapshot(app_data_dir, settings)?;
  let runtime_ready = python_runtime_check().is_ok();
  let pending = load_pending_state(&paths.pending_call_path);

  let runtime_detail = if !configured {
    "Telegram user account settings are not complete yet. Add API ID, API hash, and phone number first.".to_string()
  } else if !user_snapshot.authorized {
    "The Telegram user account is not connected yet. Finish the MTProto login first.".to_string()
  } else if runtime_ready {
    "Telegram private-call transport runtime is ready for the next MTProto call layer.".to_string()
  } else {
    "Telegram private-call transport runtime is missing pytgvoip or Python was not found yet.".to_string()
  };

  Ok(TelegramCallTransportSnapshot {
    configured,
    user_authorized: user_snapshot.authorized,
    runtime_ready,
    runtime_detail,
    provider: "telegram_mtproto".into(),
    package_name: "pytgvoip".into(),
    private_calls_supported: configured && user_snapshot.authorized && runtime_ready,
    target: settings.telegram_user_call_target.clone(),
    pending_call: pending.is_some(),
    pending_call_target: pending
      .as_ref()
      .and_then(|value| value.get("target"))
      .and_then(|value| value.as_str())
      .map(ToOwned::to_owned),
    pending_call_state: pending
      .as_ref()
      .and_then(|value| value.get("state"))
      .and_then(|value| value.as_str())
      .map(ToOwned::to_owned),
  })
}

pub fn prepare_runtime(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramCallTransportSnapshot, AppError> {
  let python = python_command()
    .ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;

  let output = hidden_command(&python)
    .args(["-m", "pip", "install", "-U", "telethon", "pytgvoip"])
    .output()?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    return Err(AppError::Message(if stderr.is_empty() {
      format!("Installing the Telegram call runtime failed. {stdout}")
    } else {
      format!("Installing the Telegram call runtime failed. {stderr}")
    }));
  }

  snapshot(app_data_dir, settings)
}

pub fn start_test_call(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramCallActionResult, AppError> {
  if settings.telegram_user_call_target.trim().is_empty() {
    return Err(AppError::Message(
      "Add a Telegram call target first. Use a username, phone number, or known Telegram peer identifier.".into(),
    ));
  }

  let paths = resolve_paths(app_data_dir);
  let python = python_command()
    .ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let script = ensure_script(app_data_dir)?;

  let output = hidden_command(&python)
    .arg(&script)
    .arg("start_outgoing")
    .arg("--api-id")
    .arg(settings.telegram_user_api_id.trim())
    .arg("--api-hash")
    .arg(settings.telegram_user_api_hash.trim())
    .arg("--phone")
    .arg(settings.telegram_user_phone.trim())
    .arg("--session")
    .arg(&paths.session_path)
    .arg("--pending-call")
    .arg(&paths.pending_call_path)
    .arg("--target")
    .arg(settings.telegram_user_call_target.trim())
    .output()?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Err(AppError::Message(if stderr.is_empty() {
      "Starting the Telegram test call failed.".into()
    } else {
      stderr
    }));
  }

  let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)?;
  Ok(TelegramCallActionResult {
    snapshot: snapshot(app_data_dir, settings)?,
    detail: parsed
      .get("detail")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram test call request sent.")
      .to_string(),
  })
}

pub fn clear_local_state(app_data_dir: &Path) -> Result<(), AppError> {
  let paths = resolve_paths(app_data_dir);
  if let Some(parent) = paths.pending_call_path.parent() {
    if parent.exists() {
      fs::remove_dir_all(parent)?;
    }
  }
  Ok(())
}

fn is_configured(settings: &AppSettings) -> bool {
  !settings.telegram_user_api_id.trim().is_empty()
    && !settings.telegram_user_api_hash.trim().is_empty()
    && !settings.telegram_user_phone.trim().is_empty()
}

#[derive(Debug, Clone)]
struct TelegramCallPaths {
  session_path: PathBuf,
  pending_call_path: PathBuf,
}

fn resolve_paths(app_data_dir: &Path) -> TelegramCallPaths {
  let root = app_data_dir.join("telegram_call");
  let shared_user_root = app_data_dir.join("telegram_user");
  TelegramCallPaths {
    session_path: shared_user_root.join("mtproto_user"),
    pending_call_path: root.join("pending_call.json"),
  }
}

fn python_script_path(app_data_dir: &Path) -> PathBuf {
  app_data_dir.join("telegram_call").join("telegram_call.py")
}

fn ensure_script(app_data_dir: &Path) -> Result<PathBuf, AppError> {
  let path = python_script_path(app_data_dir);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&path, TELEGRAM_CALL_SCRIPT)?;
  Ok(path)
}

fn load_pending_state(path: &Path) -> Option<serde_json::Value> {
  let raw = fs::read_to_string(path).ok()?;
  serde_json::from_str(&raw).ok()
}

fn python_command() -> Option<String> {
  let candidates: [(&str, &[&str]); 2] = [("python", &[]), ("py", &["-3"])];

  for (binary, extra_args) in candidates {
    let mut command = hidden_command(binary);
    command.args(extra_args).args(["-c", "import sys; print(sys.executable)"]);
    if let Ok(output) = command.output() {
      if output.status.success() {
        return Some(binary.to_string());
      }
    }
  }

  None
}

fn python_runtime_check() -> Result<(), AppError> {
  let python = python_command()
    .ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;

  let output = hidden_command(&python)
    .args(["-c", "import telethon, tgvoip; print('ok')"])
    .output()?;

  if output.status.success() {
    return Ok(());
  }

  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  Err(AppError::Message(if stderr.is_empty() {
    "Telegram call runtime check failed.".into()
  } else {
    stderr
  }))
}

fn hidden_command(program: &str) -> Command {
  let mut command = Command::new(program);
  #[cfg(windows)]
  command.creation_flags(CREATE_NO_WINDOW);
  command
}
