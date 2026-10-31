use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    Json,
};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::{
        bearer, check_new_password, check_username, create_session, hash_password, token_hash,
        user_from_row, verify_password, AuthUser, User, USER_COLUMNS,
    },
    db::{now, GB},
    error::{ApiError, ApiResult},
    jobs::storage_used,
    state::AppState,
};

/// Public description of the server, so an app can tell what it is talking to.
pub async fn info(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "name": "Vesper Cloud",
        "version": env!("CARGO_PKG_VERSION"),
        "mode": state.config.mode.as_str(),
        "registration": if state.config.is_lite() { "closed".to_string() } else { state.db.setting("registration", "closed") },
        "needsSetup": !state.config.is_lite() && state.db.user_count() == 0,
        "features": ["recordings", "sync", "proxy", "retention", "schedule"],
    }))
}

fn user_json(state: &AppState, user: &User) -> Value {
    let mut value = serde_json::to_value(user).unwrap_or(Value::Null);
    value["storageUsed"] = json!(storage_used(state, &user.id));
    value
}

/// The caller's address. Behind a trusted proxy that is the last X-Forwarded-For entry, which the
/// proxy itself appended; earlier entries are whatever the client claimed.
fn client_ip(state: &AppState, headers: &HeaderMap, addr: &SocketAddr) -> String {
    if state.config.trust_proxy {
        if let Some(ip) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return ip.to_string();
        }
    }
    addr.ip().to_string()
}

/// At most 8 failed sign-ins per address per minute.
fn throttle(state: &AppState, ip: &str, failed: bool) -> ApiResult<()> {
    let mut map = state.attempts.lock().unwrap_or_else(|p| p.into_inner());
    let entry = map.entry(ip.to_string()).or_insert((0, now()));
    if now() - entry.1 > 60 {
        *entry = (0, now());
    }
    if entry.0 >= 8 {
        return Err(ApiError::TooMany);
    }
    if failed {
        entry.0 += 1;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct Credentials {
    username: String,
    password: String,
    #[serde(default)]
    invite: Option<String>,
}

fn agent(headers: &HeaderMap) -> String {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .chars()
        .take(120)
        .collect()
}

fn require_full(state: &AppState) -> ApiResult<()> {
    if state.config.is_lite() {
        return Err(ApiError::bad(
            "This is a lite server: there are no accounts to sign in to.",
        ));
    }
    Ok(())
}

pub async fn setup(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Credentials>,
) -> ApiResult<Json<Value>> {
    require_full(&state)?;
    if state.db.user_count() > 0 {
        return Err(ApiError::forbidden("This server is already set up."));
    }
    check_username(&body.username)?;
    check_new_password(&body.password)?;
    let id = uuid::Uuid::new_v4().to_string();
    // Hashing is slow; do it before taking the database lock so other requests are not stalled.
    let hash = hash_password(&body.password)?;
    // The existence check and the insert are one statement, so two racing callers cannot both win.
    let created = state.db.conn().execute(
        "INSERT INTO users (id, username, pass_hash, role, max_concurrent, max_hours, storage_bytes, created_at)
         SELECT ?1, ?2, ?3, 'admin', 0, 0, 0, ?4 WHERE NOT EXISTS (SELECT 1 FROM users)",
        params![id, body.username.trim(), hash, now()],
    )?;
    if created == 0 {
        return Err(ApiError::forbidden("This server is already set up."));
    }
    state
        .db
        .audit(&body.username, "setup", "first administrator created");
    let token = create_session(
        &state,
        &id,
        &agent(&headers),
        &client_ip(&state, &headers, &addr),
    )?;
    let user = load_user(&state, &id)?;
    Ok(Json(
        json!({ "token": token, "user": user_json(&state, &user) }),
    ))
}

fn load_user(state: &AppState, id: &str) -> ApiResult<User> {
    Ok(state.db.conn().query_row(
        &format!("SELECT {USER_COLUMNS} FROM users WHERE id = ?1"),
        [id],
        user_from_row,
    )?)
}

pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Credentials>,
) -> ApiResult<Json<Value>> {
    require_full(&state)?;
    let ip = client_ip(&state, &headers, &addr);
    throttle(&state, &ip, false)?;

    let found: Option<(String, String, String)> = state
        .db
        .conn()
        .query_row(
            "SELECT id, pass_hash, status FROM users WHERE username = ?1",
            [body.username.trim()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    // Verify even when the user does not exist so response time does not reveal valid names.
    let dummy = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let hash = found.as_ref().map(|f| f.1.as_str()).unwrap_or(dummy);
    let ok = verify_password(&body.password, hash);
    let Some((id, _, status)) = found.filter(|_| ok) else {
        throttle(&state, &ip, true)?;
        return Err(ApiError::Unauthorized);
    };
    if status != "active" {
        return Err(ApiError::forbidden("This account is suspended."));
    }
    let token = create_session(&state, &id, &agent(&headers), &ip)?;
    state.db.audit(&body.username, "login", &ip);
    let user = load_user(&state, &id)?;
    Ok(Json(
        json!({ "token": token, "user": user_json(&state, &user) }),
    ))
}

pub async fn register(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Credentials>,
) -> ApiResult<Json<Value>> {
    require_full(&state)?;
    let ip = client_ip(&state, &headers, &addr);
    throttle(&state, &ip, true)?;
    check_username(&body.username)?;
    check_new_password(&body.password)?;

    let mode = state.db.setting("registration", "closed");
    let num =
        |key: &str, fallback: i64| state.db.setting(key, "").parse::<i64>().unwrap_or(fallback);
    let mut role = "user".to_string();
    let mut max_concurrent = num("default_max_concurrent", 1);
    let mut max_hours = num("default_max_hours", 4);
    let mut storage = num("default_storage_gb", 5).saturating_mul(GB);
    let mut keep = state
        .db
        .setting("default_keep_hours", "")
        .parse::<i64>()
        .ok();
    let mut note = String::new();

    let id = uuid::Uuid::new_v4().to_string();
    let hash = hash_password(&body.password)?;
    {
        // One transaction: a taken username must not spend an invite use, and two people racing
        // for the last use must not both get in.
        let conn = state.db.conn();
        let tx = conn.unchecked_transaction()?;
        let mut used_invite: Option<String> = None;
        match (
            mode.as_str(),
            body.invite
                .as_deref()
                .map(str::trim)
                .filter(|c| !c.is_empty()),
        ) {
            (_, Some(code)) => {
                let invite: Option<(String, i64, i64, i64, Option<i64>, String)> = tx
                    .query_row(
                        "SELECT role, max_concurrent, max_hours, storage_bytes, keep_hours, note FROM invites
                         WHERE code = ?1 AND uses_left > 0 AND (expires_at IS NULL OR expires_at > ?2)",
                        params![code, now()],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
                    )
                    .optional()?;
                let Some(invite) = invite else {
                    return Err(ApiError::forbidden("That invite code is not valid."));
                };
                (role, max_concurrent, max_hours, storage, keep, note) = invite;
                used_invite = Some(code.to_string());
            }
            ("open", None) => {}
            _ => {
                return Err(ApiError::forbidden(
                    "Registration needs an invite code on this server.",
                ))
            }
        }
        tx.execute(
            "INSERT INTO users (id, username, pass_hash, role, max_concurrent, max_hours, storage_bytes, keep_hours, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, body.username.trim(), hash, role, max_concurrent, max_hours, storage, keep, note, now()],
        )?;
        if let Some(code) = used_invite {
            tx.execute(
                "UPDATE invites SET uses_left = uses_left - 1 WHERE code = ?1",
                [code],
            )?;
        }
        tx.commit()?;
    }
    state.db.audit(&body.username, "register", &ip);
    let token = create_session(&state, &id, &agent(&headers), &ip)?;
    let user = load_user(&state, &id)?;
    Ok(Json(
        json!({ "token": token, "user": user_json(&state, &user) }),
    ))
}

pub async fn logout(
    State(state): State<AppState>,
    parts: axum::http::request::Parts,
) -> ApiResult<Json<Value>> {
    if let Some(token) = bearer(&parts) {
        state.db.conn().execute(
            "DELETE FROM sessions WHERE token_hash = ?1",
            [token_hash(&token)],
        )?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn me(State(state): State<AppState>, AuthUser(user): AuthUser) -> Json<Value> {
    Json(user_json(&state, &user))
}

#[derive(Deserialize)]
pub struct PasswordChange {
    current: String,
    new: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    parts: axum::http::request::Parts,
    Json(body): Json<PasswordChange>,
) -> ApiResult<Json<Value>> {
    require_full(&state)?;
    check_new_password(&body.new)?;
    let hash: String = state.db.conn().query_row(
        "SELECT pass_hash FROM users WHERE id = ?1",
        [&user.id],
        |r| r.get(0),
    )?;
    if !verify_password(&body.current, &hash) {
        return Err(ApiError::forbidden("The current password is not right."));
    }
    let new_hash = hash_password(&body.new)?;
    state.db.conn().execute(
        "UPDATE users SET pass_hash = ?1 WHERE id = ?2",
        params![new_hash, user.id],
    )?;
    // Everywhere else the old password was used must sign in again; this device stays signed in.
    let keep = bearer(&parts).map(|t| token_hash(&t)).unwrap_or_default();
    state.db.conn().execute(
        "DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2",
        params![user.id, keep],
    )?;
    state.db.audit(&user.username, "password.change", "");
    Ok(Json(json!({ "ok": true })))
}
