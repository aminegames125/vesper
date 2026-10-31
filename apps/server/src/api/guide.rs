//! The TV guide, series rules and the calendar of what is going to be recorded.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::AuthUser,
    db::now,
    epg,
    error::{ApiError, ApiResult},
    net::check_target,
    state::AppState,
};

#[derive(Deserialize, Default)]
pub struct GuideQuery {
    /// The playlist's channel id (`tvg-id`), if it has one.
    #[serde(default)]
    epg_id: String,
    /// The channel name, used when the id is not known to the guide.
    #[serde(default)]
    name: String,
    #[serde(default)]
    from: Option<i64>,
    #[serde(default)]
    to: Option<i64>,
}

/// What is on one channel between two times (default: from an hour ago to tomorrow).
pub async fn programmes(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Query(query): Query<GuideQuery>,
) -> ApiResult<Json<Value>> {
    let from = query.from.unwrap_or_else(|| now() - 3600);
    let to = query
        .to
        .unwrap_or_else(|| now() + 24 * 3600)
        .min(from + 7 * 86_400);
    let conn = state.db.conn();
    let Some(channel) = epg::resolve_channel(&conn, &query.epg_id, &query.name) else {
        return Ok(Json(json!({ "channelId": null, "programmes": [] })));
    };
    let mut stmt = conn.prepare(
        "SELECT start_at, stop_at, title, description FROM epg_programmes
         WHERE channel_id = ?1 AND stop_at > ?2 AND start_at < ?3 ORDER BY start_at",
    )?;
    let rows = stmt
        .query_map(params![channel, from, to], |r| {
            Ok(json!({
                "startAt": r.get::<_, i64>(0)?, "stopAt": r.get::<_, i64>(1)?,
                "title": r.get::<_, String>(2)?, "description": r.get::<_, String>(3)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "channelId": channel, "programmes": rows })))
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
    #[serde(default)]
    limit: Option<i64>,
}

/// Upcoming programmes whose title contains the text, across every channel of the guide.
pub async fn search(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<Value>> {
    let needle = query.q.trim();
    if needle.chars().count() < 2 {
        return Ok(Json(json!({ "programmes": [] })));
    }
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT p.channel_id, COALESCE(c.name, p.channel_id), p.start_at, p.stop_at, p.title, p.description
         FROM epg_programmes p LEFT JOIN epg_channels c ON c.id = p.channel_id
         WHERE p.stop_at > ?1 AND p.title LIKE '%' || ?2 || '%'
         ORDER BY p.start_at LIMIT ?3",
    )?;
    let rows = stmt
        .query_map(
            params![now(), needle, query.limit.unwrap_or(50).clamp(1, 200)],
            |r| {
                Ok(json!({
                    "channelId": r.get::<_, String>(0)?, "channelName": r.get::<_, String>(1)?,
                    "startAt": r.get::<_, i64>(2)?, "stopAt": r.get::<_, i64>(3)?,
                    "title": r.get::<_, String>(4)?, "description": r.get::<_, String>(5)?,
                }))
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "programmes": rows })))
}

/// How much guide there is and when it was last updated.
pub async fn guide_status(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> ApiResult<Json<Value>> {
    let count = |sql: &str| -> i64 {
        state
            .db
            .conn()
            .query_row(sql, [], |r| r.get(0))
            .unwrap_or(0)
    };
    Ok(Json(json!({
        "configured": !state.db.setting("epg_url", "").trim().is_empty(),
        "channels": count("SELECT COUNT(*) FROM epg_channels"),
        "programmes": count("SELECT COUNT(*) FROM epg_programmes"),
        "updatedAt": state.db.setting("epg_updated", "").parse::<i64>().ok(),
    })))
}

/// Downloads the guide again now.
pub async fn refresh(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> ApiResult<Json<Value>> {
    let kept = epg::refresh(&state).await.map_err(ApiError::bad)?;
    epg::match_series(&state);
    Ok(Json(json!({ "programmes": kept })))
}

// ---- series rules ----

pub async fn rules(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let conn = state.db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, title, epg_channel_id, channel_name, source_url, backup_url, pad_before_s, pad_after_s,
                keep_hours, keep_last, tag, enabled
         FROM series_rules WHERE user_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map([&user.id], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?,
                "epgChannelId": r.get::<_, String>(2)?, "channelName": r.get::<_, String>(3)?,
                "url": r.get::<_, String>(4)?, "backupUrl": r.get::<_, Option<String>>(5)?,
                "padBefore": r.get::<_, i64>(6)?, "padAfter": r.get::<_, i64>(7)?,
                "keepHours": r.get::<_, Option<i64>>(8)?, "keepLast": r.get::<_, Option<i64>>(9)?,
                "tag": r.get::<_, String>(10)?, "enabled": r.get::<_, i64>(11)? != 0,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "rules": rows })))
}

#[derive(Deserialize)]
pub struct NewRule {
    /// Programmes whose title contains this text are recorded.
    title: String,
    epg_channel_id: String,
    #[serde(default)]
    channel_name: String,
    url: String,
    #[serde(default)]
    backup_url: Option<String>,
    #[serde(default)]
    pad_before: i64,
    #[serde(default)]
    pad_after: i64,
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default)]
    keep_last: Option<i64>,
    #[serde(default)]
    tag: String,
}

pub async fn create_rule(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NewRule>,
) -> ApiResult<Json<Value>> {
    if user.role == "guest" {
        return Err(ApiError::forbidden("Guest accounts cannot record."));
    }
    let title: String = body.title.trim().chars().take(120).collect();
    if title.chars().count() < 2 {
        return Err(ApiError::bad("Enter at least two letters of the title."));
    }
    if body.epg_channel_id.trim().is_empty() {
        return Err(ApiError::bad("Pick the channel from the guide."));
    }
    if !(0..=3600).contains(&body.pad_before) || !(0..=3600).contains(&body.pad_after) {
        return Err(ApiError::bad("Padding can be up to an hour."));
    }
    check_target(&state, &body.url).await?;
    let backup = body.backup_url.as_deref().filter(|u| !u.is_empty());
    if let Some(backup) = backup {
        check_target(&state, backup).await?;
    }
    let count: i64 = state
        .db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM series_rules WHERE user_id = ?1",
            [&user.id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count >= 100 {
        return Err(ApiError::bad("That is enough series rules."));
    }
    let id = uuid::Uuid::new_v4().to_string();
    // Worked out first: the database lock is not re-entrant.
    let keep = super::recordings::keep_for(&state, &user, body.keep_hours);
    state.db.conn().execute(
        "INSERT INTO series_rules
           (id, user_id, title, epg_channel_id, channel_name, source_url, backup_url, pad_before_s,
            pad_after_s, keep_hours, keep_last, tag, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13)",
        params![
            id,
            user.id,
            title,
            body.epg_channel_id.trim(),
            body.channel_name.chars().take(120).collect::<String>(),
            body.url,
            backup,
            body.pad_before,
            body.pad_after,
            keep,
            body.keep_last.filter(|n| *n > 0),
            body.tag.trim().chars().take(40).collect::<String>(),
            now(),
        ],
    )?;
    epg::match_series(&state);
    state.db.audit(&user.username, "series.create", &title);
    Ok(Json(json!({ "id": id })))
}

#[derive(Deserialize)]
pub struct Toggle {
    enabled: bool,
}

fn owned_rule(state: &AppState, user_id: &str, id: &str) -> ApiResult<()> {
    state
        .db
        .conn()
        .query_row(
            "SELECT 1 FROM series_rules WHERE id = ?1 AND user_id = ?2",
            params![id, user_id],
            |_| Ok(()),
        )
        .map_err(|_| ApiError::not_found("Rule not found."))
}

fn drop_future(state: &AppState, id: &str) {
    let _ = state.db.conn().execute(
        "DELETE FROM recordings WHERE series_rule_id = ?1 AND status = 'scheduled' AND start_at > ?2",
        params![id, now()],
    );
}

pub async fn set_rule_enabled(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Toggle>,
) -> ApiResult<Json<Value>> {
    owned_rule(&state, &user.id, &id)?;
    state.db.conn().execute(
        "UPDATE series_rules SET enabled = ?1 WHERE id = ?2",
        params![i64::from(body.enabled), id],
    )?;
    if body.enabled {
        epg::match_series(&state);
    } else {
        drop_future(&state, &id);
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove_rule(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    owned_rule(&state, &user.id, &id)?;
    drop_future(&state, &id);
    state
        .db
        .conn()
        .execute("DELETE FROM series_rules WHERE id = ?1", [&id])?;
    // What was recorded stays, but no longer belongs to a rule.
    let _ = state.db.conn().execute(
        "UPDATE recordings SET series_rule_id = NULL WHERE series_rule_id = ?1",
        [&id],
    );
    Ok(Json(json!({ "ok": true })))
}

// ---- calendar ----

#[derive(Deserialize)]
pub struct CalendarQuery {
    #[serde(default)]
    from: Option<i64>,
    #[serde(default)]
    to: Option<i64>,
}

/// One entry of the calendar.
struct Slot {
    id: String,
    title: String,
    channel: String,
    start: i64,
    end: i64,
    status: String,
}

/// How many of `slots` run at the same moment as slot `at`, counting itself.
fn overlap(slots: &[Slot], at: usize) -> usize {
    let me = &slots[at];
    slots
        .iter()
        .filter(|o| o.start < me.end && o.end > me.start)
        .count()
}

/// What will be recorded between two times, with the entries that do not fit the account's
/// "recordings at once" limit marked as clashes.
pub async fn calendar(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(query): Query<CalendarQuery>,
) -> ApiResult<Json<Value>> {
    let from = query.from.unwrap_or_else(now);
    let to = query
        .to
        .unwrap_or(from + 7 * 86_400)
        .min(from + 31 * 86_400);
    let slots: Vec<Slot> = {
        let conn = state.db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, title, channel_name, start_at, start_at + max_seconds, status FROM recordings
             WHERE user_id = ?1 AND kind = 'recording' AND status IN ('scheduled', 'queued', 'recording')
               AND start_at < ?3 AND start_at + max_seconds > ?2
             ORDER BY start_at",
        )?;
        let rows = stmt
            .query_map(params![user.id, from, to], |r| {
                Ok(Slot {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    channel: r.get(2)?,
                    start: r.get(3)?,
                    end: r.get(4)?,
                    status: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    let limit = usize::try_from(user.max_concurrent).unwrap_or(0);
    let items: Vec<Value> = (0..slots.len())
        .map(|i| {
            let s = &slots[i];
            json!({
                "id": s.id, "title": s.title, "channelName": s.channel,
                "startAt": s.start, "endAt": s.end, "status": s.status,
                "clash": limit > 0 && overlap(&slots, i) > limit,
            })
        })
        .collect();
    Ok(Json(json!({ "items": items })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slot(start: i64, end: i64) -> Slot {
        Slot {
            id: String::new(),
            title: String::new(),
            channel: String::new(),
            start,
            end,
            status: String::new(),
        }
    }

    #[test]
    fn overlap_counts_those_running_together() {
        let slots = vec![slot(0, 100), slot(50, 150), slot(100, 200), slot(300, 400)];
        assert_eq!(overlap(&slots, 0), 2);
        assert_eq!(overlap(&slots, 1), 3);
        assert_eq!(overlap(&slots, 3), 1);
    }
}
