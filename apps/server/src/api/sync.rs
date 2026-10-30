use axum::{
    extract::{Path, State},
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Map, Value};

use crate::{
    auth::AuthUser,
    db::now,
    error::{ApiError, ApiResult},
    state::AppState,
};

/// Each key is a small JSON document (favourites, watch history, sources...) that every device shares.
const MAX_BYTES: usize = 2 * 1024 * 1024;

fn check_key(key: &str) -> ApiResult<()> {
    let ok = !key.is_empty()
        && key.len() <= 40
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(ApiError::bad(
            "Sync keys are letters, digits, dashes and underscores.",
        ))
    }
}

pub async fn all(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare("SELECT key, value, updated_at FROM sync WHERE user_id = ?1")?;
    let mut map = Map::new();
    for row in stmt.query_map([&user.id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
        ))
    })? {
        let (key, value, at) = row?;
        map.insert(key, json!({ "value": serde_json::from_str::<Value>(&value).unwrap_or(Value::Null), "updatedAt": at }));
    }
    Ok(Json(Value::Object(map)))
}

pub async fn get_one(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    check_key(&key)?;
    let found: Option<(String, i64)> = state
        .db
        .conn()
        .query_row(
            "SELECT value, updated_at FROM sync WHERE user_id = ?1 AND key = ?2",
            params![user.id, key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(Json(match found {
        Some((value, at)) => {
            json!({ "value": serde_json::from_str::<Value>(&value).unwrap_or(Value::Null), "updatedAt": at })
        }
        None => json!({ "value": null, "updatedAt": 0 }),
    }))
}

pub async fn put_one(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(key): Path<String>,
    Json(value): Json<Value>,
) -> ApiResult<Json<Value>> {
    check_key(&key)?;
    let text = value.to_string();
    if text.len() > MAX_BYTES {
        return Err(ApiError::bad("That is too much data for one key."));
    }
    let at = now();
    state.db.conn().execute(
        "INSERT INTO sync (user_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![user.id, key, text, at],
    )?;
    Ok(Json(json!({ "updatedAt": at })))
}
