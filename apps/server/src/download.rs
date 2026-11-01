//! Saving a movie or episode file from a source address to the server, with resume and progress.

use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use reqwest::header;
use rusqlite::params;
use tokio::io::AsyncWriteExt;

use crate::{
    db::now,
    encode,
    jobs::{free_disk, recording_dir, remove_files, storage_used, MIN_FREE_BYTES},
    net::check_target,
    state::AppState,
    ytdlp,
};

/// Extensions a saved file may keep; anything else is stored as `.mp4`.
const EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "m4v", "webm", "ts"];

/// `file.<ext>` where the extension comes from the address when it looks like a video.
pub fn file_name_for(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or("");
    let ext = path
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .filter(|ext| EXTENSIONS.contains(&ext.as_str()))
        .unwrap_or_else(|| "mp4".into());
    format!("file.{ext}")
}

pub enum Ended {
    Complete,
    Stopped,
    /// The account's storage or the disk ran out.
    Full(&'static str),
}

/// Runs a download to the end and records how it went.
pub async fn run(
    state: AppState,
    id: String,
    user_id: String,
    url: String,
    keep_hours: Option<i64>,
    stop: Arc<AtomicBool>,
) {
    let started = Instant::now();
    let dir = recording_dir(&state, &user_id, &id);
    let (engine, encoder, quality, live): (String, String, String, bool) = state
        .db
        .conn()
        .query_row(
            "SELECT engine, encoder, dl_quality, live FROM recordings WHERE id = ?1",
            [&id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? != 0)),
        )
        .unwrap_or_else(|_| ("direct".into(), "copy".into(), "best".into(), false));
    let mut outcome = if engine == "ytdlp" {
        let request = ytdlp::Request {
            url: &url,
            quality: &quality,
            encoder: &encoder,
            live,
        };
        ytdlp::fetch(&state, &id, &user_id, &dir, &request, &stop, started).await
    } else {
        fetch(&state, &id, &user_id, &url, &dir, &stop, started).await
    };
    state
        .jobs
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(&id);

    let mut name = if engine == "ytdlp" {
        ytdlp::settled_file(&dir)
            .await
            .unwrap_or_else(|| file_name_for(&url))
    } else {
        file_name_for(&url)
    };
    // A direct file is converted afterwards; yt-dlp already converted while it merged.
    if engine != "ytdlp" && encoder != "copy" && matches!(outcome, Ok(Ended::Complete)) {
        match encode::validate(&encoder) {
            Ok(chosen) => {
                let input = dir.join(&name);
                let output = dir.join("encoded.mp4");
                if encode::transcode(&input, &output, chosen).await {
                    let _ = tokio::fs::remove_file(&input).await;
                    let _ = tokio::fs::rename(&output, dir.join("file.mp4")).await;
                    name = "file.mp4".into();
                } else {
                    let _ = tokio::fs::remove_file(&output).await;
                    outcome = Err("The conversion failed. The original was not kept.".into());
                }
            }
            Err(e) => outcome = Err(e),
        }
    }
    let _ = state.db.conn().execute(
        "UPDATE recordings SET file_name = ?1 WHERE id = ?2",
        params![name, id],
    );
    let size = std::fs::metadata(dir.join(&name))
        .map(|m| m.len() as i64)
        .unwrap_or(0);
    let finished = now();
    let seconds = started.elapsed().as_secs() as i64;
    match outcome {
        Ok(Ended::Complete) => {
            let until = keep_hours.filter(|h| *h > 0).map(|h| finished + h * 3600);
            let _ = state.db.conn().execute(
                "UPDATE recordings SET status = 'done', bytes = ?1, total_bytes = ?1, seconds = ?2, finished_at = ?3, keep_until = ?4 WHERE id = ?5",
                params![size, seconds, finished, until, id],
            );
        }
        Ok(Ended::Stopped) | Ok(Ended::Full(_)) | Err(_) => {
            // A half-saved movie is not worth keeping.
            let reason = match &outcome {
                Ok(Ended::Full(reason)) => (*reason).to_string(),
                Ok(_) => "Stopped.".to_string(),
                Err(e) => e.clone(),
            };
            remove_files(&state, &user_id, &id);
            let _ = state.db.conn().execute(
                "UPDATE recordings SET status = 'failed', error = ?1, bytes = 0, finished_at = ?2 WHERE id = ?3",
                params![reason, finished, id],
            );
        }
    }
    state.db.audit("system", "download.finished", &id);
    // Reuses the recording hook so webhooks and thumbnails work for downloads too.
    let runtime = tokio::runtime::Handle::try_current().ok();
    crate::jobs::after_download(&state, &id, runtime);
}

async fn fetch(
    state: &AppState,
    id: &str,
    user_id: &str,
    url: &str,
    dir: &Path,
    stop: &AtomicBool,
    started: Instant,
) -> Result<Ended, String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("Could not create the folder: {e}"))?;
    let name = file_name_for(url);
    let path = dir.join(&name);
    let _ = state.db.conn().execute(
        "UPDATE recordings SET file_name = ?1 WHERE id = ?2",
        params![name, id],
    );

    let mut failures = 0u32;
    loop {
        if stop.load(Ordering::Relaxed) {
            return Ok(Ended::Stopped);
        }
        let have = tokio::fs::metadata(&path)
            .await
            .map(|m| m.len())
            .unwrap_or(0);
        match attempt(state, id, user_id, url, &path, have, stop, started).await {
            Ok(ended) => return Ok(ended),
            Err(error) => {
                failures += 1;
                if failures >= 5 {
                    return Err(error);
                }
                // The next try resumes from what is already on disk.
                for _ in 0..(5 * failures) {
                    if stop.load(Ordering::Relaxed) {
                        return Ok(Ended::Stopped);
                    }
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
}

/// One connection: from byte `have` to the end of the file, or until it breaks.
#[allow(clippy::too_many_arguments)]
async fn attempt(
    state: &AppState,
    id: &str,
    user_id: &str,
    url: &str,
    path: &Path,
    have: u64,
    stop: &AtomicBool,
    started: Instant,
) -> Result<Ended, String> {
    // Follow redirects by hand so every address is checked, as the playlist download does.
    let mut target = check_target(state, url).await.map_err(|e| e.to_string())?;
    let mut reply = None;
    for _ in 0..5 {
        let mut request = state.http.get(target.clone());
        if have > 0 {
            request = request.header(header::RANGE, format!("bytes={have}-"));
        }
        let response = request
            .send()
            .await
            .map_err(|e| format!("Could not reach the address: {e}"))?;
        if response.status().is_redirection() {
            let next = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|loc| target.join(loc).ok())
                .ok_or("The address redirected somewhere invalid.")?;
            check_target(state, next.as_str())
                .await
                .map_err(|e| e.to_string())?;
            target = next;
            continue;
        }
        reply = Some(response);
        break;
    }
    let mut reply = reply.ok_or("Too many redirects.")?;
    let status = reply.status();
    // Asking for bytes past the end means the whole file is already here.
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && have > 0 {
        return Ok(Ended::Complete);
    }
    if !status.is_success() {
        return Err(format!("The provider answered {status}."));
    }
    // 206 continues the file; 200 sends it all again, so start over.
    let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT && have > 0;
    let offset = if resumed { have } else { 0 };
    let total = reply.content_length().map(|n| n + offset);
    if let Some(total) = total {
        let _ = state.db.conn().execute(
            "UPDATE recordings SET total_bytes = ?1 WHERE id = ?2",
            params![total as i64, id],
        );
        if free_disk(state).is_some_and(|free| free < total.saturating_sub(offset) + MIN_FREE_BYTES)
        {
            return Ok(Ended::Full("Not enough room on the server's disk."));
        }
    }

    let mut file = if resumed {
        tokio::fs::OpenOptions::new().append(true).open(path).await
    } else {
        tokio::fs::File::create(path).await
    }
    .map_err(|e| format!("Could not write the file: {e}"))?;

    let storage: i64 = state
        .db
        .conn()
        .query_row(
            "SELECT storage_bytes FROM users WHERE id = ?1",
            [user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut written = offset;
    let mut last_report = Instant::now();
    let mut beats = 0u32;
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(30), reply.chunk())
        .await
        .map_err(|_| "The download stalled.".to_string())?
        .map_err(|e| format!("The download broke: {e}"))?
    {
        if stop.load(Ordering::Relaxed) {
            return Ok(Ended::Stopped);
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Could not write the file: {e}"))?;
        written += chunk.len() as u64;
        if last_report.elapsed() >= Duration::from_secs(1) {
            last_report = Instant::now();
            beats += 1;
            let _ = state.db.conn().execute(
                "UPDATE recordings SET bytes = ?1, seconds = ?2 WHERE id = ?3",
                params![written as i64, started.elapsed().as_secs() as i64, id],
            );
            if storage > 0 && storage_used(state, user_id) >= storage {
                return Ok(Ended::Full("Your cloud storage is full."));
            }
            if beats.is_multiple_of(10)
                && free_disk(state).is_some_and(|free| free < MIN_FREE_BYTES / 2)
            {
                return Ok(Ended::Full("The server's disk is almost full."));
            }
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("Could not write the file: {e}"))?;
    // A connection that closed early left the file short: ask for the rest.
    if total.is_some_and(|total| written < total) {
        return Err("The connection closed before the file was complete.".into());
    }
    if written == 0 {
        return Err("The address sent nothing.".into());
    }
    Ok(Ended::Complete)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_extension_comes_from_the_address() {
        assert_eq!(file_name_for("http://h/movie/1/2/3.mkv"), "file.mkv");
        assert_eq!(file_name_for("http://h/a/b.MP4?token=x"), "file.mp4");
        assert_eq!(file_name_for("http://h/stream"), "file.mp4");
        assert_eq!(file_name_for("http://h/a.php"), "file.mp4");
    }
}
