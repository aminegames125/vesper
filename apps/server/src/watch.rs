//! Watching a channel live from the web. A watch session is an ordinary recording with the hidden
//! tag `.watch`: the recorder captures the channel to HLS and the web player plays it as it grows.
//! Sessions stay out of lists and notifications, and are stopped and deleted once nobody has
//! fetched their playlist for a while (a closed tab, a lost connection).

use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use crate::{db::now, jobs, state::AppState};

/// The tag that marks a watch session.
pub const TAG: &str = ".watch";

/// A session with no playlist request for this long is over.
const IDLE_SECONDS: i64 = 60;

fn seen() -> &'static Mutex<HashMap<String, i64>> {
    static SEEN: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();
    SEEN.get_or_init(Default::default)
}

/// Called whenever a viewer fetches the playlist of a watch session.
pub fn touch(id: &str) {
    seen()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(id.to_string(), now());
}

/// True when the recording is a watch session.
pub fn is_session(state: &AppState, id: &str) -> bool {
    state
        .db
        .conn()
        .query_row("SELECT tag FROM recordings WHERE id = ?1", [id], |r| {
            r.get::<_, String>(0)
        })
        .is_ok_and(|tag| tag == TAG)
}

/// Live channels one viewer can have open at once (two tabs, or a quick switch before the old
/// channel has been let go).
const PER_VIEWER: usize = 2;

/// Before a new session starts, ends this viewer's oldest ones so that at most `PER_VIEWER` run.
pub fn make_room(state: &AppState, user_id: &str) {
    let running: Vec<String> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id FROM recordings WHERE user_id = ?1 AND tag = ?2 AND status IN ('queued', 'recording')
             ORDER BY created_at",
        ) else {
            return;
        };
        stmt.query_map([user_id, TAG], |r| r.get(0))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    let surplus = (running.len() + 1).saturating_sub(PER_VIEWER);
    for id in running.iter().take(surplus) {
        jobs::stop(state, id);
    }
}

/// Stops sessions nobody is watching and removes the ones that have ended. Runs every tick.
pub fn sweep(state: &AppState) {
    let rows: Vec<(String, String, String, i64)> = {
        let conn = state.db.conn();
        let Ok(mut stmt) =
            conn.prepare("SELECT id, user_id, status, created_at FROM recordings WHERE tag = ?1")
        else {
            return;
        };
        stmt.query_map([TAG], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    let at = now();
    for (id, user_id, status, created) in rows {
        let last = seen()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(&id)
            .copied()
            .unwrap_or(0)
            .max(created);
        if at - last < IDLE_SECONDS {
            continue;
        }
        match status.as_str() {
            "queued" | "recording" => {
                jobs::stop(state, &id);
            }
            _ => {
                jobs::remove_files(state, &user_id, &id);
                let _ = state
                    .db
                    .conn()
                    .execute("DELETE FROM recordings WHERE id = ?1", [&id]);
                seen().lock().unwrap_or_else(|p| p.into_inner()).remove(&id);
            }
        }
    }
}
