//! yt-dlp is optional. When it is on the PATH the server can save pages that are not plain files:
//! YouTube videos and live streams, Twitch, Vimeo and the other sites yt-dlp knows.

use std::{
    path::Path,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    time::{Duration, Instant},
};

use rusqlite::params;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

use crate::{
    download::Ended,
    encode,
    jobs::{free_disk, storage_used, MIN_FREE_BYTES},
    state::AppState,
};

/// The installed version, or None when yt-dlp is not on the PATH. Checked once.
pub fn version() -> Option<&'static str> {
    static FOUND: OnceLock<Option<String>> = OnceLock::new();
    FOUND
        .get_or_init(|| {
            let out = std::process::Command::new("yt-dlp")
                .arg("--version")
                .stdin(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .ok()
                .filter(|o| o.status.success())?;
            Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
        })
        .as_deref()
}

pub fn available() -> bool {
    version().is_some()
}

/// yt-dlp's `-f` expression for a quality choice.
pub fn format_for(choice: &str) -> Option<&'static str> {
    Some(match choice {
        "best" | "" => "bv*+ba/b",
        "2160" => "bv*[height<=2160]+ba/b[height<=2160]",
        "1080" => "bv*[height<=1080]+ba/b[height<=1080]",
        "720" => "bv*[height<=720]+ba/b[height<=720]",
        "480" => "bv*[height<=480]+ba/b[height<=480]",
        "audio" => "ba/b",
        _ => return None,
    })
}

/// Addresses that are a web page rather than a media file, so yt-dlp should take them.
pub fn looks_like_a_page(url: &str) -> bool {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let file = path.rsplit('/').next().unwrap_or("");
    let is_file = file
        .rsplit_once('.')
        .is_some_and(|(_, ext)| ["mp4", "mkv", "avi", "mov", "m4v", "webm", "ts"].contains(&ext));
    !is_file
}

/// What a yt-dlp download is asked to do.
pub struct Request<'a> {
    pub url: &'a str,
    pub quality: &'a str,
    pub encoder: &'a str,
    /// A live stream: keep what was captured when stopped, instead of throwing it away.
    pub live: bool,
}

/// Downloads into `dir` as `file.<ext>`. The caller finds the finished file with `settled_file`.
pub async fn fetch(
    state: &AppState,
    id: &str,
    user_id: &str,
    dir: &Path,
    request: &Request<'_>,
    stop: &AtomicBool,
    started: Instant,
) -> Result<Ended, String> {
    if !available() {
        return Err("yt-dlp is not installed on this server.".into());
    }
    let format = format_for(request.quality).ok_or("Unknown quality.")?;
    let encoder = encode::validate(request.encoder)?;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| format!("Could not create the folder: {e}"))?;

    let mut command = Command::new("yt-dlp");
    command
        .args([
            "--ignore-config",
            "--no-playlist",
            "--newline",
            "--no-colors",
            "--no-warnings",
        ])
        .args(["--socket-timeout", "30", "--retries", "5", "--fragment-retries", "10"])
        .args([
            "--progress-template",
            "download:%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
        ]);
    if request.live {
        // One muxed stream written straight to its final name, so stopping leaves a playable file.
        command.args(["-f", "b/bv*+ba", "--no-part", "--hls-use-mpegts"]);
    } else {
        command.args(["-f", format]);
        if request.quality == "audio" {
            command.args(["-x", "--audio-format", "mp3"]);
        } else {
            command.args(["--merge-output-format", "mp4"]);
            if encoder.kind != "copy" {
                command.args(["--recode-video", "mp4"]).args([
                    "--postprocessor-args",
                    &format!("VideoConvertor:{}", encode::ytdlp_args(encoder)),
                ]);
            }
        }
    }
    command
        .arg("-o")
        .arg(dir.join("file.%(ext)s"))
        // Everything after `--` is the address, never an option.
        .args(["--", request.url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start yt-dlp: {e}"))?;

    let stderr = child.stderr.take();
    let tail = tokio::spawn(async move {
        let mut last = String::new();
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("ERROR") {
                    last = line;
                }
            }
        }
        last
    });
    let stdout = child.stdout.take().ok_or("yt-dlp gave no output.")?;
    let mut lines = BufReader::new(stdout).lines();
    let storage: i64 = state
        .db
        .conn()
        .query_row(
            "SELECT storage_bytes FROM users WHERE id = ?1",
            [user_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut last_report = Instant::now() - Duration::from_secs(2);
    let mut beats = 0u32;
    let mut closed = false;

    while !closed {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) => {
                    let Some(rest) = line.strip_prefix("download:") else { continue };
                    if last_report.elapsed() < Duration::from_secs(1) {
                        continue;
                    }
                    last_report = Instant::now();
                    beats += 1;
                    let mut numbers = rest.split_whitespace().map(|n| n.parse::<f64>().ok());
                    let done = numbers.next().flatten().unwrap_or(0.0) as i64;
                    let total = numbers.next().flatten().or_else(|| numbers.next().flatten());
                    let _ = state.db.conn().execute(
                        "UPDATE recordings SET bytes = ?1, seconds = ?2, total_bytes = COALESCE(?3, total_bytes) WHERE id = ?4",
                        params![done, started.elapsed().as_secs() as i64, total.map(|t| t as i64), id],
                    );
                    let reason = if storage > 0 && storage_used(state, user_id) >= storage {
                        Some("Your cloud storage is full.")
                    } else if beats.is_multiple_of(10)
                        && free_disk(state).is_some_and(|f| f < MIN_FREE_BYTES / 2)
                    {
                        Some("The server's disk is almost full.")
                    } else {
                        None
                    };
                    if let Some(reason) = reason {
                        let _ = child.kill().await;
                        return Ok(Ended::Full(reason));
                    }
                }
                _ => closed = true,
            },
            _ = tokio::time::sleep(Duration::from_millis(500)) => {}
        }
        if stop.load(Ordering::Relaxed) {
            let _ = child.kill().await;
            return Ok(if request.live && settled_file(dir).await.is_some() {
                Ended::Complete
            } else {
                Ended::Stopped
            });
        }
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let error = tail.await.unwrap_or_default();
    if !status.success() {
        let why = error.trim_start_matches("ERROR:").trim();
        return Err(if why.is_empty() {
            "yt-dlp could not save that address.".into()
        } else {
            why.chars().take(200).collect()
        });
    }
    settled_file(dir)
        .await
        .ok_or("yt-dlp finished but left no file.")?;
    Ok(Ended::Complete)
}

/// The biggest finished media file in `dir`.
pub async fn settled_file(dir: &Path) -> Option<String> {
    let mut best: Option<(u64, String)> = None;
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("file.")
            || [".part", ".ytdl", ".temp"]
                .iter()
                .any(|s| name.ends_with(s))
        {
            continue;
        }
        let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
        if size > 0 && best.as_ref().is_none_or(|(b, _)| size > *b) {
            best = Some((size, name));
        }
    }
    best.map(|(_, name)| name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_go_to_ytdlp_and_files_do_not() {
        assert!(looks_like_a_page("https://www.youtube.com/watch?v=abc"));
        assert!(looks_like_a_page("https://twitch.tv/somebody"));
        assert!(!looks_like_a_page("http://h/movie/1/2/3.mkv"));
        assert!(!looks_like_a_page("http://h/a/b.MP4?token=x"));
    }

    #[test]
    fn only_known_qualities_map_to_a_format() {
        assert!(format_for("1080").is_some());
        assert!(format_for("audio").is_some());
        assert!(format_for("; rm -rf").is_none());
    }
}
