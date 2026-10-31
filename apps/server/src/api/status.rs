use std::time::Duration;

use axum::{extract::State, Json};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    db::now,
    error::{ApiError, ApiResult},
    jobs::free_disk,
    net::check_target,
    state::AppState,
};

/// A short summary for the app's settings screen: version, disk and what is next.
pub async fn status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let dir = state.config.recordings_dir();
    let total = fs4::total_space(&dir).ok();
    let conn = state.db.conn();
    let count = |status: &str| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM recordings WHERE user_id = ?1 AND status = ?2",
            params![user.id, status],
            |r| r.get(0),
        )
        .unwrap_or(0)
    };
    let next: Option<(String, i64)> = conn
        .query_row(
            "SELECT title, start_at FROM recordings WHERE user_id = ?1 AND status = 'scheduled' AND start_at > ?2 ORDER BY start_at LIMIT 1",
            params![user.id, now()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    Ok(Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "mode": state.config.mode.as_str(),
        "diskFree": free_disk(&state),
        "diskTotal": total,
        "recording": count("recording"),
        "scheduled": count("scheduled"),
        "failed": count("failed"),
        "next": next.map(|(title, at)| json!({ "title": title, "startAt": at })),
    })))
}

#[derive(Deserialize)]
pub struct Probe {
    url: String,
}

/// Opens a stream for a moment to see whether it answers, before anything is scheduled.
pub async fn test_channel(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Json(body): Json<Probe>,
) -> ApiResult<Json<Value>> {
    check_target(&state, &body.url).await?;
    let response = state
        .http
        .get(&body.url)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| ApiError::bad(format!("The stream did not answer: {e}")))?;
    let status = response.status();
    let kind = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    Ok(Json(
        json!({ "ok": status.is_success(), "status": status.as_u16(), "contentType": kind }),
    ))
}
