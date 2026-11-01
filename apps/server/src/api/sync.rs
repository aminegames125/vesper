//! Keeps a person's small bits of state (favourites, preferences, resume points of things Kodi
//! plays itself) the same on every device. Each key is last-write-wins by its own timestamp.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::{AdminUser, AuthUser},
    db::now,
    encode,
    error::{ApiError, ApiResult},
    ffmpeg,
    state::AppState,
    ytdlp,
};

const MAX_KEYS: i64 = 5000;
const MAX_BATCH: usize = 500;
const MAX_VALUE: usize = 64 * 1024;

/// What this server can do, so a client only offers what will work.
pub async fn capabilities(State(state): State<AppState>, AuthUser(_): AuthUser) -> Json<Value> {
    Json(json!({
        "ffmpeg": ffmpeg::available(),
        "ytdlp": { "available": ytdlp::available(), "version": ytdlp::version() },
        "encoders": encode::listing(),
        "defaultEncoder": state.db.setting("default_encoder", encode::DEFAULT),
        "qualities": ["best", "2160", "1080", "720", "480", "audio"],
        "sync": true,
    }))
}

#[derive(Deserialize)]
pub struct Since {
    #[serde(default)]
    since: i64,
}

/// Everything that changed after `since` (epoch seconds; 0 for all of it).
pub async fn pull(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<Since>,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT key, value, updated_at FROM sync WHERE user_id = ?1 AND updated_at > ?2 ORDER BY updated_at",
    )?;
    let items = stmt
        .query_map(params![user.id, q.since], |r| {
            let raw: String = r.get(1)?;
            Ok(json!({
                "key": r.get::<_, String>(0)?,
                "value": serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
                "updatedAt": r.get::<_, i64>(2)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "items": items, "now": now() })))
}

#[derive(Deserialize)]
pub struct Item {
    key: String,
    value: Value,
    #[serde(default, rename = "updatedAt")]
    updated_at: Option<i64>,
}

#[derive(Deserialize)]
pub struct Push {
    items: Vec<Item>,
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 80
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '.' | '_' | '-' | '/'))
}

/// Stores items that are newer than what the server has. `null` marks a key as removed.
pub async fn push(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<Push>,
) -> ApiResult<Json<Value>> {
    if body.items.len() > MAX_BATCH {
        return Err(ApiError::bad("Too many items in one go."));
    }
    let conn = state.db.conn();
    let stamp = now();
    let (mut applied, mut skipped) = (0, 0);
    for item in &body.items {
        if !valid_key(&item.key) {
            return Err(ApiError::bad(format!(
                "\"{}\" is not a valid key.",
                item.key
            )));
        }
        let text = item.value.to_string();
        if text.len() > MAX_VALUE {
            return Err(ApiError::bad("That value is too large to sync."));
        }
        // A clock far in the future would win every later write, so clamp it.
        let at = item.updated_at.unwrap_or(stamp).min(stamp + 300);
        let known: Option<i64> = conn
            .query_row(
                "SELECT updated_at FROM sync WHERE user_id = ?1 AND key = ?2",
                params![user.id, item.key],
                |r| r.get(0),
            )
            .ok();
        if known.is_some_and(|k| k > at) {
            skipped += 1;
            continue;
        }
        if known.is_none() {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sync WHERE user_id = ?1",
                    [&user.id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if count >= MAX_KEYS {
                return Err(ApiError::bad("Too much is synced already."));
            }
        }
        conn.execute(
            "INSERT INTO sync (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![user.id, item.key, text, at.max(1)],
        )?;
        applied += 1;
    }
    Ok(Json(
        json!({ "applied": applied, "skipped": skipped, "now": stamp }),
    ))
}

pub async fn forget(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    // A tombstone, so other devices learn it is gone.
    state.db.conn().execute(
        "UPDATE sync SET value = 'null', updated_at = ?3 WHERE user_id = ?1 AND key = ?2",
        params![user.id, key, now()],
    )?;
    Ok(Json(json!({ "ok": true })))
}

/// For the admin panel: how much each account has synced and when it last did.
pub async fn overview(
    State(state): State<AppState>,
    AdminUser(_): AdminUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT u.username, COUNT(s.key), COALESCE(SUM(LENGTH(s.value)), 0), MAX(s.updated_at)
         FROM users u LEFT JOIN sync s ON s.user_id = u.id
         GROUP BY u.id ORDER BY MAX(s.updated_at) DESC, u.username",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "user": r.get::<_, String>(0)?,
                "keys": r.get::<_, i64>(1)?,
                "bytes": r.get::<_, i64>(2)?,
                "lastSync": r.get::<_, Option<i64>>(3)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "users": rows })))
}

#[cfg(test)]
mod tests {
    use super::valid_key;

    #[test]
    fn keys_are_short_and_plain() {
        assert!(valid_key("favorites"));
        assert!(valid_key("kodi:resume:abc-1"));
        assert!(!valid_key(""));
        assert!(!valid_key("has space"));
        assert!(!valid_key(&"x".repeat(81)));
    }
}
