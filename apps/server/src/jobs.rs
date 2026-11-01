use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use rusqlite::params;
use vesper_recorder::{Options, Output, UrlGuard};

use crate::{
    auth::User,
    db::now,
    error::{ApiError, ApiResult},
    state::AppState,
};

/// How many times a dropped stream is joined again before the recording gives up.
const MAX_RECONNECTS: u32 = 8;

/// A recording is refused when the disk it would be written to has less room than this.
pub const MIN_FREE_BYTES: u64 = 512 * 1024 * 1024;

/// Downloads an account can have running at once.
const MAX_DOWNLOADS: i64 = 3;

/// The other way a provider may serve the same live channel: `/live/u/p/1.ts` and `/live/u/p/1.m3u8`.
fn other_form(url: &str) -> Option<String> {
    let (path, query) = match url.split_once('?') {
        Some((p, q)) => (p, format!("?{q}")),
        None => (url, String::new()),
    };
    if !path.contains("/live/") {
        return None;
    }
    if let Some(base) = path.strip_suffix(".ts") {
        Some(format!("{base}.m3u8{query}"))
    } else {
        path.strip_suffix(".m3u8")
            .map(|base| format!("{base}.ts{query}"))
    }
}

pub fn recording_dir(state: &AppState, user_id: &str, id: &str) -> PathBuf {
    state.config.recordings_dir().join(user_id).join(id)
}

/// Bytes the user's recordings take up, finished or not.
pub fn storage_used(state: &AppState, user_id: &str) -> i64 {
    state
        .db
        .conn()
        .query_row(
            "SELECT COALESCE(SUM(bytes), 0) FROM recordings WHERE user_id = ?1",
            [user_id],
            |r| r.get(0),
        )
        .unwrap_or(0)
}

/// Checks the account's rules before a recording is accepted.
pub fn check_quota(state: &AppState, user: &User, seconds: i64) -> ApiResult<()> {
    if seconds > 30 * 24 * 3600 {
        return Err(ApiError::bad("A recording can be at most 30 days long."));
    }
    if user.role == "guest" {
        return Err(ApiError::forbidden("Guest accounts cannot record."));
    }
    if seconds < 10 {
        return Err(ApiError::bad(
            "A recording must be at least 10 seconds long.",
        ));
    }
    if user.max_hours > 0 && seconds > user.max_hours * 3600 {
        return Err(ApiError::forbidden(format!(
            "Your account can record up to {} hour(s) at a time.",
            user.max_hours
        )));
    }
    if user.storage_bytes > 0 && storage_used(state, &user.id) >= user.storage_bytes {
        return Err(ApiError::forbidden(
            "Your cloud storage is full. Delete a recording first.",
        ));
    }
    Ok(())
}

/// Free bytes on the disk the recordings are written to, when the system can say.
pub fn free_disk(state: &AppState) -> Option<u64> {
    let dir = state.config.recordings_dir();
    fs::create_dir_all(&dir).ok()?;
    fs4::available_space(&dir).ok()
}

pub fn remove_files(state: &AppState, user_id: &str, id: &str) {
    let _ = fs::remove_dir_all(recording_dir(state, user_id, id));
}

/// Starts the recording `id` on its own thread, or marks it failed if the account is over its limits.
pub fn start(state: &AppState, id: &str) {
    let row = state.db.conn().query_row(
        "SELECT r.user_id, r.source_url, r.max_seconds, r.keep_hours, u.max_concurrent, u.storage_bytes
         FROM recordings r JOIN users u ON u.id = r.user_id WHERE r.id = ?1",
        [id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, Option<i64>>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?)),
    );
    let Ok((user_id, url, mut max_seconds, keep_hours, max_concurrent, storage)) = row else {
        return;
    };
    let (start_at, status): (i64, String) = state
        .db
        .conn()
        .query_row(
            "SELECT start_at, status FROM recordings WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, String::new()));
    if !matches!(status.as_str(), "scheduled" | "queued") {
        return;
    }
    let extra = extras(state, id);
    let is_download = extra.kind == "download";
    // "Follow the guide": a programme that runs over keeps recording until the guide says it ended.
    if extra.follow && !extra.epg_id.is_empty() {
        let stop_at: Option<i64> = state
            .db
            .conn()
            .query_row(
                "SELECT stop_at FROM epg_programmes
                 WHERE channel_id = ?1 AND start_at <= ?2 AND stop_at > ?2
                 ORDER BY start_at DESC LIMIT 1",
                params![extra.epg_id, start_at + extra.pad_before + 30],
                |r| r.get(0),
            )
            .ok();
        if let Some(stop_at) = stop_at {
            let wanted = stop_at + extra.pad_after - start_at;
            if wanted > max_seconds && wanted <= max_seconds + 3 * 3600 {
                max_seconds = wanted;
            }
        }
    }
    // Late (the server was down): only record what is left of the programme.
    let late = (now() - start_at).max(0);
    if status == "scheduled" && late > 0 {
        max_seconds -= late;
    }

    let fail = |message: &str| {
        let _ = state.db.conn().execute(
            "UPDATE recordings SET status = 'failed', error = ?1, finished_at = ?2 WHERE id = ?3",
            params![message, now(), id],
        );
    };
    let running: i64 = state
        .db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM recordings WHERE user_id = ?1 AND status = 'recording' AND kind != 'download'",
            [&user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if status == "scheduled" && max_seconds < 10 {
        return fail("Missed: the server was not running when this was due.");
    }
    if is_download {
        // Downloads do not use up a recording slot, but a few at a time is plenty.
        let downloading: i64 = state
            .db
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM recordings WHERE user_id = ?1 AND status = 'recording' AND kind = 'download'",
                [&user_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if downloading >= MAX_DOWNLOADS {
            // Stays queued; the background tick starts it when a slot frees up.
            return;
        }
    } else if max_concurrent > 0 && running >= max_concurrent {
        // A scheduled one waits for the other to end (back-to-back programmes overlap by their padding).
        if status == "scheduled" && max_seconds > 60 {
            return;
        }
        return fail("Too many recordings at once for this account.");
    }
    if storage > 0 && storage_used(state, &user_id) >= storage {
        return fail("Cloud storage is full.");
    }
    if free_disk(state).is_some_and(|free| free < MIN_FREE_BYTES) {
        return fail("The server's disk is almost full.");
    }

    let stop = Arc::new(AtomicBool::new(false));
    state
        .jobs
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(id.to_string(), stop.clone());
    let claimed = state
        .db
        .conn()
        .execute(
            "UPDATE recordings SET status = 'recording' WHERE id = ?1 AND status IN ('scheduled', 'queued')",
            [id],
        )
        .unwrap_or(0);
    if claimed == 0 {
        state
            .jobs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(id);
        return;
    }

    let runtime = tokio::runtime::Handle::try_current().ok();
    if is_download {
        let Some(handle) = runtime else {
            return fail("The server could not start the download.");
        };
        handle.spawn(crate::download::run(
            state.clone(),
            id.to_string(),
            user_id,
            url,
            keep_hours,
            stop,
        ));
        return;
    }

    // Playlists and redirects can name any address, so the recorder re-checks each one it fetches.
    let guard = (!state.allow_private()).then(|| UrlGuard::new(crate::net::resolves_public));
    let state = state.clone();
    let id = id.to_string();
    let dir = recording_dir(&state, &user_id, &id);
    let backup = extra.backup.filter(|b| !b.is_empty() && *b != url);
    // Without a backup, the other form of the same address is tried: providers often answer one of
    // `.ts` and `.m3u8` for a channel with "404" while the other works.
    let swapped = backup.is_none().then(|| other_form(&url)).flatten();
    let swap_every = if swapped.is_some() { 1 } else { 3 };
    let backup = backup.or(swapped);
    let lowest = extra.lowest;
    thread::spawn(move || {
        let started = Instant::now();
        let mut bytes_before = 0u64;
        let mut reconnects = 0u32;
        // The address being recorded; it flips to the backup (and back) while the stream keeps failing.
        let mut current = url.clone();
        let mut switched = 0u32;
        // Drops in a row: a long healthy stretch between two drops starts the count again.
        let mut streak = 0u32;
        let limit_hit = Arc::new(AtomicU8::new(0));
        let mut last_problem: Option<String> = None;
        let mut fatal: Option<String>;

        loop {
            let remaining = (max_seconds.max(1) as u64).saturating_sub(started.elapsed().as_secs());
            let mut options = Options::new(
                current.clone(),
                remaining.max(1),
                Output::Segments(dir.clone()),
            );
            options.lowest_quality = lowest;
            options.guard = guard.clone();
            options.public_only = guard.is_some();
            options.append = reconnects > 0;
            // The playlist stays open between attempts and is closed once the recording is over.
            options.more_to_come = true;
            // Never keep a silent recording: when the sound lives in a separate rendition it is
            // joined in, and when even that is missing the recorder reports `NoAudio` so the
            // address switch below can try the channel's other (usually muxed) form.
            options.require_audio = true;
            let attempt_started = Instant::now();

            let progress_state = state.clone();
            let progress_id = id.clone();
            let base = bytes_before;
            let progress_stop = stop.clone();
            let hit = limit_hit.clone();
            let progress_user = user_id.clone();
            let mut beats = 0u32;
            let outcome = vesper_recorder::record(&options, &stop, move |p| {
                let _ = progress_state.db.conn().execute(
                    "UPDATE recordings SET bytes = ?1, seconds = ?2 WHERE id = ?3",
                    params![
                        (base + p.bytes) as i64,
                        started.elapsed().as_secs() as i64,
                        progress_id
                    ],
                );
                // The account's storage and the disk are checked while recording, not only at the start.
                beats += 1;
                if storage > 0 && storage_used(&progress_state, &progress_user) >= storage {
                    hit.store(1, Ordering::Relaxed);
                    progress_stop.store(true, Ordering::Relaxed);
                } else if beats.is_multiple_of(30)
                    && free_disk(&progress_state).is_some_and(|free| free < MIN_FREE_BYTES / 2)
                {
                    hit.store(2, Ordering::Relaxed);
                    progress_stop.store(true, Ordering::Relaxed);
                }
            });
            let permanent = matches!(
                outcome,
                Err(vesper_recorder::Error::BadUrl
                    | vesper_recorder::Error::Encrypted
                    | vesper_recorder::Error::Blocked)
            );
            match outcome {
                Ok(summary) => {
                    bytes_before += summary.bytes;
                    if summary.bytes > 1_000_000 && attempt_started.elapsed().as_secs() >= 60 {
                        streak = 0;
                    }
                    last_problem = summary.warning;
                    fatal = None;
                }
                Err(error) => fatal = Some(error.to_string()),
            }

            // A live channel should not end before the programme does. If the stream dropped,
            // wait a little and join it again; the new part is appended to the same recording.
            let finished_on_time = started.elapsed().as_secs() + 3 >= max_seconds.max(1) as u64;
            if permanent
                || stop.load(Ordering::Relaxed)
                || finished_on_time
                || streak >= MAX_RECONNECTS
            {
                break;
            }
            reconnects += 1;
            streak += 1;
            // Still failing after a few tries: switch to the other address of the channel, if any.
            if let Some(other) = &backup {
                if streak.is_multiple_of(swap_every) {
                    switched += 1;
                    current = if current == url {
                        other.clone()
                    } else {
                        url.clone()
                    };
                }
            }
            // Wait longer after each drop, but never past the end of the programme.
            let left = (max_seconds.max(1) as u64).saturating_sub(started.elapsed().as_secs());
            let pause = (5 * u64::from(reconnects))
                .min(30)
                .min(left.saturating_sub(3));
            for _ in 0..pause {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(Duration::from_secs(1));
            }
            // The programme may have ended while waiting; do not start a new attempt after it.
            if stop.load(Ordering::Relaxed)
                || started.elapsed().as_secs() + 3 >= max_seconds.max(1) as u64
            {
                break;
            }
        }
        let _ = vesper_recorder::end_playlist(&dir);
        match limit_hit.load(Ordering::Relaxed) {
            1 => last_problem = Some("Stopped early: the account's storage is full.".into()),
            2 => last_problem = Some("Stopped early: the server's disk is almost full.".into()),
            _ => {}
        }
        state
            .jobs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);

        let finished = now();
        let keep_until = keep_hours
            .filter(|h| *h > 0)
            .map(|h| finished.saturating_add(h.min(87_600) * 3600));
        let seconds = started.elapsed().as_secs() as i64;
        let conn = state.db.conn();
        let _ = if bytes_before > 0 {
            let mut note = match (reconnects, &last_problem) {
                (0, problem) => problem.clone(),
                (n, Some(problem)) => Some(format!("Reconnected {n} time(s). {problem}")),
                (n, None) => Some(format!("Reconnected {n} time(s) after the stream dropped.")),
            };
            if switched > 0 {
                note = Some(format!(
                    "{} Used the backup address {switched} time(s).",
                    note.unwrap_or_default()
                ));
            }
            conn.execute(
                "UPDATE recordings SET status = 'done', bytes = ?1, seconds = ?2, error = ?3, finished_at = ?4, keep_until = ?5 WHERE id = ?6",
                params![bytes_before as i64, seconds, note, finished, keep_until, id],
            )
        } else {
            let message = fatal.or(last_problem).unwrap_or_else(|| {
                if stop.load(Ordering::Relaxed) {
                    "Stopped.".into()
                } else {
                    "Nothing was captured.".into()
                }
            });
            conn.execute(
                "UPDATE recordings SET status = 'failed', error = ?1, finished_at = ?2, keep_until = ?3 WHERE id = ?4",
                params![message, finished, keep_until, id],
            )
        };
        drop(conn);
        after_finish(&state, &id, &user_id, runtime);
    });
}

/// What happens once a recording has ended: tell the webhook and trim old episodes of its schedule.
#[allow(clippy::type_complexity)]
fn after_finish(
    state: &AppState,
    id: &str,
    user_id: &str,
    runtime: Option<tokio::runtime::Handle>,
) {
    #[allow(clippy::type_complexity)]
    let row: Option<(String, String, i64, i64, Option<String>, Option<String>, Option<String>, Option<String>)> = state
        .db
        .conn()
        .query_row(
            "SELECT r.title, r.status, r.seconds, r.bytes, r.error, r.schedule_id, r.series_rule_id, s.webhook_url
             FROM recordings r LEFT JOIN schedules s ON s.id = r.schedule_id WHERE r.id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)),
        )
        .ok();
    let Some((title, status, seconds, bytes, error, schedule_id, series_id, own_hook)) = row else {
        return;
    };

    if let Some(schedule) = schedule_id {
        prune_schedule(state, &schedule);
    }
    if let Some(rule) = series_id {
        prune_series(state, &rule);
    }
    if let Some(handle) = &runtime {
        if status == "done" {
            let (state, id) = (state.clone(), id.to_string());
            handle.spawn(async move { crate::api::library::make_thumb(&state, &id).await });
        }
    }

    // A schedule can have a webhook of its own; the server-wide one is the fallback.
    let url = own_hook
        .filter(|u| u.starts_with("http"))
        .unwrap_or_else(|| state.db.setting("webhook_url", ""));
    if url.starts_with("http") && !in_quiet_hours(state) {
        let (Some(runtime), client) = (runtime, state.http.clone()) else {
            return;
        };
        let guard_state = state.clone();
        let text = match status.as_str() {
            "done" => format!("Vesper recorded \"{title}\" ({} min).", seconds / 60),
            _ => format!(
                "Vesper could not record \"{title}\": {}",
                error.clone().unwrap_or_default()
            ),
        };
        let body = serde_json::json!({
            "event": format!("recording.{status}"), "id": id, "title": title, "seconds": seconds,
            "bytes": bytes, "error": error, "content": text, "text": text,
        });
        let _ = user_id;
        runtime.spawn(async move {
            // A schedule's own address is checked again: it must not reach into the network.
            if crate::net::check_target(&guard_state, &url).await.is_err() {
                return;
            }
            let _ = client
                .post(url)
                .timeout(Duration::from_secs(10))
                .header("content-type", "application/json")
                .body(body.to_string())
                .send()
                .await;
        });
    }
}

/// Sends a message to the server-wide webhook, unless it is quiet hours or none is set.
pub fn notify(state: &AppState, event: &str, text: &str) {
    let url = state.db.setting("webhook_url", "");
    if !url.starts_with("http") || in_quiet_hours(state) {
        return;
    }
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        return;
    };
    let client = state.http.clone();
    let body = serde_json::json!({ "event": event, "content": text, "text": text }).to_string();
    handle.spawn(async move {
        let _ = client
            .post(url)
            .timeout(Duration::from_secs(10))
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await;
    });
}

/// The same follow-up as after a recording, for a finished download.
pub fn after_download(state: &AppState, id: &str, runtime: Option<tokio::runtime::Handle>) {
    after_finish(state, id, "", runtime);
}

/// Minutes since midnight for an `HH:MM` setting.
fn minutes_of(value: &str) -> Option<u32> {
    let (h, m) = value.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// True when `now` falls inside the quiet window, which may run past midnight (22:00 to 07:00).
fn within(start: u32, end: u32, now: u32) -> bool {
    match start.cmp(&end) {
        std::cmp::Ordering::Equal => false,
        std::cmp::Ordering::Less => (start..end).contains(&now),
        std::cmp::Ordering::Greater => now >= start || now < end,
    }
}

/// Notifications from the server wait out the quiet hours set by the admin, in the server's local time.
fn in_quiet_hours(state: &AppState) -> bool {
    use chrono::Timelike;
    let (Some(start), Some(end)) = (
        minutes_of(&state.db.setting("quiet_start", "")),
        minutes_of(&state.db.setting("quiet_end", "")),
    ) else {
        return false;
    };
    let local = chrono::Local::now();
    within(start, end, local.hour() * 60 + local.minute())
}

/// Things about a recording that come from its schedule rather than from the recording itself.
#[derive(Default)]
struct Extras {
    kind: String,
    backup: Option<String>,
    lowest: bool,
    follow: bool,
    epg_id: String,
    pad_before: i64,
    pad_after: i64,
}

fn extras(state: &AppState, id: &str) -> Extras {
    state
        .db
        .conn()
        .query_row(
            "SELECT r.kind, COALESCE(r.backup_url, s.backup_url), COALESCE(s.quality, 'best'),
                    COALESCE(s.follow_guide, 0), COALESCE(s.epg_id, ''),
                    COALESCE(s.pad_before_s, 0), COALESCE(s.pad_after_s, 0)
             FROM recordings r LEFT JOIN schedules s ON s.id = r.schedule_id WHERE r.id = ?1",
            [id],
            |r| {
                Ok(Extras {
                    kind: r.get(0)?,
                    backup: r.get(1)?,
                    lowest: r.get::<_, String>(2)? == "lowest",
                    follow: r.get::<_, i64>(3)? != 0,
                    epg_id: r.get(4)?,
                    pad_before: r.get(5)?,
                    pad_after: r.get(6)?,
                })
            },
        )
        .unwrap_or_default()
}

/// Deletes the oldest finished episodes of a series rule beyond its "keep the last N" limit.
fn prune_series(state: &AppState, rule_id: &str) {
    let keep: Option<i64> = state
        .db
        .conn()
        .query_row(
            "SELECT keep_last FROM series_rules WHERE id = ?1",
            [rule_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    let Some(keep) = keep.filter(|n| *n > 0) else {
        return;
    };
    let old: Vec<(String, String)> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, user_id FROM recordings WHERE series_rule_id = ?1 AND status = 'done' AND pinned = 0
             ORDER BY COALESCE(finished_at, 0) DESC, created_at DESC LIMIT -1 OFFSET ?2",
        ) else {
            return;
        };
        stmt.query_map(params![rule_id, keep], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    for (id, owner) in old {
        remove_files(state, &owner, &id);
        let _ = state
            .db
            .conn()
            .execute("DELETE FROM recordings WHERE id = ?1", [&id]);
        state.db.audit("system", "recording.pruned", &id);
    }
}

/// Deletes the oldest finished recordings of a schedule beyond its "keep the last N" limit.
fn prune_schedule(state: &AppState, schedule_id: &str) {
    let keep: Option<i64> = state
        .db
        .conn()
        .query_row(
            "SELECT keep_last FROM schedules WHERE id = ?1",
            [schedule_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    let Some(keep) = keep.filter(|n| *n > 0) else {
        return;
    };
    let old: Vec<(String, String)> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, user_id FROM recordings WHERE schedule_id = ?1 AND status = 'done' AND pinned = 0
             ORDER BY COALESCE(finished_at, 0) DESC, created_at DESC LIMIT -1 OFFSET ?2",
        ) else {
            return;
        };
        stmt.query_map(params![schedule_id, keep], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    for (id, owner) in old {
        remove_files(state, &owner, &id);
        let _ = state
            .db
            .conn()
            .execute("DELETE FROM recordings WHERE id = ?1", [&id]);
        state.db.audit("system", "recording.pruned", &id);
    }
}

/// Background work: start scheduled recordings, expire old ones, and clean up after a crash.
pub fn spawn_background(state: AppState) {
    // A recording cannot survive a restart, so anything still marked as running was cut short.
    let _ = state.db.conn().execute(
        "UPDATE recordings SET status = 'failed', error = 'The server restarted while recording.', finished_at = ?1,
           keep_until = COALESCE(keep_until, ?1 + 86400)
         WHERE status = 'recording'",
        [now()],
    );

    crate::schedule::materialise(&state);
    tokio::spawn(async move {
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            tick += 1;
            crate::tasks::run(&state, tick);

            // Keep the next two weeks of every repeating schedule created.
            if tick.is_multiple_of(12) {
                crate::schedule::materialise(&state);
            }

            let due: Vec<String> = {
                let conn = state.db.conn();
                let mut stmt = match conn.prepare(
                    "SELECT id FROM recordings WHERE status = 'scheduled' AND start_at <= ?1",
                ) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                stmt.query_map([now()], |r| r.get(0))
                    .map(|rows| rows.flatten().collect())
                    .unwrap_or_default()
            };
            for id in due {
                start(&state, &id);
            }

            // Retention ("stay for less"): once a recording passes its keep-until time it is deleted.
            if tick.is_multiple_of(12) {
                let expired: Vec<(String, String)> = {
                    let conn = state.db.conn();
                    let mut stmt = match conn.prepare("SELECT id, user_id FROM recordings WHERE keep_until IS NOT NULL AND keep_until <= ?1 AND status != 'recording'") {
                        Ok(s) => s,
                        Err(_) => continue,
                    };
                    stmt.query_map([now()], |r| Ok((r.get(0)?, r.get(1)?)))
                        .map(|rows| rows.flatten().collect())
                        .unwrap_or_default()
                };
                for (id, user_id) in expired {
                    remove_files(&state, &user_id, &id);
                    let _ = state
                        .db
                        .conn()
                        .execute("DELETE FROM recordings WHERE id = ?1", [&id]);
                    state.db.audit("system", "recording.expired", &id);
                }
                let _ = state
                    .db
                    .conn()
                    .execute("DELETE FROM sessions WHERE expires_at <= ?1", [now()]);
            }
        }
    });
}

pub fn stop(state: &AppState, id: &str) -> bool {
    match state.jobs.lock().unwrap_or_else(|p| p.into_inner()).get(id) {
        Some(flag) => {
            flag.store(true, Ordering::Relaxed);
            true
        }
        None => false,
    }
}

#[cfg(test)]
mod other_form_tests {
    use super::other_form;

    #[test]
    fn a_live_address_has_a_twin() {
        assert_eq!(
            other_form("http://h/live/u/p/1.ts").as_deref(),
            Some("http://h/live/u/p/1.m3u8")
        );
        assert_eq!(
            other_form("http://h/live/u/p/1.m3u8?x=1").as_deref(),
            Some("http://h/live/u/p/1.ts?x=1")
        );
        assert_eq!(other_form("http://h/movie/u/p/1.mp4"), None);
        assert_eq!(other_form("http://h/stream/1"), None);
    }
}
