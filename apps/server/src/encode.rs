//! Video encoders a download can be converted with. `copy` keeps the original and needs no ffmpeg.
//! Everything else needs ffmpeg, and hardware encoders also need the matching GPU.

use std::{path::Path, process::Stdio, sync::OnceLock, time::Duration};

use serde_json::{json, Value};

use crate::ffmpeg;

pub struct Encoder {
    pub id: &'static str,
    pub label: &'static str,
    /// `software`, `hardware` or `copy`.
    pub kind: &'static str,
    /// The ffmpeg encoder name; empty for `copy`.
    pub codec: &'static str,
    /// Extra output arguments that go with the codec.
    pub args: &'static [&'static str],
}

pub const DEFAULT: &str = "copy";

pub const ENCODERS: &[Encoder] = &[
    Encoder {
        id: "copy",
        label: "Original (no re-encode)",
        kind: "copy",
        codec: "",
        args: &[],
    },
    Encoder {
        id: "h264",
        label: "H.264 (x264)",
        kind: "software",
        codec: "libx264",
        args: &["-preset", "veryfast", "-crf", "22"],
    },
    Encoder {
        id: "h265",
        label: "H.265 / HEVC (x265)",
        kind: "software",
        codec: "libx265",
        args: &["-preset", "veryfast", "-crf", "26", "-tag:v", "hvc1"],
    },
    Encoder {
        id: "av1",
        label: "AV1 (SVT-AV1)",
        kind: "software",
        codec: "libsvtav1",
        args: &["-preset", "8", "-crf", "34"],
    },
    Encoder {
        id: "vp9",
        label: "VP9",
        kind: "software",
        codec: "libvpx-vp9",
        args: &["-b:v", "0", "-crf", "32", "-row-mt", "1"],
    },
    Encoder {
        id: "h264_nvenc",
        label: "H.264 (NVIDIA NVENC)",
        kind: "hardware",
        codec: "h264_nvenc",
        args: &["-preset", "p4", "-cq", "23"],
    },
    Encoder {
        id: "h265_nvenc",
        label: "H.265 (NVIDIA NVENC)",
        kind: "hardware",
        codec: "hevc_nvenc",
        args: &["-preset", "p4", "-cq", "27", "-tag:v", "hvc1"],
    },
    Encoder {
        id: "h264_qsv",
        label: "H.264 (Intel Quick Sync)",
        kind: "hardware",
        codec: "h264_qsv",
        args: &["-global_quality", "23"],
    },
    Encoder {
        id: "h265_qsv",
        label: "H.265 (Intel Quick Sync)",
        kind: "hardware",
        codec: "hevc_qsv",
        args: &["-global_quality", "27", "-tag:v", "hvc1"],
    },
    Encoder {
        id: "h264_amf",
        label: "H.264 (AMD AMF)",
        kind: "hardware",
        codec: "h264_amf",
        args: &["-quality", "balanced"],
    },
    Encoder {
        id: "h265_amf",
        label: "H.265 (AMD AMF)",
        kind: "hardware",
        codec: "hevc_amf",
        args: &["-quality", "balanced", "-tag:v", "hvc1"],
    },
    Encoder {
        id: "h264_vt",
        label: "H.264 (Apple VideoToolbox)",
        kind: "hardware",
        codec: "h264_videotoolbox",
        args: &["-q:v", "55"],
    },
    Encoder {
        id: "h265_vt",
        label: "H.265 (Apple VideoToolbox)",
        kind: "hardware",
        codec: "hevc_videotoolbox",
        args: &["-q:v", "55", "-tag:v", "hvc1"],
    },
];

pub fn find(id: &str) -> Option<&'static Encoder> {
    ENCODERS.iter().find(|e| e.id == id)
}

/// The ffmpeg encoder names this machine's ffmpeg was built with. Read once.
fn built_in() -> &'static str {
    static LIST: OnceLock<String> = OnceLock::new();
    LIST.get_or_init(|| {
        if !ffmpeg::available() {
            return String::new();
        }
        std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-encoders"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    })
}

pub fn usable(encoder: &Encoder) -> bool {
    encoder.kind == "copy"
        || (ffmpeg::available()
            && built_in()
                .lines()
                .any(|line| line.split_whitespace().nth(1) == Some(encoder.codec)))
}

/// What the admin panel and Kodi offer in their pickers.
pub fn listing() -> Vec<Value> {
    ENCODERS
        .iter()
        .map(|e| json!({ "id": e.id, "label": e.label, "kind": e.kind, "available": usable(e) }))
        .collect()
}

/// `Some(id)` when `id` is a known encoder this machine can run.
pub fn validate(id: &str) -> Result<&'static Encoder, String> {
    let encoder = find(id).ok_or_else(|| format!("Unknown encoder \"{id}\"."))?;
    if usable(encoder) {
        Ok(encoder)
    } else {
        Err(format!(
            "{} is not available on this server.",
            encoder.label
        ))
    }
}

/// Re-encodes `input` into `output` (an `.mp4`). True on success.
pub async fn transcode(input: &Path, output: &Path, encoder: &Encoder) -> bool {
    let (input, output) = (input.to_string_lossy(), output.to_string_lossy());
    let mut args: Vec<&str> = vec![
        "-i",
        &input,
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c:v",
        encoder.codec,
    ];
    args.extend_from_slice(encoder.args);
    args.extend_from_slice(&[
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        &output,
    ]);
    ffmpeg::run(&args, Duration::from_secs(6 * 3600)).await
}

/// ffmpeg arguments for yt-dlp's post-processor, so it converts while it merges.
pub fn ytdlp_args(encoder: &Encoder) -> String {
    let mut parts = vec!["-c:v".to_string(), encoder.codec.to_string()];
    parts.extend(encoder.args.iter().map(|a| a.to_string()));
    parts.extend(["-c:a", "aac", "-b:a", "160k"].map(String::from));
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_is_always_usable_and_ids_are_unique() {
        assert!(usable(find("copy").unwrap()));
        let mut ids: Vec<_> = ENCODERS.iter().map(|e| e.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), ENCODERS.len());
        assert!(find("nope").is_none());
    }

    #[test]
    fn ytdlp_args_name_the_codec() {
        let args = ytdlp_args(find("h264").unwrap());
        assert!(args.starts_with("-c:v libx264"));
        assert!(args.contains("-c:a aac"));
    }
}
