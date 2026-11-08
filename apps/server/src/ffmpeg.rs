//! ffmpeg is optional. When it is on the PATH the server can make thumbnails, export MP4 and trim;
//! without it those buttons are simply not offered.

use std::{path::Path, process::Stdio, sync::OnceLock, time::Duration};

use tokio::process::Command;

fn binary() -> &'static str {
    "ffmpeg"
}

/// True when `ffmpeg -version` runs. Checked once.
pub fn available() -> bool {
    static FOUND: OnceLock<bool> = OnceLock::new();
    *FOUND.get_or_init(|| {
        std::process::Command::new(binary())
            .arg("-version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    })
}

/// Runs ffmpeg with `args`, giving up (and killing it) after `limit`. True on a clean exit.
pub async fn run(args: &[&str], limit: Duration) -> bool {
    if !available() {
        return false;
    }
    // Only a couple at a time, so a burst of requests cannot start hundreds of processes.
    static SLOTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
    let Ok(_slot) = SLOTS.acquire().await else {
        return false;
    };
    let Ok(mut child) = Command::new(binary())
        .args(["-hide_banner", "-loglevel", "error", "-y", "-nostdin"])
        // The files are local; never let a crafted playlist reach elsewhere.
        .args(["-protocol_whitelist", "file,crypto"])
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    else {
        return false;
    };
    match tokio::time::timeout(limit, child.wait()).await {
        Ok(Ok(status)) => status.success(),
        _ => {
            let _ = child.kill().await;
            false
        }
    }
}

/// The video codec of `input` (`h264`, `hevc`, `mpeg2video`, ...), read from what `ffmpeg -i` prints.
pub async fn video_codec(input: &Path) -> Option<String> {
    if !available() {
        return None;
    }
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        Command::new(binary())
            .args([
                "-hide_banner",
                "-nostdin",
                "-protocol_whitelist",
                "file,crypto",
                "-i",
            ])
            .arg(input)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    // "Stream #0:0: Video: h264 (High), yuv420p, ..." -- the word after "Video:" is the codec.
    String::from_utf8_lossy(&output.stderr)
        .lines()
        .find_map(|line| line.split("Video: ").nth(1))
        .and_then(|rest| rest.split([' ', ',', '(']).next())
        .map(str::to_string)
        .filter(|codec| !codec.is_empty())
}

/// Writes one frame of `input` as a small JPEG.
pub async fn thumbnail(input: &Path, output: &Path) -> bool {
    let (input, output) = (input.to_string_lossy(), output.to_string_lossy());
    for at in ["4", "0"] {
        let args = [
            "-ss",
            at,
            "-i",
            input.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            output.as_ref(),
        ];
        if run(&args, Duration::from_secs(60)).await {
            return true;
        }
    }
    false
}
