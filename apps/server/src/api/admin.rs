use axum::{
    extract::{Path, Query, State},
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Map, Value};

use super::SETTING_DEFAULTS;
use crate::{
    auth::{check_new_password, check_username, hash_password, random_token, AdminUser},
    db::{now, GB},
    error::{ApiError, ApiResult},
    jobs::remove_files,
    state::AppState,
};

pub async fn stats(State(state): State<AppState>, _admin: AdminUser) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
    let running = state.jobs.lock().unwrap_or_else(|p| p.into_inner()).len();
    Ok(Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "mode": state.config.mode.as_str(),
        "users": count("SELECT COUNT(*) FROM users WHERE id != 'local'"),
        "suspended": count("SELECT COUNT(*) FROM users WHERE status = 'suspended'"),
        "sessions": count("SELECT COUNT(*) FROM sessions WHERE agent <> 'media' AND expires_at > strftime('%s','now')"),
        "recordings": {
            "total": count("SELECT COUNT(*) FROM recordings"),
            "recording": running,
            "scheduled": count("SELECT COUNT(*) FROM recordings WHERE status = 'scheduled'"),
            "done": count("SELECT COUNT(*) FROM recordings WHERE status = 'done'"),
            "failed": count("SELECT COUNT(*) FROM recordings WHERE status = 'failed'"),
        },
        "storageBytes": count("SELECT COALESCE(SUM(bytes), 0) FROM recordings"),
        "invites": count("SELECT COUNT(*) FROM invites WHERE uses_left > 0"),
    })))
}

// ---- users -------------------------------------------------------------------------------

pub async fn users(State(state): State<AppState>, _admin: AdminUser) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, u.role, u.status, u.max_concurrent, u.max_hours, u.storage_bytes, u.keep_hours,
                u.note, u.created_at, u.last_login,
                COALESCE((SELECT SUM(bytes) FROM recordings WHERE user_id = u.id), 0),
                (SELECT COUNT(*) FROM recordings WHERE user_id = u.id),
                (SELECT COUNT(*) FROM sessions WHERE agent <> 'media' AND user_id = u.id AND expires_at > ?1)
         FROM users u WHERE u.id != 'local' ORDER BY u.created_at",
    )?;
    let rows = stmt
        .query_map([now()], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?, "username": r.get::<_, String>(1)?, "role": r.get::<_, String>(2)?,
                "status": r.get::<_, String>(3)?, "maxConcurrent": r.get::<_, i64>(4)?, "maxHours": r.get::<_, i64>(5)?,
                "storageBytes": r.get::<_, i64>(6)?, "keepHours": r.get::<_, Option<i64>>(7)?, "note": r.get::<_, String>(8)?,
                "createdAt": r.get::<_, i64>(9)?, "lastLogin": r.get::<_, Option<i64>>(10)?,
                "storageUsed": r.get::<_, i64>(11)?, "recordings": r.get::<_, i64>(12)?, "sessions": r.get::<_, i64>(13)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize)]
pub struct NewUser {
    username: String,
    password: String,
    #[serde(default = "default_role")]
    role: String,
    #[serde(default)]
    max_concurrent: Option<i64>,
    #[serde(default)]
    max_hours: Option<i64>,
    #[serde(default)]
    storage_gb: Option<i64>,
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default)]
    note: String,
}

fn default_role() -> String {
    "user".into()
}

fn check_role(role: &str) -> ApiResult<()> {
    if matches!(role, "admin" | "user" | "guest") {
        Ok(())
    } else {
        Err(ApiError::bad("Role must be admin, user or guest."))
    }
}

pub async fn create_user(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Json(body): Json<NewUser>,
) -> ApiResult<Json<Value>> {
    check_username(&body.username)?;
    check_new_password(&body.password)?;
    check_role(&body.role)?;
    let num =
        |key: &str, fallback: i64| state.db.setting(key, "").parse::<i64>().unwrap_or(fallback);
    let id = uuid::Uuid::new_v4().to_string();
    // Work out every value before taking the database lock, which is not re-entrant.
    let (concurrent, hours, storage_gb) = (
        body.max_concurrent
            .unwrap_or_else(|| num("default_max_concurrent", 1))
            .max(0),
        body.max_hours
            .unwrap_or_else(|| num("default_max_hours", 4))
            .max(0),
        body.storage_gb
            .unwrap_or_else(|| num("default_storage_gb", 5))
            .max(0),
    );
    let hash = hash_password(&body.password)?;
    state.db.conn().execute(
        "INSERT INTO users (id, username, pass_hash, role, max_concurrent, max_hours, storage_bytes, keep_hours, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            body.username.trim(),
            hash,
            body.role,
            concurrent,
            hours,
            storage_gb.saturating_mul(GB),
            body.keep_hours.filter(|h| *h > 0),
            body.note,
            now()
        ],
    )?;
    state
        .db
        .audit(&admin.username, "user.create", &body.username);
    Ok(Json(json!({ "id": id })))
}

#[derive(Deserialize)]
pub struct UserPatch {
    role: Option<String>,
    status: Option<String>,
    max_concurrent: Option<i64>,
    max_hours: Option<i64>,
    storage_gb: Option<i64>,
    /// 0 clears the default retention.
    keep_hours: Option<i64>,
    note: Option<String>,
    password: Option<String>,
}

fn active_admins(state: &AppState) -> i64 {
    state
        .db
        .conn()
        .query_row("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active' AND id != 'local'", [], |r| r.get(0))
        .unwrap_or(0)
}

pub async fn update_user(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
    Json(patch): Json<UserPatch>,
) -> ApiResult<Json<Value>> {
    let target_role: String =
        state
            .db
            .conn()
            .query_row("SELECT role FROM users WHERE id = ?1", [&id], |r| r.get(0))?;
    if let Some(role) = &patch.role {
        check_role(role)?;
    }
    if let Some(status) = &patch.status {
        if !matches!(status.as_str(), "active" | "suspended") {
            return Err(ApiError::bad("Status must be active or suspended."));
        }
    }
    let loses_admin = target_role == "admin"
        && (patch.role.as_deref().is_some_and(|r| r != "admin")
            || patch.status.as_deref() == Some("suspended"));
    if loses_admin && active_admins(&state) <= 1 {
        return Err(ApiError::bad(
            "There must be at least one active administrator.",
        ));
    }
    if id == admin.id && patch.status.as_deref() == Some("suspended") {
        return Err(ApiError::bad("You cannot suspend your own account."));
    }

    // Check and hash the new password first: a bad one must not leave the other changes half applied,
    // and the slow hash must not run while the database lock is held.
    let new_hash = match &patch.password {
        Some(v) => {
            check_new_password(v)?;
            Some(hash_password(v)?)
        }
        None => None,
    };

    let conn = state.db.conn();
    if let Some(v) = &patch.role {
        conn.execute("UPDATE users SET role = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(v) = &patch.status {
        conn.execute("UPDATE users SET status = ?1 WHERE id = ?2", params![v, id])?;
        if v == "suspended" {
            conn.execute("DELETE FROM sessions WHERE user_id = ?1", [&id])?;
            // Signing them out is not enough: whatever they are recording must stop too.
            let mut live = conn
                .prepare("SELECT id FROM recordings WHERE user_id = ?1 AND status = 'recording'")?;
            let ids: Vec<String> = live
                .query_map([&id], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            for recording in ids {
                crate::jobs::stop(&state, &recording);
            }
        }
    }
    if let Some(v) = patch.max_concurrent {
        conn.execute(
            "UPDATE users SET max_concurrent = ?1 WHERE id = ?2",
            params![v.max(0), id],
        )?;
    }
    if let Some(v) = patch.max_hours {
        conn.execute(
            "UPDATE users SET max_hours = ?1 WHERE id = ?2",
            params![v.max(0), id],
        )?;
    }
    if let Some(v) = patch.storage_gb {
        conn.execute(
            "UPDATE users SET storage_bytes = ?1 WHERE id = ?2",
            params![v.max(0).saturating_mul(GB), id],
        )?;
    }
    if let Some(v) = patch.keep_hours {
        conn.execute(
            "UPDATE users SET keep_hours = ?1 WHERE id = ?2",
            params![Some(v).filter(|h| *h > 0), id],
        )?;
    }
    if let Some(v) = &patch.note {
        conn.execute("UPDATE users SET note = ?1 WHERE id = ?2", params![v, id])?;
    }
    if let Some(hash) = &new_hash {
        conn.execute(
            "UPDATE users SET pass_hash = ?1 WHERE id = ?2",
            params![hash, id],
        )?;
        conn.execute("DELETE FROM sessions WHERE user_id = ?1", [&id])?;
    }
    drop(conn);
    state.db.audit(&admin.username, "user.update", &id);
    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_user(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    if id == admin.id {
        return Err(ApiError::bad("You cannot delete your own account."));
    }
    let role: String =
        state
            .db
            .conn()
            .query_row("SELECT role FROM users WHERE id = ?1", [&id], |r| r.get(0))?;
    if role == "admin" && active_admins(&state) <= 1 {
        return Err(ApiError::bad(
            "There must be at least one active administrator.",
        ));
    }
    let ids: Vec<String> = {
        let conn = state.db.conn();
        let mut stmt = conn.prepare("SELECT id FROM recordings WHERE user_id = ?1")?;
        let rows = stmt
            .query_map([&id], |r| r.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        rows
    };
    for rec in ids {
        crate::jobs::stop(&state, &rec);
        remove_files(&state, &id, &rec);
    }
    state
        .db
        .conn()
        .execute("DELETE FROM users WHERE id = ?1", [&id])?;
    state.db.audit(&admin.username, "user.delete", &id);
    Ok(Json(json!({ "ok": true })))
}

pub async fn revoke_sessions(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    state
        .db
        .conn()
        .execute("DELETE FROM sessions WHERE user_id = ?1", [&id])?;
    state.db.audit(&admin.username, "user.revoke", &id);
    Ok(Json(json!({ "ok": true })))
}

// ---- invites -----------------------------------------------------------------------------

pub async fn invites(State(state): State<AppState>, _admin: AdminUser) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT code, role, uses_left, expires_at, max_concurrent, max_hours, storage_bytes, keep_hours, note, created_at
         FROM invites ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "code": r.get::<_, String>(0)?, "role": r.get::<_, String>(1)?, "usesLeft": r.get::<_, i64>(2)?,
                "expiresAt": r.get::<_, Option<i64>>(3)?, "maxConcurrent": r.get::<_, i64>(4)?, "maxHours": r.get::<_, i64>(5)?,
                "storageBytes": r.get::<_, i64>(6)?, "keepHours": r.get::<_, Option<i64>>(7)?, "note": r.get::<_, String>(8)?,
                "createdAt": r.get::<_, i64>(9)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

#[derive(Deserialize)]
pub struct NewInvite {
    #[serde(default = "default_role")]
    role: String,
    #[serde(default = "one")]
    uses: i64,
    #[serde(default)]
    expires_days: Option<i64>,
    #[serde(default)]
    max_concurrent: Option<i64>,
    #[serde(default)]
    max_hours: Option<i64>,
    #[serde(default)]
    storage_gb: Option<i64>,
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default)]
    note: String,
}

fn one() -> i64 {
    1
}

pub async fn create_invite(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Json(body): Json<NewInvite>,
) -> ApiResult<Json<Value>> {
    check_role(&body.role)?;
    let num =
        |key: &str, fallback: i64| state.db.setting(key, "").parse::<i64>().unwrap_or(fallback);
    let code: String = random_token().chars().take(12).collect();
    let (concurrent, hours, storage_gb) = (
        body.max_concurrent
            .unwrap_or_else(|| num("default_max_concurrent", 1)),
        body.max_hours
            .unwrap_or_else(|| num("default_max_hours", 4)),
        body.storage_gb
            .unwrap_or_else(|| num("default_storage_gb", 5)),
    );
    state.db.conn().execute(
        "INSERT INTO invites (code, role, uses_left, expires_at, max_concurrent, max_hours, storage_bytes, keep_hours, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            code,
            body.role,
            body.uses.clamp(1, 1000),
            body.expires_days.filter(|d| *d > 0).map(|d| now() + d * 86_400),
            concurrent,
            hours,
            storage_gb.saturating_mul(GB),
            body.keep_hours.filter(|h| *h > 0),
            body.note,
            now()
        ],
    )?;
    state.db.audit(&admin.username, "invite.create", &code);
    Ok(Json(json!({ "code": code })))
}

pub async fn delete_invite(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(code): Path<String>,
) -> ApiResult<Json<Value>> {
    state
        .db
        .conn()
        .execute("DELETE FROM invites WHERE code = ?1", [&code])?;
    state.db.audit(&admin.username, "invite.delete", &code);
    Ok(Json(json!({ "ok": true })))
}

// ---- settings, audit, recordings ---------------------------------------------------------

pub async fn settings(State(state): State<AppState>, _admin: AdminUser) -> Json<Value> {
    let mut map = Map::new();
    for (key, default) in SETTING_DEFAULTS {
        map.insert(
            (*key).to_string(),
            Value::String(state.db.setting(key, default)),
        );
    }
    Json(Value::Object(map))
}

/// The latest crash reports the server wrote itself (`data/crash/`), newest first. Nothing is sent
/// anywhere; this is only for reading them here.
pub async fn crashes(State(state): State<AppState>, _admin: AdminUser) -> Json<Value> {
    let dir = state.config.data_dir.join("crash");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .map(|entries| entries.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    files.sort();
    files.reverse();
    let reports: Vec<Value> = files
        .into_iter()
        .take(5)
        .filter_map(|path| {
            let at: i64 = path.file_stem()?.to_str()?.parse().ok()?;
            let text: String = std::fs::read_to_string(&path)
                .ok()?
                .chars()
                .take(6000)
                .collect();
            Some(json!({ "at": at, "report": text }))
        })
        .collect();
    Json(json!({ "crashes": reports }))
}

/// `HH:MM` on a 24 hour clock.
fn valid_clock(text: &str) -> bool {
    text.split_once(':').is_some_and(|(h, m)| {
        h.parse::<u32>().is_ok_and(|h| h < 24) && m.parse::<u32>().is_ok_and(|m| m < 60)
    })
}

pub async fn update_settings(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Json(body): Json<Map<String, Value>>,
) -> ApiResult<Json<Value>> {
    for (key, value) in body {
        if !SETTING_DEFAULTS.iter().any(|(k, _)| *k == key) {
            continue;
        }
        let text = match value {
            Value::String(s) => s,
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            Value::Null => String::new(),
            _ => continue,
        };
        if key == "registration" && !matches!(text.as_str(), "closed" | "invite" | "open") {
            return Err(ApiError::bad(
                "Registration must be closed, invite or open.",
            ));
        }
        let invalid = match key.as_str() {
            "epg_url" | "webhook_url" => {
                !(text.is_empty() || text.starts_with("http://") || text.starts_with("https://"))
            }
            "quiet_start" | "quiet_end" => !(text.is_empty() || valid_clock(&text)),
            "default_encoder" => crate::encode::validate(&text).is_err(),
            "delete_watched_days" | "default_keep_hours" => {
                !(text.is_empty() || text.parse::<u32>().is_ok())
            }
            _ => false,
        };
        if invalid {
            return Err(ApiError::bad(format!("That value is not valid for {key}.")));
        }
        state.db.set_setting(&key, &text)?;
    }
    state.db.audit(&admin.username, "settings.update", "");
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct Limit {
    limit: Option<i64>,
}

pub async fn audit(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<Limit>,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt =
        conn.prepare("SELECT at, actor, action, detail FROM audit ORDER BY id DESC LIMIT ?1")?;
    let rows = stmt
        .query_map([q.limit.unwrap_or(100).clamp(1, 500)], |r| {
            Ok(json!({ "at": r.get::<_, i64>(0)?, "actor": r.get::<_, String>(1)?, "action": r.get::<_, String>(2)?, "detail": r.get::<_, String>(3)? }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

pub async fn recordings(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT r.id, u.username, r.title, r.channel_name, r.status, r.seconds, r.max_seconds, r.bytes, r.start_at,
                r.keep_until, r.error, r.created_at
         FROM recordings r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 500",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?, "user": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)?,
                "channelName": r.get::<_, String>(3)?, "status": r.get::<_, String>(4)?, "seconds": r.get::<_, i64>(5)?,
                "maxSeconds": r.get::<_, i64>(6)?, "bytes": r.get::<_, i64>(7)?, "startAt": r.get::<_, i64>(8)?,
                "keepUntil": r.get::<_, Option<i64>>(9)?, "error": r.get::<_, Option<String>>(10)?, "createdAt": r.get::<_, i64>(11)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

pub async fn delete_recording(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let owner: String =
        state
            .db
            .conn()
            .query_row("SELECT user_id FROM recordings WHERE id = ?1", [&id], |r| {
                r.get(0)
            })?;
    crate::jobs::stop(&state, &id);
    remove_files(&state, &owner, &id);
    state
        .db
        .conn()
        .execute("DELETE FROM recordings WHERE id = ?1", [&id])?;
    state.db.audit(&admin.username, "recording.delete", &id);
    Ok(Json(json!({ "ok": true })))
}

pub async fn schedules(State(state): State<AppState>, _admin: AdminUser) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT s.id, u.username, s.title, s.channel_name, s.tz, s.start_time, s.duration_s, s.days_mask,
                s.start_date, s.end_date, s.enabled,
                (SELECT MIN(start_at) FROM recordings
                  WHERE schedule_id = s.id AND status = 'scheduled' AND start_at > ?1)
         FROM schedules s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 500",
    )?;
    let rows = stmt
        .query_map([crate::db::now()], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?, "user": r.get::<_, String>(1)?, "title": r.get::<_, String>(2)?,
                "channelName": r.get::<_, String>(3)?, "tz": r.get::<_, String>(4)?, "startTime": r.get::<_, String>(5)?,
                "seconds": r.get::<_, i64>(6)?, "days": r.get::<_, i64>(7)?, "startDate": r.get::<_, String>(8)?,
                "endDate": r.get::<_, Option<String>>(9)?, "enabled": r.get::<_, i64>(10)? != 0,
                "nextStart": r.get::<_, Option<i64>>(11)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(Value::Array(rows)))
}

pub async fn delete_schedule(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    conn.execute(
        "DELETE FROM recordings WHERE schedule_id = ?1 AND status = 'scheduled' AND start_at > ?2",
        rusqlite::params![id, crate::db::now()],
    )?;
    conn.execute(
        "UPDATE recordings SET schedule_id = NULL WHERE schedule_id = ?1",
        [&id],
    )?;
    conn.execute("DELETE FROM schedules WHERE id = ?1", [&id])?;
    drop(conn);
    state.db.audit(&admin.username, "schedule.delete", &id);
    Ok(Json(json!({ "ok": true })))
}
