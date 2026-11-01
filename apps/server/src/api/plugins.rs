//! Admin control of server plugins, and the `/x/<plugin>/...` routes plugins can serve themselves.

use std::collections::HashMap;

use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::{
    auth::{AdminUser, AuthUser},
    error::{ApiError, ApiResult},
    plugins,
    state::AppState,
};

/// Every plugin folder with whether it is on and how it is set up, plus the folders that were skipped.
pub async fn list(State(state): State<AppState>, AdminUser(_): AdminUser) -> Json<Value> {
    let (found, broken) = plugins::discover(&state);
    let rows: Vec<Value> = found
        .iter()
        .map(|p| {
            json!({
                "id": p.manifest.id,
                "name": p.manifest.name,
                "version": p.manifest.version,
                "description": p.manifest.description,
                "author": p.manifest.author,
                "hooks": p.manifest.hooks,
                "command": p.manifest.command,
                "enabled": plugins::enabled(&state, &p.manifest.id),
                "config": plugins::config(&state, &p.manifest.id),
            })
        })
        .collect();
    let skipped: Vec<Value> = broken
        .into_iter()
        .map(|(folder, why)| json!({ "folder": folder, "error": why }))
        .collect();
    Json(json!({
        "dir": plugins::dir(&state).to_string_lossy(),
        "hooks": plugins::HOOKS,
        "plugins": rows,
        "skipped": skipped,
    }))
}

#[derive(Deserialize)]
pub struct Update {
    enabled: Option<bool>,
    config: Option<Map<String, Value>>,
}

pub async fn update(
    State(state): State<AppState>,
    AdminUser(admin): AdminUser,
    Path(id): Path<String>,
    Json(body): Json<Update>,
) -> ApiResult<Json<Value>> {
    plugins::find(&state, &id).ok_or_else(|| ApiError::not_found("No such plugin."))?;
    if let Some(on) = body.enabled {
        state.db.set_setting(
            &format!("plugin.{id}.enabled"),
            if on { "true" } else { "false" },
        )?;
        state.db.audit(
            &admin.username,
            if on {
                "plugin.enable"
            } else {
                "plugin.disable"
            },
            &id,
        );
    }
    if let Some(config) = body.config {
        let text = Value::Object(config).to_string();
        if text.len() > 32 * 1024 {
            return Err(ApiError::bad("That configuration is too large."));
        }
        state
            .db
            .set_setting(&format!("plugin.{id}.config"), &text)?;
        state.db.audit(&admin.username, "plugin.config", &id);
    }
    Ok(Json(json!({ "ok": true })))
}

/// Runs the plugin once with the `test` hook so its author can see it starts and what it prints.
pub async fn test(
    State(state): State<AppState>,
    AdminUser(_): AdminUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    let plugin =
        plugins::find(&state, &id).ok_or_else(|| ApiError::not_found("No such plugin."))?;
    Ok(Json(
        match plugins::run(&state, &plugin, "test", json!({})).await {
            Ok(output) => {
                json!({ "ok": true, "output": output.chars().take(2000).collect::<String>() })
            }
            Err(why) => json!({ "ok": false, "error": why }),
        },
    ))
}

/// `/api/v1/x/<plugin>/<anything>`: handed to the plugin's `http` hook. The plugin answers with
/// either `{ "status": 200, "body": ... }` or any JSON value, which becomes the body of a 200.
pub async fn serve(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    method: Method,
    Path((id, rest)): Path<(String, String)>,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> ApiResult<Response> {
    if !plugins::enabled(&state, &id) {
        return Err(ApiError::not_found("No such plugin."));
    }
    let plugin = plugins::listening(&state, "http")
        .into_iter()
        .find(|p| p.manifest.id == id)
        .ok_or_else(|| ApiError::not_found("That plugin does not serve requests."))?;
    if body.len() > 1024 * 1024 {
        return Err(ApiError::bad("That request is too large."));
    }
    let sent: Value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).map_err(|_| ApiError::bad("The body must be JSON."))?
    };
    let data = json!({
        "method": method.as_str(),
        "path": rest,
        "query": query,
        "body": sent,
        "user": { "id": user.id, "username": user.username, "role": user.role },
    });
    let text = plugins::run(&state, &plugin, "http", data)
        .await
        .map_err(|why| ApiError::Internal(format!("plugin {id}: {why}")))?;
    let answer: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let (status, body) = match &answer {
        Value::Object(map) if map.contains_key("body") || map.contains_key("status") => (
            map.get("status")
                .and_then(Value::as_u64)
                .and_then(|s| u16::try_from(s).ok())
                .unwrap_or(200),
            map.get("body").cloned().unwrap_or(Value::Null),
        ),
        other => (200, other.clone()),
    };
    let code = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
    Ok((code, Json(body)).into_response())
}
