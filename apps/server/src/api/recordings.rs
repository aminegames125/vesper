use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::{stream, StreamExt};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use super::files;
use crate::{
    auth::{bearer, AuthUser, User},
    db::now,
    encode,
    error::{ApiError, ApiResult},
    jobs::{self, check_quota, recording_dir, remove_files},
    net::check_target,
    state::AppState,
    ytdlp,
};

const COLUMNS: &str = "id, user_id, title, channel_name, status, start_at, max_seconds, seconds, bytes, keep_hours, keep_until, error, created_at, finished_at, schedule_id, kind, tag, watched, position_s, backup_url, thumb, file_name, series_rule_id, total_bytes, engine, encoder, live";

/// The longest a recording can be kept: ten years.
const MAX_KEEP_HOURS: i64 = 24 * 365 * 10;

/// How long a new recording is kept when nobody chose: a week. An admin can change or clear it.
pub const DEFAULT_KEEP_HOURS: &str = "168";

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
        "kind": r.get::<_, String>(15)?,
        "tag": r.get::<_, String>(16)?,
        "watched": r.get::<_, i64>(17)? != 0,
        "positionS": r.get::<_, i64>(18)?,
        "backupUrl": r.get::<_, Option<String>>(19)?,
        "thumb": r.get::<_, i64>(20)? != 0,
        "fileName": r.get::<_, Option<String>>(21)?,
        "seriesRuleId": r.get::<_, Option<String>>(22)?,
        "totalBytes": r.get::<_, Option<i64>>(23)?,
        "engine": r.get::<_, String>(24)?,
        "encoder": r.get::<_, String>(25)?,
        "live": r.get::<_, i64>(26)? != 0,
    }))
}

/// Loads a recording the user may see: their own, or any for an admin.
pub fn owned(state: &AppState, user: &User, id: &str) -> ApiResult<(Value, String)> {
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

#[derive(Deserialize, Default)]
pub struct ListQuery {
    #[serde(default)]
    tag: String,
    #[serde(default)]
    q: String,
    #[serde(default)]
    kind: String,
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(filter): Query<ListQuery>,
) -> ApiResult<Json<Value>> {
    // Count storage first: the database lock is not re-entrant.
    let used = jobs::storage_used(&state, &user.id);
    let conn = state.db.conn();
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM recordings
         WHERE user_id = ?1
           AND (?2 = '' OR tag = ?2)
           AND (?3 = '' OR title LIKE '%' || ?3 || '%')
           AND (?4 = '' OR kind = ?4)
         ORDER BY created_at DESC"
    ))?;
    let rows = stmt
        .query_map(
            params![user.id, filter.tag, filter.q.trim(), filter.kind],
            row_json,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let mut tags = conn.prepare(
        "SELECT DISTINCT tag FROM recordings WHERE user_id = ?1 AND tag != '' ORDER BY tag",
    )?;
    let tags = tags
        .query_map([&user.id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({
        "recordings": rows,
        "tags": tags,
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
    /// A second address for the same channel, tried when the first keeps failing.
    #[serde(default)]
    backup_url: Option<String>,
    #[serde(default)]
    tag: String,
}

/// The keep time for a new item: what was asked, else the account's, else the server's default.
pub fn keep_for(state: &AppState, user: &User, asked: Option<i64>) -> Option<i64> {
    let default_keep = user.keep_hours.or_else(|| {
        state
            .db
            .setting("default_keep_hours", DEFAULT_KEEP_HOURS)
            .parse()
            .ok()
    });
    match asked {
        Some(0) => None,
        Some(h) if h > 0 => Some(h.min(MAX_KEEP_HOURS)),
        _ => default_keep
            .filter(|h| *h > 0)
            .map(|h| h.min(MAX_KEEP_HOURS)),
    }
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
    let backup = body.backup_url.as_deref().filter(|u| !u.is_empty());
    if let Some(backup) = backup {
        check_target(&state, backup).await?;
    }
    let title: String = body.title.trim().chars().take(120).collect();
    if title.is_empty() {
        return Err(ApiError::bad("Give the recording a title."));
    }

    let keep_hours = keep_for(&state, &user, body.keep_hours);
    let start_at = body.start_at.unwrap_or(0).max(0);
    let later = start_at > now() + 5;
    let id = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO recordings (id, user_id, title, channel_name, source_url, status, start_at, max_seconds, keep_hours, created_at, backup_url, tag)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, user.id, title, body.channel_name.chars().take(120).collect::<String>(), body.url,
                if later { "scheduled" } else { "queued" }, if later { start_at } else { now() }, seconds, keep_hours, now(),
                backup, body.tag.trim().chars().take(40).collect::<String>()],
    )?;
    if !later {
        jobs::start(&state, &id);
    }
    state.db.audit(&user.username, "recording.create", &title);
    Ok(Json(json!({ "id": id })))
}

#[derive(Deserialize)]
pub struct NewDownload {
    title: String,
    url: String,
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default)]
    tag: String,
    /// `auto` picks yt-dlp for web pages and a plain fetch for files; or `direct` / `ytdlp`.
    #[serde(default)]
    engine: String,
    /// An id from `/capabilities`. Leave out for the admin's default.
    #[serde(default)]
    encoder: Option<String>,
    /// `best`, `2160`, `1080`, `720`, `480` or `audio` (yt-dlp only).
    #[serde(default)]
    quality: String,
    /// A live stream: keep what was captured until it is stopped (yt-dlp only).
    #[serde(default)]
    live: bool,
}

/// Saves a movie or episode file from a source address to the server, so it can be watched later.
pub async fn create_download(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NewDownload>,
) -> ApiResult<Json<Value>> {
    if user.role == "guest" {
        return Err(ApiError::forbidden("Guest accounts cannot download."));
    }
    if user.storage_bytes > 0 && jobs::storage_used(&state, &user.id) >= user.storage_bytes {
        return Err(ApiError::forbidden(
            "Your cloud storage is full. Delete something first.",
        ));
    }
    check_target(&state, &body.url).await?;
    // A plugin may know how to download an address the server does not (a new site).
    let mut address = body.url.clone();
    let mut requested_engine = body.engine.clone();
    let mut fallback_title = None;
    if let Some((_, found)) = crate::plugins::resolve(&state, &body.url).await {
        check_target(&state, &found.url).await?;
        address = found.url;
        fallback_title = found.title;
        if let Some(engine) = found.engine {
            requested_engine = engine;
        }
    }
    let mut title: String = body.title.trim().chars().take(120).collect();
    if title.is_empty() {
        title = fallback_title
            .unwrap_or_default()
            .trim()
            .chars()
            .take(120)
            .collect();
    }
    if title.is_empty() {
        return Err(ApiError::bad("Give the download a title."));
    }
    let keep_hours = keep_for(&state, &user, body.keep_hours);
    let engine = match requested_engine.as_str() {
        "" | "auto" => {
            if ytdlp::available() && ytdlp::looks_like_a_page(&address) {
                "ytdlp"
            } else {
                "direct"
            }
        }
        "direct" => "direct",
        "ytdlp" => "ytdlp",
        _ => return Err(ApiError::bad("The engine must be auto, direct or ytdlp.")),
    };
    if engine == "ytdlp" && !ytdlp::available() {
        return Err(ApiError::bad(
            "yt-dlp is not installed on this server, so it cannot save web pages.",
        ));
    }
    let quality = if body.quality.is_empty() {
        "best"
    } else {
        body.quality.as_str()
    };
    if ytdlp::format_for(quality).is_none() {
        return Err(ApiError::bad("Unknown quality."));
    }
    let encoder_id = body
        .encoder
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| state.db.setting("default_encoder", encode::DEFAULT));
    let encoder = encode::validate(&encoder_id).map_err(ApiError::bad)?;
    let live = body.live && engine == "ytdlp";
    let id = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO recordings (id, user_id, title, channel_name, source_url, status, start_at, max_seconds, keep_hours, created_at, kind, tag, engine, encoder, dl_quality, live)
         VALUES (?1, ?2, ?3, '', ?4, 'queued', ?5, 0, ?6, ?5, 'download', ?7, ?8, ?9, ?10, ?11)",
        params![id, user.id, title, address, now(), keep_hours,
                body.tag.trim().chars().take(40).collect::<String>(),
                engine, encoder.id, quality, live as i64],
    )?;
    jobs::start(&state, &id);
    state.db.audit(&user.username, "download.create", &title);
    crate::plugins::emit(
        &state,
        None,
        "download.created",
        json!({ "id": id, "title": title, "url": address, "engine": engine, "encoder": encoder.id, "user": user.username }),
    );
    Ok(Json(
        json!({ "id": id, "engine": engine, "encoder": encoder.id }),
    ))
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
    if value["status"] == "scheduled"
        && (!value["scheduleId"].is_null() || !value["seriesRuleId"].is_null())
    {
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

/// Sets how long a finished item stays. 0 keeps it until it is deleted.
fn apply_keep(state: &AppState, id: &str, status: &str, hours: i64) -> rusqlite::Result<()> {
    let hours = hours.clamp(0, MAX_KEEP_HOURS);
    let keep = Some(hours).filter(|h| *h > 0);
    // While it is still recording the time starts when it ends (the job sets keep_until then).
    let finished = matches!(status, "done" | "failed");
    let until = if finished {
        keep.map(|h| now() + h * 3600)
    } else {
        None
    };
    state
        .db
        .conn()
        .execute(
            "UPDATE recordings SET keep_until = ?1, keep_hours = ?2, pinned = ?3 WHERE id = ?4",
            params![until, keep, i64::from(keep.is_none()), id],
        )
        .map(|_| ())
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
    let (value, _) = owned(&state, &user, &id)?;
    apply_keep(
        &state,
        &id,
        value["status"].as_str().unwrap_or(""),
        body.hours,
    )?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct Patch {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    tag: Option<String>,
    /// Hours from now; 0 keeps it until it is deleted.
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default)]
    watched: Option<bool>,
    /// Where playback stopped, in seconds.
    #[serde(default)]
    position_s: Option<i64>,
}

/// Changes a recording's title, folder, keep time, or watch state.
pub async fn patch(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Patch>,
) -> ApiResult<Json<Value>> {
    let (value, _) = owned(&state, &user, &id)?;
    let conn = || state.db.conn();
    if let Some(title) = body.title {
        let title: String = title.trim().chars().take(120).collect();
        if title.is_empty() {
            return Err(ApiError::bad("Give the recording a title."));
        }
        conn().execute(
            "UPDATE recordings SET title = ?1 WHERE id = ?2",
            params![title, id],
        )?;
    }
    if let Some(tag) = body.tag {
        conn().execute(
            "UPDATE recordings SET tag = ?1 WHERE id = ?2",
            params![tag.trim().chars().take(40).collect::<String>(), id],
        )?;
    }
    if let Some(hours) = body.keep_hours {
        apply_keep(&state, &id, value["status"].as_str().unwrap_or(""), hours)?;
    }
    if let Some(position) = body.position_s {
        conn().execute(
            "UPDATE recordings SET position_s = ?1 WHERE id = ?2",
            params![position.max(0), id],
        )?;
    }
    if let Some(watched) = body.watched {
        conn().execute(
            "UPDATE recordings SET watched = ?1 WHERE id = ?2",
            params![i64::from(watched), id],
        )?;
        // "Delete watched after N days": pull the expiry in, never push it out.
        let days: i64 = state
            .db
            .setting("delete_watched_days", "0")
            .parse()
            .unwrap_or(0);
        if watched && days > 0 && value["status"] == "done" {
            conn().execute(
                "UPDATE recordings SET keep_until = ?1
                 WHERE id = ?2 AND keep_until > ?1",
                params![now() + days.min(3650) * 86_400, id],
            )?;
        }
    }
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
            conn.prepare("SELECT id FROM recordings WHERE user_id = ?1 AND status = 'failed'
               AND NOT (error LIKE 'Cancelled%' AND (schedule_id IS NOT NULL OR series_rule_id IS NOT NULL))")?;
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

/// The recording as an HLS playlist text, with segment links carrying `suffix` (a `?token=` or nothing).
pub async fn playlist_text(
    state: &AppState,
    owner: &str,
    id: &str,
    suffix: &str,
) -> ApiResult<Response> {
    let text = tokio::fs::read_to_string(recording_dir(state, owner, id).join("index.m3u8"))
        .await
        .map_err(|_| ApiError::not_found("Nothing has been recorded yet."))?;
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

/// The recording as an HLS playlist, so any device can play it, even while it is still recording.
pub async fn playlist(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    parts: Parts,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (_, owner) = owned(&state, &user, &id)?;
    let suffix = bearer(&parts)
        .map(|t| format!("?token={t}"))
        .unwrap_or_default();
    playlist_text(&state, &owner, &id, &suffix).await
}

pub fn valid_segment(name: &str) -> bool {
    name.len() >= 11
        && name.starts_with("seg")
        && name.ends_with(".ts")
        && name.is_char_boundary(name.len() - 3)
        && name[3..name.len() - 3].chars().all(|c| c.is_ascii_digit())
}

pub async fn segment_file(
    state: &AppState,
    owner: &str,
    id: &str,
    name: &str,
    headers: &HeaderMap,
) -> ApiResult<Response> {
    if !valid_segment(name) {
        return Err(ApiError::not_found("Segment not found."));
    }
    files::serve(
        &recording_dir(state, owner, id).join(name),
        "video/mp2t",
        "private, max-age=3600",
        headers,
        None,
    )
    .await
}

pub async fn segment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path((id, name)): Path<(String, String)>,
) -> ApiResult<Response> {
    let (_, owner) = owned(&state, &user, &id)?;
    segment_file(&state, &owner, &id, &name, &headers).await
}

fn file_type(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" | "m4v" => "video/mp4",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "ts" => "video/mp2t",
        _ => "application/octet-stream",
    }
}

/// A file name that is safe in a header and on disk.
pub fn clean_name(title: &str) -> String {
    title.replace(
        |c: char| !(c.is_alphanumeric() || c == ' ' || c == '-'),
        "_",
    )
}

/// The whole item as one file: a saved download as it is, a recording stitched from its segments.
pub async fn download_file(
    state: &AppState,
    owner: &str,
    id: &str,
    headers: &HeaderMap,
) -> ApiResult<Response> {
    let (title, kind, file): (String, String, Option<String>) = state.db.conn().query_row(
        "SELECT title, kind, file_name FROM recordings WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let dir = recording_dir(state, owner, id);
    let title = clean_name(&title);

    if kind == "download" {
        let name = file
            .filter(|n| !n.contains(['/', '\\']))
            .ok_or_else(|| ApiError::not_found("Nothing has been saved yet."))?;
        let ext = name.rsplit('.').next().unwrap_or("mp4").to_string();
        return files::serve(
            &dir.join(&name),
            file_type(&name),
            "private, max-age=3600",
            headers,
            Some(format!("attachment; filename=\"{title}.{ext}\"")),
        )
        .await;
    }

    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|_| ApiError::not_found("Nothing has been recorded yet."))?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| valid_segment(n))
        .collect();
    names.sort();
    let parts = stream::iter(names).then(move |name| {
        let path = dir.join(name);
        async move { tokio::fs::read(path).await }
    });
    let mut response = Response::new(Body::from_stream(parts));
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

/// Streams the whole recording as one file.
pub async fn download(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (_, owner) = owned(&state, &user, &id)?;
    download_file(&state, &owner, &id, &headers).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_numbered_segments_are_served() {
        assert!(valid_segment("seg00001.ts"));
        assert!(!valid_segment("../seg0001.ts"));
        assert!(!valid_segment("seg0000a.ts"));
        assert!(!valid_segment("index.m3u8"));
    }

    #[test]
    fn titles_become_safe_file_names() {
        assert_eq!(clean_name("News: 8/9 \"live\""), "News_ 8_9 _live_");
    }
}
