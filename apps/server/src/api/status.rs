use std::{sync::atomic::AtomicBool, time::Duration};

use axum::{extract::State, Json};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};
use vesper_recorder::{Options, Output, UrlGuard};

use crate::{
    auth::AuthUser,
    db::now,
    error::{ApiError, ApiResult},
    ffmpeg,
    jobs::free_disk,
    net::check_target,
    state::AppState,
};

/// A short summary for the app's settings screen: version, disk, what is next, what will expire
/// soon, and how long the disk will last at the recent pace.
pub async fn status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let dir = state.config.recordings_dir();
    let total = fs4::total_space(&dir).ok();
    let free = free_disk(&state);
    let conn = state.db.conn();
    let next: Option<(String, i64)> = conn
        .query_row(
            "SELECT title, start_at FROM recordings WHERE user_id = ?1 AND status = 'scheduled' AND start_at > ?2 ORDER BY start_at LIMIT 1",
            params![user.id, now()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    // Bytes added over the last week, across the whole server because the disk is shared.
    let week: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(bytes), 0) FROM recordings WHERE created_at > ?1",
            [now() - 7 * 86_400],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let per_day = week / 7;
    let days_left = match (free, per_day) {
        (Some(free), per_day) if per_day > 0 => Some(free as i64 / per_day),
        _ => None,
    };

    let expiring: Vec<Value> = {
        let mut stmt = conn.prepare(
            "SELECT id, title, keep_until FROM recordings
             WHERE user_id = ?1 AND keep_until IS NOT NULL AND keep_until > ?2 AND keep_until <= ?3
               AND status = 'done' ORDER BY keep_until LIMIT 20",
        )?;
        let rows = stmt
            .query_map(params![user.id, now(), now() + 86_400], |r| {
                Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "keepUntil": r.get::<_, i64>(2)? }))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let broken: Vec<Value> = {
        let mut stmt = conn.prepare(
            "SELECT name, url, detail, checked_at FROM channel_health
             WHERE ok = 0 AND url IN (SELECT source_url FROM schedules WHERE user_id = ?1
                                      UNION SELECT source_url FROM series_rules WHERE user_id = ?1)
             LIMIT 20",
        )?;
        let rows = stmt
            .query_map([&user.id], |r| {
                Ok(
                    json!({ "name": r.get::<_, String>(0)?, "detail": r.get::<_, String>(2)?,
                           "checkedAt": r.get::<_, i64>(3)? }),
                )
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    drop(conn);

    Ok(Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "mode": state.config.mode.as_str(),
        "diskFree": free,
        "diskTotal": total,
        "recording": count_of(&state, &user.id, "recording"),
        "scheduled": count_of(&state, &user.id, "scheduled"),
        "failed": count_of(&state, &user.id, "failed"),
        "next": next.map(|(title, at)| json!({ "title": title, "startAt": at })),
        "ffmpeg": ffmpeg::available(),
        "perDayBytes": per_day,
        "daysLeft": days_left,
        "expiring": expiring,
        "brokenChannels": broken,
        "updateAvailable": Some(state.db.setting("update_available", "")).filter(|v| !v.is_empty()),
        "defaultKeepHours": state.db.setting("default_keep_hours", crate::api::DEFAULT_KEEP_HOURS).parse::<i64>().ok(),
    })))
}

fn count_of(state: &AppState, user_id: &str, status: &str) -> i64 {
    state
        .db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM recordings WHERE user_id = ?1 AND status = ?2",
            params![user_id, status],
            |r| r.get(0),
        )
        .unwrap_or(0)
}

/// What takes the room: by folder, by schedule, and the biggest single items.
pub async fn storage(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut folders = conn.prepare(
        "SELECT CASE WHEN tag = '' THEN '(no folder)' ELSE tag END, COALESCE(SUM(bytes), 0), COUNT(*)
         FROM recordings WHERE user_id = ?1 GROUP BY 1 ORDER BY 2 DESC LIMIT 20",
    )?;
    let folders = folders
        .query_map([&user.id], |r| {
            Ok(json!({ "name": r.get::<_, String>(0)?, "bytes": r.get::<_, i64>(1)?, "count": r.get::<_, i64>(2)? }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut schedules = conn.prepare(
        "SELECT COALESCE(MAX(s.title), MAX(sr.title), MAX(r.title)), COALESCE(SUM(r.bytes), 0), COUNT(*)
         FROM recordings r
         LEFT JOIN schedules s ON s.id = r.schedule_id
         LEFT JOIN series_rules sr ON sr.id = r.series_rule_id
         WHERE r.user_id = ?1
         GROUP BY COALESCE(r.schedule_id, r.series_rule_id, r.id) ORDER BY 2 DESC LIMIT 10",
    )?;
    let schedules = schedules
        .query_map([&user.id], |r| {
            Ok(json!({ "name": r.get::<_, String>(0)?, "bytes": r.get::<_, i64>(1)?, "count": r.get::<_, i64>(2)? }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut biggest = conn.prepare(
        "SELECT id, title, bytes FROM recordings WHERE user_id = ?1 ORDER BY bytes DESC LIMIT 10",
    )?;
    let biggest = biggest
        .query_map([&user.id], |r| {
            Ok(json!({ "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "bytes": r.get::<_, i64>(2)? }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(
        json!({ "folders": folders, "sources": schedules, "biggest": biggest }),
    ))
}

#[derive(Deserialize)]
pub struct Probe {
    url: String,
    /// Record this many seconds (3 to 30) as a throwaway sample and report the size and bitrate.
    #[serde(default)]
    seconds: Option<i64>,
}

/// Opens a stream for a moment to see whether it answers, before anything is scheduled. With
/// `seconds` it records a short sample and throws it away.
pub async fn test_channel(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Json(body): Json<Probe>,
) -> ApiResult<Json<Value>> {
    check_target(&state, &body.url).await?;
    if let Some(seconds) = body.seconds.filter(|s| (3..=30).contains(s)) {
        return sample(&state, body.url, seconds as u64).await;
    }
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

/// Records `seconds` of the stream into a temporary folder and reports what came in.
async fn sample(state: &AppState, url: String, seconds: u64) -> ApiResult<Json<Value>> {
    static SAMPLES: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);
    let Ok(_slot) = SAMPLES.try_acquire() else {
        return Err(ApiError::bad(
            "Other tests are running; try again in a moment.",
        ));
    };
    let dir = state
        .config
        .data_dir
        .join("tmp")
        .join(uuid::Uuid::new_v4().to_string());
    let guard = (!state.allow_private()).then(|| UrlGuard::new(crate::net::resolves_public));
    let folder = dir.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let mut options = Options::new(url, seconds, Output::Segments(folder.clone()));
        options.public_only = guard.is_some();
        options.guard = guard;
        let stop = AtomicBool::new(false);
        let result = vesper_recorder::record(&options, &stop, |_| {});
        let _ = std::fs::remove_dir_all(&folder);
        result
    })
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;
    // The parent folder is only removed when empty.
    let _ = std::fs::remove_dir(dir.parent().unwrap_or(&dir));
    Ok(Json(match outcome {
        Ok(summary) => json!({
            "ok": summary.bytes > 0,
            "bytes": summary.bytes,
            "kbps": summary.bytes * 8 / 1000 / seconds.max(1),
            "warning": summary.warning,
        }),
        Err(error) => json!({ "ok": false, "bytes": 0, "error": error.to_string() }),
    }))
}
