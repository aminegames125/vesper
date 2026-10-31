use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
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
const MIN_FREE_BYTES: u64 = 512 * 1024 * 1024;

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
    let Ok((user_id, url, max_seconds, keep_hours, max_concurrent, storage)) = row else {
        return;
    };

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
            "SELECT COUNT(*) FROM recordings WHERE user_id = ?1 AND status = 'recording'",
            [&user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if max_concurrent > 0 && running >= max_concurrent {
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
    let _ = state.db.conn().execute(
        "UPDATE recordings SET status = 'recording' WHERE id = ?1",
        [id],
    );

    // Playlists and redirects can name any address, so the recorder re-checks each one it fetches.
    let guard = (!state.allow_private()).then(|| UrlGuard::new(crate::net::resolves_public));
    let state = state.clone();
    let id = id.to_string();
    let dir = recording_dir(&state, &user_id, &id);
    thread::spawn(move || {
        let started = Instant::now();
        let mut bytes_before = 0u64;
        let mut reconnects = 0u32;
        let mut last_problem: Option<String> = None;
        let mut fatal: Option<String>;

        loop {
            let remaining = (max_seconds.max(1) as u64).saturating_sub(started.elapsed().as_secs());
            let mut options =
                Options::new(url.clone(), remaining.max(1), Output::Segments(dir.clone()));
            options.guard = guard.clone();
            options.append = reconnects > 0;

            let progress_state = state.clone();
            let progress_id = id.clone();
            let base = bytes_before;
            let outcome = vesper_recorder::record(&options, &stop, move |p| {
                let _ = progress_state.db.conn().execute(
                    "UPDATE recordings SET bytes = ?1, seconds = ?2 WHERE id = ?3",
                    params![
                        (base + p.bytes) as i64,
                        started.elapsed().as_secs() as i64,
                        progress_id
                    ],
                );
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
                || reconnects >= MAX_RECONNECTS
            {
                break;
            }
            reconnects += 1;
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
        state
            .jobs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);

        let finished = now();
        let keep_until = keep_hours.filter(|h| *h > 0).map(|h| finished + h * 3600);
        let seconds = started.elapsed().as_secs() as i64;
        let conn = state.db.conn();
        let _ = if bytes_before > 0 {
            let note = match (reconnects, &last_problem) {
                (0, problem) => problem.clone(),
                (n, Some(problem)) => Some(format!("Reconnected {n} time(s). {problem}")),
                (n, None) => Some(format!("Reconnected {n} time(s) after the stream dropped.")),
            };
            conn.execute(
                "UPDATE recordings SET status = 'done', bytes = ?1, seconds = ?2, error = ?3, finished_at = ?4, keep_until = ?5 WHERE id = ?6",
                params![bytes_before as i64, seconds, note, finished, keep_until, id],
            )
        } else {
            let message = fatal
                .or(last_problem)
                .unwrap_or_else(|| "Nothing was captured.".into());
            conn.execute(
                "UPDATE recordings SET status = 'failed', error = ?1, finished_at = ?2, keep_until = ?3 WHERE id = ?4",
                params![message, finished, keep_until, id],
            )
        };
    });
}

/// Background work: start scheduled recordings, expire old ones, and clean up after a crash.
pub fn spawn_background(state: AppState) {
    // A recording cannot survive a restart, so anything still marked as running was cut short.
    let _ = state.db.conn().execute(
        "UPDATE recordings SET status = 'failed', error = 'The server restarted while recording.', finished_at = ?1
         WHERE status = 'recording'",
        [now()],
    );

    crate::schedule::materialise(&state);
    tokio::spawn(async move {
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            tick += 1;

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
