use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::FromRequestParts, http::request::Parts};
use rusqlite::{params, Row};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::{
    db::{now, LITE_USER},
    error::{ApiError, ApiResult},
    state::AppState,
};

#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    /// `admin`, `user` or `guest`. Guests can watch and sync but cannot record.
    pub role: String,
    /// `active` or `suspended`.
    pub status: String,
    /// Recordings at once. 0 means no limit.
    pub max_concurrent: i64,
    /// Longest single recording in hours. 0 means no limit.
    pub max_hours: i64,
    /// Storage in bytes. 0 means no limit.
    pub storage_bytes: i64,
    /// Default retention for new recordings, in hours. None keeps them until deleted.
    pub keep_hours: Option<i64>,
    pub note: String,
    pub created_at: i64,
    pub last_login: Option<i64>,
}

pub const USER_COLUMNS: &str = "id, username, role, status, max_concurrent, max_hours, storage_bytes, keep_hours, note, created_at, last_login";

pub fn user_from_row(row: &Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get(0)?,
        username: row.get(1)?,
        role: row.get(2)?,
        status: row.get(3)?,
        max_concurrent: row.get(4)?,
        max_hours: row.get(5)?,
        storage_bytes: row.get(6)?,
        keep_hours: row.get(7)?,
        note: row.get(8)?,
        created_at: row.get(9)?,
        last_login: row.get(10)?,
    })
}

pub fn hash_password(password: &str) -> ApiResult<String> {
    let mut raw = [0u8; 16];
    getrandom::getrandom(&mut raw).map_err(|e| ApiError::Internal(e.to_string()))?;
    let salt = SaltString::encode_b64(&raw).map_err(|e| ApiError::Internal(e.to_string()))?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| ApiError::Internal(e.to_string()))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

pub fn check_new_password(password: &str) -> ApiResult<()> {
    if password.chars().count() < 8 {
        return Err(ApiError::bad("Use a password of at least 8 characters."));
    }
    Ok(())
}

pub fn check_username(name: &str) -> ApiResult<()> {
    let ok = (3..=32).contains(&name.chars().count())
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.');
    if ok {
        Ok(())
    } else {
        Err(ApiError::bad(
            "Usernames are 3-32 letters, digits, dots, dashes or underscores.",
        ))
    }
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("system random source");
    hex::encode(bytes)
}

/// Only a hash of the token is stored, so a leaked database cannot be used to sign in.
pub fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub fn create_session(state: &AppState, user_id: &str, agent: &str, ip: &str) -> ApiResult<String> {
    let token = random_token();
    let days: i64 = state.db.setting("session_days", "30").parse().unwrap_or(30);
    let conn = state.db.conn();
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, agent, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![token_hash(&token), user_id, now(), now() + days * 86_400, agent, ip],
    )?;
    conn.execute(
        "UPDATE users SET last_login = ?1 WHERE id = ?2",
        params![now(), user_id],
    )?;
    Ok(token)
}

pub fn bearer(parts: &Parts) -> Option<String> {
    if let Some(value) = parts
        .headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(token.trim().to_string());
        }
    }
    // Video elements cannot set headers, so media routes also accept ?token=. Other routes do not:
    // a token in a URL ends up in logs and history.
    let path = parts.uri.path();
    let media = path.ends_with("/index.m3u8")
        || path.contains("/seg/")
        || path.ends_with("/download")
        || path.ends_with("/proxy");
    if !media {
        return None;
    }
    parts
        .uri
        .query()?
        .split('&')
        .find_map(|pair| pair.strip_prefix("token="))
        .map(str::to_string)
}

/// The signed-in user. In lite mode this is the one implicit local user.
pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let conn = state.db.conn();
        if state.config.is_lite() {
            let user = conn.query_row(
                &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
                [LITE_USER],
                user_from_row,
            )?;
            return Ok(AuthUser(user));
        }
        let token = bearer(parts).ok_or(ApiError::Unauthorized)?;
        let user = conn
            .query_row(
                &format!(
                    "SELECT {} FROM users u JOIN sessions s ON s.user_id = u.id
                     WHERE s.token_hash = ?1 AND s.expires_at > ?2",
                    USER_COLUMNS
                        .split(", ")
                        .map(|c| format!("u.{c}"))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                params![token_hash(&token), now()],
                user_from_row,
            )
            .map_err(|_| ApiError::Unauthorized)?;
        if user.status != "active" {
            return Err(ApiError::forbidden("This account is suspended."));
        }
        Ok(AuthUser(user))
    }
}

/// A signed-in user with the admin role.
pub struct AdminUser(pub User);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let AuthUser(user) = AuthUser::from_request_parts(parts, state).await?;
        if user.role != "admin" {
            return Err(ApiError::forbidden("Administrators only."));
        }
        Ok(AdminUser(user))
    }
}
