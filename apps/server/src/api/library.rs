//! Extras around finished recordings: bookmarks, share links, thumbnails, MP4 export and trim.

use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    response::Response,
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{
    files,
    recordings::{download_file, keep_for, owned, playlist_text, playlist_with, segment_file},
};
use crate::{
    auth::AuthUser,
    db::now,
    error::{ApiError, ApiResult},
    ffmpeg,
    jobs::recording_dir,
    state::AppState,
};

// ---- bookmarks ("chapters") ----

pub async fn bookmarks(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let conn = state.db.conn();
    let mut stmt = conn
        .prepare("SELECT id, at_s, label FROM bookmarks WHERE recording_id = ?1 ORDER BY at_s")?;
    let rows = stmt
        .query_map([&id], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "atS": r.get::<_, i64>(1)?, "label": r.get::<_, String>(2)? }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "bookmarks": rows })))
}

#[derive(Deserialize)]
pub struct NewBookmark {
    at_s: i64,
    #[serde(default)]
    label: String,
}

pub async fn add_bookmark(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<NewBookmark>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let count: i64 = state
        .db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM bookmarks WHERE recording_id = ?1",
            [&id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count >= 200 {
        return Err(ApiError::bad("That recording has enough bookmarks."));
    }
    let bookmark = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO bookmarks (id, recording_id, at_s, label) VALUES (?1, ?2, ?3, ?4)",
        params![
            bookmark,
            id,
            body.at_s.max(0),
            body.label.trim().chars().take(80).collect::<String>()
        ],
    )?;
    Ok(Json(json!({ "id": bookmark })))
}

pub async fn remove_bookmark(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, bookmark)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    state.db.conn().execute(
        "DELETE FROM bookmarks WHERE id = ?1 AND recording_id = ?2",
        params![bookmark, id],
    )?;
    Ok(Json(json!({ "ok": true })))
}

// ---- share links ----

#[derive(Deserialize, Default)]
pub struct NewShare {
    /// How long the link works. Default a day, at most 30 days.
    #[serde(default)]
    hours: Option<i64>,
}

/// Makes a link that plays one recording without logging in, until it expires.
pub async fn create_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    body: Option<Json<NewShare>>,
) -> ApiResult<Json<Value>> {
    let (value, _) = owned(&state, &user, &id)?;
    if value["kind"] == "download" {
        return Err(ApiError::bad("Only recordings can be shared."));
    }
    let hours = body.and_then(|b| b.0.hours).unwrap_or(24).clamp(1, 24 * 30);
    let token = short_code();
    let expires = now() + hours * 3600;
    state.db.conn().execute(
        "INSERT INTO shares (token, recording_id, expires_at) VALUES (?1, ?2, ?3)",
        params![token, id, expires],
    )?;
    state.db.audit(&user.username, "recording.share", &id);
    Ok(Json(json!({
        "token": token,
        "path": format!("/api/v1/share/{token}/index.m3u8"),
        "short": format!("/s/{token}"),
        "download": format!("/api/v1/share/{token}/download"),
        "expiresAt": expires,
    })))
}

/// Ten letters and digits: short enough to type into a player, long enough that nobody guesses one
/// (about 58 bits), and a link only ever opens the one recording it was made for.
fn short_code() -> String {
    const ALPHABET: &[u8] = b"abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let limit = (256 / ALPHABET.len() * ALPHABET.len()) as u8;
    let mut code = String::with_capacity(10);
    while code.len() < 10 {
        let mut byte = [0u8; 1];
        getrandom::getrandom(&mut byte).expect("system random source");
        // Skip the few values that would make some characters likelier than others.
        if byte[0] < limit {
            code.push(ALPHABET[byte[0] as usize % ALPHABET.len()] as char);
        }
    }
    code
}

/// The live links of a recording.
pub async fn list_shares(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT token, expires_at FROM shares WHERE recording_id = ?1 AND expires_at > ?2 ORDER BY expires_at",
    )?;
    let items: Vec<Value> = stmt
        .query_map(params![id, now()], |r| {
            Ok(json!({ "token": r.get::<_, String>(0)?, "expiresAt": r.get::<_, i64>(1)? }))
        })?
        .flatten()
        .collect();
    Ok(Json(json!({ "shares": items })))
}

/// Stops a link from working.
pub async fn revoke_share(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, token)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    state.db.conn().execute(
        "DELETE FROM shares WHERE token = ?1 AND recording_id = ?2",
        params![token, id],
    )?;
    state.db.audit(&user.username, "recording.unshare", &id);
    Ok(Json(json!({ "ok": true })))
}

/// Owner and id of the recording a live share link points at.
fn shared(state: &AppState, token: &str) -> ApiResult<(String, String)> {
    state
        .db
        .conn()
        .query_row(
            "SELECT r.user_id, r.id FROM shares s JOIN recordings r ON r.id = s.recording_id
             WHERE s.token = ?1 AND s.expires_at > ?2",
            params![token, now()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| ApiError::not_found("This link has expired."))
}

pub async fn shared_playlist(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    let (owner, id) = shared(&state, &token)?;
    playlist_text(&state, &owner, &id, "").await
}

/// A short link: `/s/<code>` is the playlist and `/s/<code>/<segment>` its pieces.
pub async fn short_playlist(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    let (owner, id) = shared(&state, &token)?;
    // A player that follows a link is watching, so a live session stays up for as long as it does.
    if crate::watch::is_session(&state, &id) {
        crate::watch::touch(&id);
    }
    playlist_with(&state, &owner, &id, &format!("{token}/"), "").await
}

pub async fn short_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((token, name)): Path<(String, String)>,
) -> ApiResult<Response> {
    let (owner, id) = shared(&state, &token)?;
    segment_file(&state, &owner, &id, &name, &headers).await
}

pub async fn shared_segment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((token, name)): Path<(String, String)>,
) -> ApiResult<Response> {
    let (owner, id) = shared(&state, &token)?;
    segment_file(&state, &owner, &id, &name, &headers).await
}

pub async fn shared_download(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    let (owner, id) = shared(&state, &token)?;
    download_file(&state, &owner, &id, &headers).await
}

// ---- thumbnails ----

pub async fn thumb(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (_, owner) = owned(&state, &user, &id)?;
    files::serve(
        &recording_dir(&state, &owner, &id).join("thumb.jpg"),
        "image/jpeg",
        "private, max-age=3600",
        &headers,
        None,
    )
    .await
}

/// Makes the thumbnail of a finished item when ffmpeg is there; called after a recording ends.
pub async fn make_thumb(state: &AppState, id: &str) {
    if !ffmpeg::available() {
        return;
    }
    let row: Option<(String, String, Option<String>)> = state
        .db
        .conn()
        .query_row(
            "SELECT user_id, kind, file_name FROM recordings WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((owner, kind, file)) = row else {
        return;
    };
    let dir = recording_dir(state, &owner, id);
    let input = match (kind.as_str(), file) {
        ("download", Some(name)) => dir.join(name),
        _ => dir.join("seg00000.ts"),
    };
    if ffmpeg::thumbnail(&input, &dir.join("thumb.jpg")).await {
        let _ = state
            .db
            .conn()
            .execute("UPDATE recordings SET thumb = 1 WHERE id = ?1", [id]);
    }
}

// ---- MP4 export and trim (need ffmpeg) ----

fn require_ffmpeg() -> ApiResult<()> {
    if ffmpeg::available() {
        Ok(())
    } else {
        Err(ApiError::bad("This server does not have ffmpeg installed."))
    }
}

/// Work in progress, so the same conversion is not started twice and one person cannot start many.
static BUSY: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

struct Busy(String);

impl Busy {
    fn take(key: String) -> Option<Busy> {
        let mut list = BUSY.lock().unwrap_or_else(|p| p.into_inner());
        if list.contains(&key) {
            return None;
        }
        list.push(key.clone());
        Some(Busy(key))
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        BUSY.lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|k| *k != self.0);
    }
}

/// Converts a recording to a single MP4 that opens anywhere.
pub async fn export(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_ffmpeg()?;
    let (value, owner) = owned(&state, &user, &id)?;
    if value["kind"] != "recording" || value["status"] != "done" {
        return Err(ApiError::bad("Only a finished recording can be exported."));
    }
    let dir = recording_dir(&state, &owner, &id);
    let output = dir.join("export.mp4");
    if !output.exists() {
        let Some(_busy) = Busy::take(format!("export:{id}")) else {
            return Err(ApiError::bad("That recording is already being converted."));
        };
        let input = dir.join("index.m3u8");
        let partial = dir.join("export.tmp.mp4");
        let (i, o) = (input.to_string_lossy(), partial.to_string_lossy());
        let copied = ffmpeg::run(
            &["-i", &i, "-c", "copy", "-bsf:a", "aac_adtstoasc", &o],
            Duration::from_secs(900),
        )
        .await
            // Audio that is not AAC cannot be copied into MP4; convert only the sound.
            || ffmpeg::run(
                &["-i", &i, "-c:v", "copy", "-c:a", "aac", &o],
                Duration::from_secs(900),
            )
            .await;
        if !copied || std::fs::rename(&partial, &output).is_err() {
            let _ = std::fs::remove_file(&partial);
            return Err(ApiError::bad("The recording could not be converted."));
        }
        if let Ok(meta) = std::fs::metadata(&output) {
            let _ = state.db.conn().execute(
                "UPDATE recordings SET bytes = bytes + ?1 WHERE id = ?2",
                params![meta.len() as i64, id],
            );
        }
    }
    Ok(Json(
        json!({ "path": format!("/api/v1/recordings/{id}/export.mp4") }),
    ))
}

pub async fn export_file(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let (value, owner) = owned(&state, &user, &id)?;
    let title = super::recordings::clean_name(value["title"].as_str().unwrap_or("recording"));
    files::serve(
        &recording_dir(&state, &owner, &id).join("export.mp4"),
        "video/mp4",
        "private, max-age=3600",
        &headers,
        Some(format!("attachment; filename=\"{title}.mp4\"")),
    )
    .await
}

#[derive(Deserialize)]
pub struct Trim {
    from_s: i64,
    to_s: i64,
}

/// Cuts a part out of a recording into a new library item; the original is left alone.
pub async fn trim(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Trim>,
) -> ApiResult<Json<Value>> {
    require_ffmpeg()?;
    let (value, owner) = owned(&state, &user, &id)?;
    if value["kind"] != "recording" || value["status"] != "done" {
        return Err(ApiError::bad("Only a finished recording can be trimmed."));
    }
    if body.from_s < 0 || body.to_s <= body.from_s {
        return Err(ApiError::bad("The end must come after the start."));
    }
    if user.storage_bytes > 0 && crate::jobs::storage_used(&state, &user.id) >= user.storage_bytes {
        return Err(ApiError::forbidden("Your cloud storage is full."));
    }
    let Some(busy) = Busy::take(format!("trim:{}", user.id)) else {
        return Err(ApiError::bad("Wait for your other cut to finish first."));
    };
    let copy = uuid::Uuid::new_v4().to_string();
    let title = format!(
        "{} (cut)",
        value["title"]
            .as_str()
            .unwrap_or("Recording")
            .chars()
            .take(100)
            .collect::<String>()
    );
    let keep = keep_for(&state, &user, None);
    state.db.conn().execute(
        "INSERT INTO recordings (id, user_id, title, channel_name, source_url, status, start_at, max_seconds, keep_hours, created_at, kind, tag, file_name)
         VALUES (?1, ?2, ?3, ?4, '', 'recording', ?5, ?6, ?7, ?5, 'download', ?8, 'cut.mp4')",
        params![copy, owner, title, value["channelName"].as_str().unwrap_or(""),
                now(), body.to_s - body.from_s, keep, value["tag"].as_str().unwrap_or("")],
    )?;

    let source = recording_dir(&state, &owner, &id).join("index.m3u8");
    let dir = recording_dir(&state, &owner, &copy);
    let _ = std::fs::create_dir_all(&dir);
    let output = dir.join("cut.mp4");
    let (state, copy_id) = (state.clone(), copy.clone());
    tokio::spawn(async move {
        let _busy = busy;
        let (i, o) = (source.to_string_lossy(), output.to_string_lossy());
        let (from, length) = (
            body.from_s.to_string(),
            (body.to_s - body.from_s).to_string(),
        );
        let ok = ffmpeg::run(
            &[
                "-ss",
                &from,
                "-i",
                &i,
                "-t",
                &length,
                "-c",
                "copy",
                "-bsf:a",
                "aac_adtstoasc",
                &o,
            ],
            Duration::from_secs(900),
        )
        .await
            || ffmpeg::run(
                &[
                    "-ss", &from, "-i", &i, "-t", &length, "-c:v", "copy", "-c:a", "aac", &o,
                ],
                Duration::from_secs(900),
            )
            .await;
        let size = std::fs::metadata(&output)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        let finished = now();
        let until = keep.map(|h| finished + h * 3600);
        let _ = if ok && size > 0 {
            state.db.conn().execute(
                "UPDATE recordings SET status = 'done', bytes = ?1, seconds = ?2, finished_at = ?3, keep_until = ?4 WHERE id = ?5",
                params![size, body.to_s - body.from_s, finished, until, copy_id],
            )
        } else {
            state.db.conn().execute(
                "UPDATE recordings SET status = 'failed', error = 'The cut could not be made.', finished_at = ?1 WHERE id = ?2",
                params![finished, copy_id],
            )
        };
        make_thumb(&state, &copy_id).await;
    });
    Ok(Json(json!({ "id": copy })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn share_tokens_do_not_repeat() {
        let a = uuid::Uuid::new_v4().simple().to_string();
        let b = uuid::Uuid::new_v4().simple().to_string();
        assert_ne!(a, b);
        assert_eq!(a.len(), 32);
    }

    #[test]
    fn short_codes_are_ten_unambiguous_characters_and_differ() {
        let a = super::short_code();
        let b = super::short_code();
        assert_eq!(a.len(), 10);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() && !"0OIl1".contains(c)));
        assert_ne!(a, b);
    }
}
