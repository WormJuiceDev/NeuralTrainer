use std::{
  fs,
  path::{Path, PathBuf},
  process::Command,
};

use serde_json::Value;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::{
  error::AppError,
  models::{AppSettings, CompleteTelegramUserLoginInput, TelegramUserActionResult, TelegramUserSnapshot},
};

const TELEGRAM_USER_SCRIPT: &str = include_str!("../scripts/telegram_user.py");
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn snapshot(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramUserSnapshot, AppError> {
  let paths = resolve_paths(app_data_dir);
  let configured = is_configured(settings);
  let runtime_ready = python_runtime_check().is_ok();
  let session_path = paths.session_path.display().to_string();
  let pending_code = paths.pending_code_path.exists();

  if !configured {
    return Ok(TelegramUserSnapshot {
      configured: false,
      runtime_ready,
      runtime_detail: if runtime_ready {
        "Telegram user runtime is ready. Add your API credentials and phone number to continue.".into()
      } else {
        "Telegram user runtime is missing Telethon or Python was not found yet.".into()
      },
      session_path,
      authorized: false,
      me_display: None,
      phone: settings.telegram_user_phone.clone(),
      pending_code,
    });
  }

  if !runtime_ready {
    return Ok(TelegramUserSnapshot {
      configured: true,
      runtime_ready: false,
      runtime_detail: "Telegram user runtime is missing Telethon or Python was not found yet.".into(),
      session_path,
      authorized: false,
      me_display: None,
      phone: settings.telegram_user_phone.clone(),
      pending_code,
    });
  }

  let script = ensure_script(app_data_dir)?;
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let output = hidden_command(&python)
    .arg(&script)
    .arg("snapshot")
    .arg("--api-id")
    .arg(settings.telegram_user_api_id.trim())
    .arg("--api-hash")
    .arg(settings.telegram_user_api_hash.trim())
    .arg("--phone")
    .arg(settings.telegram_user_phone.trim())
    .arg("--session")
    .arg(&paths.session_path)
    .arg("--pending")
    .arg(&paths.pending_code_path)
    .output()?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    return Ok(TelegramUserSnapshot {
      configured: true,
      runtime_ready: true,
      runtime_detail: if stderr.is_empty() {
        "Telegram user runtime is ready, but the session snapshot failed.".into()
      } else {
        stderr
      },
      session_path,
      authorized: false,
      me_display: None,
      phone: settings.telegram_user_phone.clone(),
      pending_code,
    });
  }

  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  Ok(TelegramUserSnapshot {
    configured: true,
    runtime_ready: true,
    runtime_detail: parsed
      .get("detail")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram user runtime is ready.")
      .to_string(),
    session_path,
    authorized: parsed.get("authorized").and_then(|value| value.as_bool()).unwrap_or(false),
    me_display: parsed
      .get("me_display")
      .and_then(|value| value.as_str())
      .map(ToOwned::to_owned),
    phone: settings.telegram_user_phone.clone(),
    pending_code: parsed
      .get("pending_code")
      .and_then(|value| value.as_bool())
      .unwrap_or(pending_code),
  })
}

pub fn prepare_runtime(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramUserSnapshot, AppError> {
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  ensure_script(app_data_dir)?;
  let output = hidden_command(&python)
    .args(["-m", "pip", "install", "-U", "telethon"])
    .output()?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    return Err(AppError::Message(if stderr.is_empty() {
      format!("Installing the Telegram user runtime failed. {stdout}")
    } else {
      format!("Installing the Telegram user runtime failed. {stderr}")
    }));
  }

  snapshot(app_data_dir, settings)
}

pub fn send_login_code(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramUserActionResult, AppError> {
  ensure_configured(settings)?;
  let paths = resolve_paths(app_data_dir);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let script = ensure_script(app_data_dir)?;

  let output = hidden_command(&python)
    .arg(&script)
    .arg("send_code")
    .arg("--api-id")
    .arg(settings.telegram_user_api_id.trim())
    .arg("--api-hash")
    .arg(settings.telegram_user_api_hash.trim())
    .arg("--phone")
    .arg(settings.telegram_user_phone.trim())
    .arg("--session")
    .arg(&paths.session_path)
    .arg("--pending")
    .arg(&paths.pending_code_path)
    .output()?;

  if !output.status.success() {
    return Err(script_error(&output.stderr, "Sending the Telegram login code failed.")?);
  }

  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  Ok(TelegramUserActionResult {
    snapshot: snapshot(app_data_dir, settings)?,
    detail: parsed
      .get("detail")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram login code sent.")
      .to_string(),
  })
}

pub fn complete_login(
  app_data_dir: &Path,
  settings: &AppSettings,
  payload: &CompleteTelegramUserLoginInput,
) -> Result<TelegramUserActionResult, AppError> {
  ensure_configured(settings)?;
  let paths = resolve_paths(app_data_dir);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let script = ensure_script(app_data_dir)?;

  let mut command = hidden_command(&python);
  command
    .arg(&script)
    .arg("complete_login")
    .arg("--api-id")
    .arg(settings.telegram_user_api_id.trim())
    .arg("--api-hash")
    .arg(settings.telegram_user_api_hash.trim())
    .arg("--phone")
    .arg(settings.telegram_user_phone.trim())
    .arg("--session")
    .arg(&paths.session_path)
    .arg("--pending")
    .arg(&paths.pending_code_path)
    .arg("--code")
    .arg(payload.code.trim());

  if let Some(password) = payload.password.as_deref() {
    if !password.trim().is_empty() {
      command.arg("--password").arg(password.trim());
    }
  }

  let output = command.output()?;
  if !output.status.success() {
    return Err(script_error(&output.stderr, "Completing the Telegram login failed.")?);
  }

  let parsed: Value = serde_json::from_slice(&output.stdout)?;
  Ok(TelegramUserActionResult {
    snapshot: snapshot(app_data_dir, settings)?,
    detail: parsed
      .get("detail")
      .and_then(|value| value.as_str())
      .unwrap_or("Telegram user account connected.")
      .to_string(),
  })
}

pub fn logout(
  app_data_dir: &Path,
  settings: &AppSettings,
) -> Result<TelegramUserActionResult, AppError> {
  let paths = resolve_paths(app_data_dir);
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let script = ensure_script(app_data_dir)?;

  let output = hidden_command(&python)
    .arg(&script)
    .arg("logout")
    .arg("--api-id")
    .arg(settings.telegram_user_api_id.trim())
    .arg("--api-hash")
    .arg(settings.telegram_user_api_hash.trim())
    .arg("--phone")
    .arg(settings.telegram_user_phone.trim())
    .arg("--session")
    .arg(&paths.session_path)
    .arg("--pending")
    .arg(&paths.pending_code_path)
    .output()?;

  if !output.status.success() {
    return Err(script_error(&output.stderr, "Logging out the Telegram user client failed.")?);
  }

  if paths.pending_code_path.exists() {
    let _ = fs::remove_file(&paths.pending_code_path);
  }

  Ok(TelegramUserActionResult {
    snapshot: snapshot(app_data_dir, settings)?,
    detail: "Telegram user session cleared.".into(),
  })
}

pub fn clear_local_session(app_data_dir: &Path) -> Result<(), AppError> {
  let paths = resolve_paths(app_data_dir);
  if let Some(parent) = paths.session_path.parent() {
    if parent.exists() {
      fs::remove_dir_all(parent)?;
    }
  }
  Ok(())
}

fn ensure_configured(settings: &AppSettings) -> Result<(), AppError> {
  if !is_configured(settings) {
    return Err(AppError::Message(
      "Telegram user account settings are incomplete. Add API ID, API hash, and phone number first.".into(),
    ));
  }
  Ok(())
}

fn is_configured(settings: &AppSettings) -> bool {
  !settings.telegram_user_api_id.trim().is_empty()
    && !settings.telegram_user_api_hash.trim().is_empty()
    && !settings.telegram_user_phone.trim().is_empty()
}

#[derive(Debug, Clone)]
struct TelegramUserPaths {
  session_path: PathBuf,
  pending_code_path: PathBuf,
}

fn resolve_paths(app_data_dir: &Path) -> TelegramUserPaths {
  let root = app_data_dir.join("telegram_user");
  TelegramUserPaths {
    session_path: root.join("mtproto_user"),
    pending_code_path: root.join("pending_code.json"),
  }
}

fn python_script_path(app_data_dir: &Path) -> PathBuf {
  app_data_dir.join("telegram_user").join("telegram_user.py")
}

fn ensure_script(app_data_dir: &Path) -> Result<PathBuf, AppError> {
  let path = python_script_path(app_data_dir);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  fs::write(&path, TELEGRAM_USER_SCRIPT)?;
  Ok(path)
}

fn python_command() -> Option<String> {
  let candidates: [(&str, &[&str]); 2] = [("python", &[]), ("py", &["-3"])];

  for (program, prefix_args) in candidates {
    let mut probe = hidden_command(program);
    for arg in prefix_args {
      probe.arg(arg);
    }
    let output = probe.arg("-c").arg("import sys; print(sys.executable)").output();
    if let Ok(output) = output {
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

fn python_runtime_check() -> Result<(), AppError> {
  let python = python_command().ok_or_else(|| AppError::Message("Could not find a Python runtime. Install Python 3 first.".into()))?;
  let output = hidden_command(&python)
    .arg("-c")
    .arg("import telethon")
    .output()?;
  if output.status.success() {
    Ok(())
  } else {
    Err(AppError::Message(String::from_utf8_lossy(&output.stderr).trim().to_string()))
  }
}

fn script_error(stderr: &[u8], default_message: &str) -> Result<AppError, AppError> {
  let text = String::from_utf8_lossy(stderr).trim().to_string();
  Ok(AppError::Message(if text.is_empty() { default_message.into() } else { text }))
}

fn hidden_command(program: &str) -> Command {
  let mut command = Command::new(program);
  #[cfg(windows)]
  command.creation_flags(CREATE_NO_WINDOW);
  command
}
