use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use rusqlite::params;
use vesper_recorder::{Options, Output, UrlGuard};

use crate::{
    auth::User,
    db::now,
    error::{ApiError, ApiResult},
    state::AppState,
};

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
        let mut options = Options::new(url, max_seconds.max(1) as u64, Output::Segments(dir));
        options.guard = guard;
        let progress_state = state.clone();
        let progress_id = id.clone();
        let outcome = vesper_recorder::record(&options, &stop, move |p| {
            let _ = progress_state.db.conn().execute(
                "UPDATE recordings SET bytes = ?1, seconds = ?2 WHERE id = ?3",
                params![p.bytes as i64, p.seconds as i64, progress_id],
            );
        });
        state
            .jobs
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(&id);

        let finished = now();
        let keep_until = keep_hours.filter(|h| *h > 0).map(|h| finished + h * 3600);
        let conn = state.db.conn();
        let _ = match outcome {
            Ok(summary) => conn.execute(
                "UPDATE recordings SET status = 'done', bytes = ?1, seconds = ?2, error = ?3, finished_at = ?4, keep_until = ?5 WHERE id = ?6",
                params![summary.bytes as i64, summary.seconds as i64, summary.warning, finished, keep_until, id],
            ),
            Err(error) => conn.execute(
                "UPDATE recordings SET status = 'failed', error = ?1, finished_at = ?2, keep_until = ?3 WHERE id = ?4",
                params![error.to_string(), finished, keep_until, id],
            ),
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

    tokio::spawn(async move {
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            tick += 1;

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
