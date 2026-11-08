//! Slow background chores that run beside the 5 second tick: retries, guide updates, channel
//! health checks, update checks and the optional wake command.

use std::{sync::Mutex, time::Duration};

use rusqlite::params;

use crate::{db::now, jobs, net::check_target, state::AppState};

/// The next start the wake command was last told about.
static LAST_WAKE: Mutex<Option<i64>> = Mutex::new(None);

/// Called every 5 seconds with a counter that starts at 1.
pub fn run(state: &AppState, tick: u64) {
    start_queued_downloads(state);
    crate::watch::sweep(state);
    if tick.is_multiple_of(6) {
        retry_failed(state);
        crate::epg::match_series(state);
    }
    if tick.is_multiple_of(12) {
        let _ = state
            .db
            .conn()
            .execute("DELETE FROM shares WHERE expires_at <= ?1", [now()]);
        wake(state);
    }
    // The guide: soon after start-up, then twice a day.
    if (tick == 3 || tick.is_multiple_of(8_640))
        && !state.db.setting("epg_url", "").trim().is_empty()
    {
        let state = state.clone();
        tokio::spawn(async move {
            let _ = crate::epg::refresh(&state).await;
            crate::epg::match_series(&state);
        });
    }
    // Channel health: a few minutes after start-up, then daily.
    if tick == 60 || tick.is_multiple_of(17_280) {
        let state = state.clone();
        tokio::spawn(async move { check_channels(&state).await });
    }
    // Updates: once after start-up, then weekly.
    if tick == 90 || tick.is_multiple_of(120_960) {
        let state = state.clone();
        tokio::spawn(async move { check_update(&state).await });
    }
}

/// Downloads wait in the queue when too many are running; this starts them as slots free up.
fn start_queued_downloads(state: &AppState) {
    let ids: Vec<String> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id FROM recordings WHERE kind = 'download' AND status = 'queued' ORDER BY created_at LIMIT 10",
        ) else {
            return;
        };
        stmt.query_map([], |r| r.get(0))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    for id in ids {
        jobs::start(state, &id);
    }
}

/// Starts again a scheduled recording that failed before it captured anything, while its programme
/// is still on. Gives up after three tries.
fn retry_failed(state: &AppState) {
    let ids: Vec<String> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id FROM recordings
             WHERE status = 'failed' AND kind = 'recording' AND bytes = 0 AND retries < 3
               AND (schedule_id IS NOT NULL OR series_rule_id IS NOT NULL)
               AND error IS NOT NULL AND error NOT LIKE 'Cancelled%' AND error NOT LIKE 'Stopped%' AND error NOT LIKE 'Missed%'
               AND error NOT LIKE '%full%' AND error NOT LIKE 'Too many%'
               AND start_at + max_seconds > ?1 + 120 AND finished_at > ?1 - 300",
        ) else {
            return;
        };
        stmt.query_map([now()], |r| r.get(0))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    for id in ids {
        let at = now();
        // Only what is left of the programme is recorded.
        let changed = state
            .db
            .conn()
            .execute(
                "UPDATE recordings SET status = 'queued', error = NULL, finished_at = NULL,
                   retries = retries + 1, max_seconds = start_at + max_seconds - ?1, start_at = ?1
                 WHERE id = ?2 AND status = 'failed'",
                params![at, id],
            )
            .unwrap_or(0);
        if changed > 0 {
            jobs::start(state, &id);
        }
    }
}

/// Runs the `--wake-command` when the time of the next recording changes.
fn wake(state: &AppState) {
    let Some(command) = state
        .config
        .wake_command
        .clone()
        .filter(|c| !c.trim().is_empty())
    else {
        return;
    };
    let next: Option<i64> = state
        .db
        .conn()
        .query_row(
            "SELECT MIN(start_at) FROM recordings WHERE status = 'scheduled' AND start_at > ?1",
            [now()],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    let mut last = LAST_WAKE.lock().unwrap_or_else(|p| p.into_inner());
    if *last == next {
        return;
    }
    *last = next;
    let Some(next) = next else {
        return;
    };
    let (shell, flag) = if cfg!(windows) {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    if let Ok(mut child) = tokio::process::Command::new(shell)
        .arg(flag)
        .arg(&command)
        .env("VESPER_NEXT_START", next.to_string())
        .kill_on_drop(true)
        .spawn()
    {
        tokio::spawn(async move {
            let _ = tokio::time::timeout(Duration::from_secs(60), child.wait()).await;
        });
    }
}

/// Opens each channel that a schedule or series rule uses to see whether it still answers.
async fn check_channels(state: &AppState) {
    let channels: Vec<(String, String)> = {
        let conn = state.db.conn();
        let Ok(mut stmt) = conn.prepare(
            "SELECT DISTINCT source_url, channel_name FROM schedules WHERE enabled = 1
             UNION SELECT DISTINCT source_url, channel_name FROM series_rules WHERE enabled = 1
             LIMIT 100",
        ) else {
            return;
        };
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    };
    for (url, name) in channels {
        let (ok, detail) = probe(state, &url).await;
        let was_ok: Option<bool> = state
            .db
            .conn()
            .query_row(
                "SELECT ok FROM channel_health WHERE url = ?1",
                [&url],
                |r| r.get::<_, i64>(0).map(|v| v != 0),
            )
            .ok();
        let _ = state.db.conn().execute(
            "INSERT INTO channel_health (url, name, ok, detail, checked_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(url) DO UPDATE SET name = excluded.name, ok = excluded.ok,
               detail = excluded.detail, checked_at = excluded.checked_at",
            params![url, name, i64::from(ok), detail, now()],
        );
        if !ok && was_ok != Some(false) {
            let label = if name.is_empty() {
                "A channel".to_string()
            } else {
                name
            };
            jobs::notify(
                state,
                "channel.down",
                &format!(
                    "Vesper: \"{label}\" does not answer ({detail}). Its recordings may fail."
                ),
            );
        }
    }
    // Forget channels nothing uses any more.
    let _ = state.db.conn().execute(
        "DELETE FROM channel_health WHERE url NOT IN
           (SELECT source_url FROM schedules UNION SELECT source_url FROM series_rules)",
        [],
    );
}

/// Opens a stream for a moment. True when the provider answered with success.
async fn probe(state: &AppState, url: &str) -> (bool, String) {
    // A second connection could cost the running recording its place with a one-stream provider.
    let recording: bool = state
        .db
        .conn()
        .query_row(
            "SELECT 1 FROM recordings WHERE source_url = ?1 AND status = 'recording' LIMIT 1",
            [url],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if recording {
        return (true, String::new());
    }
    if let Err(error) = check_target(state, url).await {
        return (false, error.to_string());
    }
    match state
        .http
        .get(url)
        .timeout(Duration::from_secs(8))
        .send()
        .await
    {
        Ok(reply) if reply.status().is_success() => (true, String::new()),
        Ok(reply) => (false, format!("the provider answered {}", reply.status())),
        Err(error) => (false, error.to_string()),
    }
}

/// True when `latest` (like `v1.2.3`) is a newer version than `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    parts(latest) > parts(current)
}

/// Asks GitHub which release is the latest and remembers it for the status screen.
async fn check_update(state: &AppState) {
    if state.db.setting("update_check", "true") != "true" {
        let _ = state.db.set_setting("update_available", "");
        return;
    }
    let Ok(reply) = state
        .http
        .get("https://api.github.com/repos/aminegames125/vesper/releases/latest")
        .header("accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
    else {
        return;
    };
    let Ok(text) = reply.text().await else {
        return;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    let tag = json["tag_name"].as_str().unwrap_or("");
    let value = if !tag.is_empty() && is_newer(tag, env!("CARGO_PKG_VERSION")) {
        tag
    } else {
        ""
    };
    let _ = state.db.set_setting("update_available", value);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare_by_number_not_by_text() {
        assert!(is_newer("v0.15.0", "0.14.9"));
        assert!(is_newer("v0.10.0", "0.9.0"));
        assert!(!is_newer("v0.14.0", "0.14.0"));
        assert!(!is_newer("v0.13.5", "0.14.0"));
    }
}
