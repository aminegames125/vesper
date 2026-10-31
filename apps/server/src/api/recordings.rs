use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, request::Parts, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::stream;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::{bearer, AuthUser, User},
    db::now,
    error::{ApiError, ApiResult},
    jobs::{self, check_quota, recording_dir, remove_files},
    net::check_target,
    state::AppState,
};

const COLUMNS: &str = "id, user_id, title, channel_name, status, start_at, max_seconds, seconds, bytes, keep_hours, keep_until, error, created_at, finished_at, schedule_id";

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "title": r.get::<_, String>(2)?,
        "channelName": r.get::<_, String>(3)?,
        "status": r.get::<_, String>(4)?,
        "startAt": r.get::<_, i64>(5)?,
        "maxSeconds": r.get::<_, i64>(6)?,
        "seconds": r.get::<_, i64>(7)?,
        "bytes": r.get::<_, i64>(8)?,
        "keepHours": r.get::<_, Option<i64>>(9)?,
        "keepUntil": r.get::<_, Option<i64>>(10)?,
        "error": r.get::<_, Option<String>>(11)?,
        "createdAt": r.get::<_, i64>(12)?,
        "finishedAt": r.get::<_, Option<i64>>(13)?,
        "scheduleId": r.get::<_, Option<String>>(14)?,
    }))
}

/// Loads a recording the user may see: their own, or any for an admin.
fn owned(state: &AppState, user: &User, id: &str) -> ApiResult<(Value, String)> {
    let conn = state.db.conn();
    let (value, owner): (Value, String) = conn.query_row(
        &format!("SELECT {COLUMNS} FROM recordings WHERE id = ?1"),
        [id],
        |r| Ok((row_json(r)?, r.get::<_, String>(1)?)),
    )?;
    if owner != user.id && user.role != "admin" {
        return Err(ApiError::not_found("Recording not found."));
    }
    Ok((value, owner))
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    // Count storage first: the database lock is not re-entrant.
    let used = jobs::storage_used(&state, &user.id);
    let conn = state.db.conn();
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM recordings WHERE user_id = ?1 ORDER BY created_at DESC"
    ))?;
    let rows = stmt
        .query_map([&user.id], row_json)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({
        "recordings": rows,
        "storageUsed": used,
        "storageLimit": user.storage_bytes,
    })))
}

#[derive(Deserialize)]
pub struct NewRecording {
    title: String,
    #[serde(default)]
    channel_name: String,
    url: String,
    seconds: i64,
    /// Epoch seconds. Omit or use a past time to start right away.
    #[serde(default)]
    start_at: Option<i64>,
    /// How long to keep the recording after it finishes. 0 keeps it until deleted; omit for the account default.
    #[serde(default)]
    keep_hours: Option<i64>,
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NewRecording>,
) -> ApiResult<Json<Value>> {
    // 0 means "until I stop it": run as long as the account allows (a day when there is no limit).
    let seconds = match body.seconds {
        0 if user.max_hours > 0 => user.max_hours * 3600,
        0 => 24 * 3600,
        n => n,
    };
    check_quota(&state, &user, seconds)?;
    check_target(&state, &body.url).await?;
    let title: String = body.title.trim().chars().take(120).collect();
    if title.is_empty() {
        return Err(ApiError::bad("Give the recording a title."));
    }

    let default_keep = user
        .keep_hours
        .or_else(|| state.db.setting("default_keep_hours", "").parse().ok());
    let keep_hours = match body.keep_hours {
        Some(0) => None,
        Some(h) if h > 0 => Some(h.min(24 * 365 * 10)),
        _ => default_keep.filter(|h| *h > 0),
    };
    let start_at = body.start_at.unwrap_or(0).max(0);
    let later = start_at > now() + 5;
    let id = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO recordings (id, user_id, title, channel_name, source_url, status, start_at, max_seconds, keep_hours, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, user.id, title, body.channel_name.chars().take(120).collect::<String>(), body.url,
                if later { "scheduled" } else { "queued" }, if later { start_at } else { now() }, seconds, keep_hours, now()],
    )?;
    if !later {
        jobs::start(&state, &id);
    }
    state.db.audit(&user.username, "recording.create", &title);
    Ok(Json(json!({ "id": id })))
}

pub async fn show(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    Ok(Json(owned(&state, &user, &id)?.0))
}

pub async fn stop(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let (value, _) = owned(&state, &user, &id)?;
    if value["status"] == "scheduled" {
        state.db.conn().execute("UPDATE recordings SET status = 'failed', error = 'Cancelled.', finished_at = ?1 WHERE id = ?2", params![now(), id])?;
    } else {
        jobs::stop(&state, &id);
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let (value, owner) = owned(&state, &user, &id)?;
    // An occurrence of a repeating schedule is kept as "cancelled" so it is not created again.
    if value["status"] == "scheduled" && !value["scheduleId"].is_null() {
        state.db.conn().execute(
            "UPDATE recordings SET status = 'failed', error = 'Cancelled.', finished_at = ?1 WHERE id = ?2",
            params![now(), id],
        )?;
        return Ok(Json(json!({ "ok": true })));
    }
    jobs::stop(&state, &id);
    remove_files(&state, &owner, &id);
    state
        .db
        .conn()
        .execute("DELETE FROM recordings WHERE id = ?1", [&id])?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct Keep {
    /// Hours from now. 0 keeps the recording until it is deleted.
    hours: i64,
}

/// Changes how long a finished recording stays on the server.
pub async fn set_keep(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Keep>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let hours = body.hours.clamp(0, 24 * 365 * 10);
    let until = (hours > 0).then(|| now() + hours * 3600);
    state.db.conn().execute(
        "UPDATE recordings SET keep_until = ?1, keep_hours = ?2 WHERE id = ?3",
        params![until, Some(hours).filter(|h| *h > 0), id],
    )?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct Rename {
    title: String,
}

/// Gives a recording a new title.
pub async fn rename(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Rename>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let title: String = body.title.trim().chars().take(120).collect();
    if title.is_empty() {
        return Err(ApiError::bad("Give the recording a title."));
    }
    state.db.conn().execute(
        "UPDATE recordings SET title = ?1 WHERE id = ?2",
        params![title, id],
    )?;
    Ok(Json(json!({ "ok": true })))
}

/// Deletes every failed recording of the account in one go.
pub async fn clear_failed(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let ids: Vec<String> = {
        let conn = state.db.conn();
        let mut stmt =
            conn.prepare("SELECT id FROM recordings WHERE user_id = ?1 AND status = 'failed'")?;
        let rows = stmt
            .query_map([&user.id], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        rows
    };
    for id in &ids {
        remove_files(&state, &user.id, id);
        let _ = state
            .db
            .conn()
            .execute("DELETE FROM recordings WHERE id = ?1", [id]);
    }
    Ok(Json(json!({ "removed": ids.len() })))
}

/// The recording as an HLS playlist, so any device can play it, even while it is still recording.
pub async fn playlist(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    parts: Parts,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (_, owner) = owned(&state, &user, &id)?;
    let text = tokio::fs::read_to_string(recording_dir(&state, &owner, &id).join("index.m3u8"))
        .await
        .map_err(|_| ApiError::not_found("Nothing has been recorded yet."))?;
    let suffix = bearer(&parts)
        .map(|t| format!("?token={t}"))
        .unwrap_or_default();
    let rewritten: String = text
        .lines()
        .map(|line| {
            if line.ends_with(".ts") {
                format!("seg/{line}{suffix}\n")
            } else {
                format!("{line}\n")
            }
        })
        .collect();
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.apple.mpegurl"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        rewritten,
    )
        .into_response())
}

fn valid_segment(name: &str) -> bool {
    name.len() == 11
        && name.starts_with("seg")
        && name.ends_with(".ts")
        && name[3..8].chars().all(|c| c.is_ascii_digit())
}

pub async fn segment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, name)): Path<(String, String)>,
) -> ApiResult<Response> {
    if !valid_segment(&name) {
        return Err(ApiError::not_found("Segment not found."));
    }
    let (_, owner) = owned(&state, &user, &id)?;
    let data = tokio::fs::read(recording_dir(&state, &owner, &id).join(&name))
        .await
        .map_err(|_| ApiError::not_found("Segment not found."))?;
    Ok((
        [
            (header::CONTENT_TYPE, "video/mp2t"),
            (header::CACHE_CONTROL, "private, max-age=3600"),
        ],
        data,
    )
        .into_response())
}

/// Streams the whole recording as one .ts file.
pub async fn download(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (value, owner) = owned(&state, &user, &id)?;
    let dir = recording_dir(&state, &owner, &id);
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|_| ApiError::not_found("Nothing has been recorded yet."))?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| valid_segment(n))
        .collect();
    names.sort();
    let files = stream::iter(names).then(move |name| {
        let path = dir.join(name);
        async move { tokio::fs::read(path).await }
    });
    let title = value["title"].as_str().unwrap_or("recording").replace(
        |c: char| !(c.is_alphanumeric() || c == ' ' || c == '-'),
        "_",
    );
    let mut response = Response::new(Body::from_stream(files));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("video/mp2t"));
    if let Ok(disposition) = HeaderValue::from_str(&format!("attachment; filename=\"{title}.ts\""))
    {
        response
            .headers_mut()
            .insert(header::CONTENT_DISPOSITION, disposition);
    }
    *response.status_mut() = StatusCode::OK;
    Ok(response)
}

use futures_util::StreamExt;
