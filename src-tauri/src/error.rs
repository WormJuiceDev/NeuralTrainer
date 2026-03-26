use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
  #[error("could not determine an app data directory")]
  MissingAppDataDir,
  #[error("database error: {0}")]
  Db(#[from] rusqlite::Error),
  #[error("io error: {0}")]
  Io(#[from] std::io::Error),
  #[error("serialization error: {0}")]
  Json(#[from] serde_json::Error),
  #[error("http error: {0}")]
  Http(#[from] reqwest::Error),
  #[error("{0}")]
  Message(String),
}

impl serde::Serialize for AppError {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: serde::Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}
