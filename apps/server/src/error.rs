use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String),
    #[error("Sign in to continue.")]
    Unauthorized,
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error("Too many attempts. Try again in a minute.")]
    TooMany,
    #[error("Something went wrong on the server.")]
    Internal(String),
}

impl ApiError {
    pub fn bad(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Forbidden(message.into())
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        match &error {
            rusqlite::Error::QueryReturnedNoRows => Self::NotFound("Not found.".into()),
            rusqlite::Error::SqliteFailure(f, _)
                if f.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                Self::Conflict("That already exists.".into())
            }
            _ => Self::Internal(error.to_string()),
        }
    }
}

impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::TooMany => StatusCode::TOO_MANY_REQUESTS,
            Self::Internal(detail) => {
                tracing::error!("internal error: {detail}");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
