//! The user's playlists and the channel list read from them, so an app can offer a channel picker
//! without parsing playlists itself. Providers' logins stay on the server.

use std::{sync::Arc, time::Duration};

use axum::{
    extract::{Path, Query, State},
    http::header,
    Json,
};
use reqwest::Url;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    db::now,
    error::{ApiError, ApiResult},
    net::check_target,
    state::AppState,
};

/// A playlist is read again when the cached copy is older than this.
const CACHE_SECONDS: i64 = 600;
const MAX_PLAYLIST_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct Channel {
    pub name: String,
    pub url: String,
    pub group: String,
    pub logo: String,
}

/// The value of `key="..."` inside an `#EXTINF` line.
fn attribute(line: &str, key: &str) -> Option<String> {
    let marker = format!("{key}=\"");
    let start = line.find(&marker)? + marker.len();
    let end = line[start..].find('"')? + start;
    Some(line[start..end].trim().to_string())
}

/// Reads an M3U playlist. Entries that are not http(s) streams are skipped.
pub fn parse_m3u(text: &str) -> Vec<Channel> {
    let mut channels = Vec::new();
    let mut pending: Option<&str> = None;
    for line in text.lines().map(str::trim) {
        if line.starts_with("#EXTINF") {
            pending = Some(line);
        } else if line.is_empty() || line.starts_with('#') {
            continue;
        } else if let Some(info) = pending.take() {
            if !(line.starts_with("http://") || line.starts_with("https://")) {
                continue;
            }
            // The name follows the last comma after the attributes, which may contain commas.
            let after_attrs = info.rfind('"').map_or(0, |i| i + 1);
            let name = info[after_attrs..]
                .split_once(',')
                .map(|(_, n)| n.trim().to_string())
                .filter(|n| !n.is_empty())
                .or_else(|| attribute(info, "tvg-name"))
                .unwrap_or_else(|| "Channel".into());
            channels.push(Channel {
                name,
                url: line.to_string(),
                group: attribute(info, "group-title").unwrap_or_default(),
                logo: attribute(info, "tvg-logo").unwrap_or_default(),
            });
        }
    }
    channels
}

/// The playlist address for a source: the link itself, or the one an Xtream login makes.
fn playlist_url(kind: &str, url: &str, username: &str, password: &str) -> ApiResult<Url> {
    let mut parsed = Url::parse(url).map_err(|_| ApiError::bad("That address is not valid."))?;
    if kind == "xtream" {
        parsed = parsed
            .join("get.php")
            .map_err(|_| ApiError::bad("That address is not valid."))?;
        parsed
            .query_pairs_mut()
            .append_pair("username", username)
            .append_pair("password", password)
            .append_pair("type", "m3u_plus")
            .append_pair("output", "ts");
    }
    Ok(parsed)
}

async fn download(state: &AppState, start: Url) -> ApiResult<String> {
    let mut url = check_target(state, start.as_str()).await?;
    // Follow redirects by hand so every hop is checked, not only the first address.
    for _ in 0..5 {
        let reply = state
            .http
            .get(url.clone())
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| ApiError::bad(format!("Could not reach that address: {e}")))?;
        if reply.status().is_redirection() {
            let next = reply
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|loc| url.join(loc).ok())
                .ok_or_else(|| ApiError::bad("The address redirected somewhere invalid."))?;
            check_target(state, next.as_str()).await?;
            url = next;
            continue;
        }
        if !reply.status().is_success() {
            return Err(ApiError::bad(format!(
                "The provider answered {}.",
                reply.status()
            )));
        }
        if reply
            .content_length()
            .is_some_and(|n| n as usize > MAX_PLAYLIST_BYTES)
        {
            return Err(ApiError::bad("That playlist is too large."));
        }
        let bytes = reply
            .bytes()
            .await
            .map_err(|e| ApiError::bad(format!("Could not read the playlist: {e}")))?;
        if bytes.len() > MAX_PLAYLIST_BYTES {
            return Err(ApiError::bad("That playlist is too large."));
        }
        return Ok(String::from_utf8_lossy(&bytes).into_owned());
    }
    Err(ApiError::bad("Too many redirects."))
}

/// Owner, kind, address and login of a source the user may use.
fn load_source(
    state: &AppState,
    user_id: &str,
    id: &str,
) -> ApiResult<(String, String, String, String)> {
    Ok(state.db.conn().query_row(
        "SELECT kind, url, username, password FROM sources WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?)
}

async fn channels_of(state: &AppState, user_id: &str, id: &str) -> ApiResult<Arc<Vec<Channel>>> {
    let owned: bool = state
        .db
        .conn()
        .query_row(
            "SELECT 1 FROM sources WHERE id = ?1 AND user_id = ?2",
            params![id, user_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !owned {
        return Err(ApiError::not_found("Playlist not found."));
    }
    if let Some((at, list)) = state
        .playlists
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(id)
    {
        if now() - at < CACHE_SECONDS {
            return Ok(list.clone());
        }
    }
    let (kind, url, username, password) = load_source(state, user_id, id)?;
    let text = download(state, playlist_url(&kind, &url, &username, &password)?).await?;
    let list = Arc::new(parse_m3u(&text));
    if list.is_empty() {
        return Err(ApiError::bad("That playlist has no channels."));
    }
    state
        .playlists
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(id.to_string(), (now(), list.clone()));
    Ok(list)
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, url, username FROM sources WHERE user_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt
        .query_map([&user.id], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "name": r.get::<_, String>(1)?,
                "kind": r.get::<_, String>(2)?,
                "url": r.get::<_, String>(3)?,
                "username": r.get::<_, String>(4)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "sources": rows })))
}

#[derive(Deserialize)]
pub struct NewSource {
    name: String,
    /// `m3u` or `xtream`.
    kind: String,
    url: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NewSource>,
) -> ApiResult<Json<Value>> {
    if body.kind != "m3u" && body.kind != "xtream" {
        return Err(ApiError::bad("Use m3u or xtream."));
    }
    let name: String = body.name.trim().chars().take(80).collect();
    if name.is_empty() {
        return Err(ApiError::bad("Give the source a name."));
    }
    if body.kind == "xtream" && (body.username.is_empty() || body.password.is_empty()) {
        return Err(ApiError::bad("Enter the username and password."));
    }
    // Fail now, with a clear message, instead of when the first schedule is made.
    let id = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO sources (id, user_id, name, kind, url, username, password, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            user.id,
            name,
            body.kind,
            body.url.trim(),
            body.username,
            body.password,
            now()
        ],
    )?;
    if let Err(error) = channels_of(&state, &user.id, &id).await {
        let _ = state
            .db
            .conn()
            .execute("DELETE FROM sources WHERE id = ?1", [&id]);
        return Err(error);
    }
    state.db.audit(&user.username, "source.create", &name);
    Ok(Json(json!({ "id": id })))
}

pub async fn remove(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    state.db.conn().execute(
        "DELETE FROM sources WHERE id = ?1 AND user_id = ?2",
        params![id, user.id],
    )?;
    state
        .playlists
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&id);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct Search {
    source: String,
    #[serde(default)]
    q: String,
    #[serde(default)]
    group: String,
    #[serde(default)]
    offset: usize,
    #[serde(default = "page")]
    limit: usize,
}

fn page() -> usize {
    100
}

pub async fn channels(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(search): Query<Search>,
) -> ApiResult<Json<Value>> {
    let all = channels_of(&state, &user.id, &search.source).await?;
    let needle = search.q.trim().to_lowercase();
    let matching: Vec<&Channel> = all
        .iter()
        .filter(|c| search.group.is_empty() || c.group == search.group)
        .filter(|c| needle.is_empty() || c.name.to_lowercase().contains(&needle))
        .collect();
    let mut groups: Vec<&str> = all
        .iter()
        .map(|c| c.group.as_str())
        .filter(|g| !g.is_empty())
        .collect();
    groups.sort_unstable();
    groups.dedup();
    let items: Vec<Value> = matching
        .iter()
        .skip(search.offset)
        .take(search.limit.clamp(1, 500))
        .map(|c| json!({ "name": c.name, "url": c.url, "group": c.group, "logo": c.logo }))
        .collect();
    Ok(Json(json!({
        "channels": items,
        "total": matching.len(),
        "groups": groups,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_names_groups_and_logos() {
        let text = "#EXTM3U\n\
            #EXTINF:-1 tvg-id=\"a.fr\" tvg-logo=\"http://l/a.png\" group-title=\"News, World\",Alpha News\n\
            http://example.com/a.m3u8\n\
            #EXTINF:-1,Beta\n\
            https://example.com/b.ts\n\
            #EXTINF:-1,Skipped\n\
            rtmp://example.com/c\n";
        let channels = parse_m3u(text);
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].name, "Alpha News");
        assert_eq!(channels[0].group, "News, World");
        assert_eq!(channels[0].logo, "http://l/a.png");
        assert_eq!(channels[1].name, "Beta");
        assert_eq!(channels[1].group, "");
    }

    #[test]
    fn an_xtream_login_becomes_a_playlist_address() {
        let url = playlist_url("xtream", "http://host:8080", "me", "p&ss").unwrap();
        assert_eq!(url.path(), "/get.php");
        let query = url.query().unwrap();
        assert!(query.contains("username=me"));
        assert!(query.contains("password=p%26ss"));
        assert!(query.contains("type=m3u_plus"));
    }
}
