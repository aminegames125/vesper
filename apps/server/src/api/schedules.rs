use axum::{
    extract::{Path, State},
    Json,
};
use chrono::TimeZone;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::{AuthUser, User},
    db::now,
    error::{ApiError, ApiResult},
    jobs::check_quota,
    net::check_target,
    schedule::{busy, materialise, occurrences, peak_overlap, Rule},
    state::AppState,
};

const COLUMNS: &str = "id, user_id, title, channel_name, source_url, tz, start_time, duration_s, days_mask, start_date, end_date, pad_before_s, pad_after_s, keep_hours, enabled, created_at";

fn row_json(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "title": r.get::<_, String>(2)?,
        "channelName": r.get::<_, String>(3)?,
        "url": r.get::<_, String>(4)?,
        "tz": r.get::<_, String>(5)?,
        "startTime": r.get::<_, String>(6)?,
        "seconds": r.get::<_, i64>(7)?,
        "days": r.get::<_, i64>(8)?,
        "startDate": r.get::<_, String>(9)?,
        "endDate": r.get::<_, Option<String>>(10)?,
        "padBefore": r.get::<_, i64>(11)?,
        "padAfter": r.get::<_, i64>(12)?,
        "keepHours": r.get::<_, Option<i64>>(13)?,
        "enabled": r.get::<_, i64>(14)? != 0,
        "createdAt": r.get::<_, i64>(15)?,
    }))
}

/// A schedule the user may change: their own, or any for an admin.
fn owned(state: &AppState, user: &User, id: &str) -> ApiResult<()> {
    let owner: String =
        state
            .db
            .conn()
            .query_row("SELECT user_id FROM schedules WHERE id = ?1", [id], |r| {
                r.get(0)
            })?;
    if owner != user.id && user.role != "admin" {
        return Err(ApiError::not_found("Schedule not found."));
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let mut rows: Vec<Value> = {
        let conn = state.db.conn();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM schedules WHERE user_id = ?1 ORDER BY created_at DESC"
        ))?;
        let rows = stmt
            .query_map([&user.id], row_json)?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };
    // The next occurrence of each rule, so the app can show "next: tomorrow 11:00".
    let conn = state.db.conn();
    for row in &mut rows {
        let next: Option<i64> = conn
            .query_row(
                "SELECT MIN(start_at) FROM recordings
                 WHERE schedule_id = ?1 AND status = 'scheduled' AND start_at > ?2",
                params![row["id"].as_str().unwrap_or_default(), now()],
                |r| r.get(0),
            )
            .unwrap_or(None);
        row["nextStart"] = json!(next);
    }
    Ok(Json(json!({ "schedules": rows })))
}

#[derive(Deserialize)]
pub struct NewSchedule {
    title: String,
    #[serde(default)]
    channel_name: String,
    url: String,
    /// IANA name such as `Europe/Paris`.
    tz: String,
    /// `HH:MM` on the wall clock of `tz`.
    start_time: String,
    /// Length of the programme in seconds, without padding.
    seconds: i64,
    /// Monday is bit 0 and Sunday bit 6. 0 records once, on `start_date`.
    #[serde(default)]
    days: i64,
    /// `YYYY-MM-DD`.
    start_date: String,
    #[serde(default)]
    end_date: Option<String>,
    #[serde(default)]
    pad_before: i64,
    #[serde(default)]
    pad_after: i64,
    #[serde(default)]
    keep_hours: Option<i64>,
    #[serde(default = "yes")]
    enabled: bool,
}

fn yes() -> bool {
    true
}

/// Checks a schedule and returns warnings the app should show; it is saved either way.
async fn validate(state: &AppState, user: &User, body: &NewSchedule) -> ApiResult<Rule> {
    if body.title.trim().is_empty() {
        return Err(ApiError::bad("Give the schedule a title."));
    }
    if !(0..=3600).contains(&body.pad_before) || !(0..=3600).contains(&body.pad_after) {
        return Err(ApiError::bad("Padding can be up to an hour."));
    }
    let rule = Rule::parse(
        &body.tz,
        &body.start_time,
        body.days,
        &body.start_date,
        body.end_date.as_deref(),
    )
    .map_err(ApiError::bad)?;
    check_quota(state, user, body.seconds + body.pad_before + body.pad_after)?;
    check_target(state, &body.url).await?;
    Ok(rule)
}

/// Plain-language notes about the next occurrences that would not fit the account's limits.
fn warnings(
    state: &AppState,
    user: &User,
    rule: &Rule,
    body: &NewSchedule,
    except: Option<&str>,
) -> Vec<String> {
    let mut notes = Vec::new();
    let from = now();
    for start in occurrences(rule, from, from + 14 * 86_400) {
        let window = (
            start - body.pad_before,
            start + body.seconds + body.pad_after,
        );
        let others = busy(state, &user.id, window, except);
        if user.max_concurrent > 0 && peak_overlap(&others, window) as i64 >= user.max_concurrent {
            let when = rule
                .tz
                .timestamp_opt(start, 0)
                .single()
                .map(|t| t.format("%a %d %b %H:%M").to_string())
                .unwrap_or_default();
            notes.push(format!(
                "{when} overlaps another recording; your account records {} at a time.",
                user.max_concurrent
            ));
            if notes.len() == 3 {
                break;
            }
        }
    }
    notes
}

fn save_fields(body: &NewSchedule) -> (String, String, Option<i64>) {
    let title: String = body.title.trim().chars().take(120).collect();
    let channel: String = body.channel_name.chars().take(120).collect();
    let keep = body.keep_hours.filter(|h| *h > 0);
    (title, channel, keep)
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<NewSchedule>,
) -> ApiResult<Json<Value>> {
    let rule = validate(&state, &user, &body).await?;
    let notes = warnings(&state, &user, &rule, &body, None);
    let (title, channel, keep) = save_fields(&body);
    let id = uuid::Uuid::new_v4().to_string();
    state.db.conn().execute(
        "INSERT INTO schedules
           (id, user_id, title, channel_name, source_url, tz, start_time, duration_s, days_mask,
            start_date, end_date, pad_before_s, pad_after_s, keep_hours, enabled, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            user.id,
            title,
            channel,
            body.url,
            body.tz,
            body.start_time,
            body.seconds,
            body.days,
            body.start_date,
            body.end_date.as_deref().filter(|d| !d.is_empty()),
            body.pad_before,
            body.pad_after,
            keep,
            i64::from(body.enabled),
            now(),
        ],
    )?;
    materialise(&state);
    state.db.audit(&user.username, "schedule.create", &title);
    Ok(Json(json!({ "id": id, "warnings": notes })))
}

/// Removes the occurrences that have not started yet; ones that ran or are running stay.
fn drop_future(state: &AppState, id: &str) {
    let _ = state.db.conn().execute(
        "DELETE FROM recordings WHERE schedule_id = ?1 AND status = 'scheduled' AND start_at > ?2",
        params![id, now()],
    );
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<NewSchedule>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    let rule = validate(&state, &user, &body).await?;
    let notes = warnings(&state, &user, &rule, &body, Some(&id));
    let (title, channel, keep) = save_fields(&body);
    state.db.conn().execute(
        "UPDATE schedules SET title = ?1, channel_name = ?2, source_url = ?3, tz = ?4, start_time = ?5,
           duration_s = ?6, days_mask = ?7, start_date = ?8, end_date = ?9, pad_before_s = ?10,
           pad_after_s = ?11, keep_hours = ?12, enabled = ?13 WHERE id = ?14",
        params![
            title,
            channel,
            body.url,
            body.tz,
            body.start_time,
            body.seconds,
            body.days,
            body.start_date,
            body.end_date.as_deref().filter(|d| !d.is_empty()),
            body.pad_before,
            body.pad_after,
            keep,
            i64::from(body.enabled),
            id,
        ],
    )?;
    drop_future(&state, &id);
    materialise(&state);
    state.db.audit(&user.username, "schedule.update", &title);
    Ok(Json(json!({ "ok": true, "warnings": notes })))
}

#[derive(Deserialize)]
pub struct Toggle {
    enabled: bool,
}

/// Pauses or resumes a schedule without changing it.
pub async fn set_enabled(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<Toggle>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    state.db.conn().execute(
        "UPDATE schedules SET enabled = ?1 WHERE id = ?2",
        params![i64::from(body.enabled), id],
    )?;
    drop_future(&state, &id);
    if body.enabled {
        materialise(&state);
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<Value>> {
    owned(&state, &user, &id)?;
    drop_future(&state, &id);
    state
        .db
        .conn()
        .execute("DELETE FROM schedules WHERE id = ?1", [&id])?;
    // What was already recorded stays, but no longer belongs to a rule.
    let _ = state.db.conn().execute(
        "UPDATE recordings SET schedule_id = NULL WHERE schedule_id = ?1",
        [&id],
    );
    Ok(Json(json!({ "ok": true })))
}
