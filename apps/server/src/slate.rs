//! The waiting screen an external player gets at a recording's short address before the recording
//! has any video. The address is a live HLS playlist of one short, looping clip (the Vesper screen);
//! the moment the recording has video, the same address carries on with it, so the player never
//! has to be reopened. A player that was never shown the screen gets the plain recording instead.

use std::{
    collections::HashMap,
    sync::{Mutex, MutexGuard, OnceLock},
};

/// One looping clip: 4 seconds of the Vesper screen, H.264 and silent AAC, in an MPEG transport stream.
pub const CLIP: &[u8] = include_bytes!("../assets/slate.ts");

/// Length of the clip, in seconds.
const CLIP_SECONDS: i64 = 4;
/// How many clips the waiting playlist lists at once.
const WAITING_WINDOW: i64 = 3;
/// How many of the newest real segments the live playlist lists while the recording runs.
const LIVE_WINDOW: usize = 6;

/// Recordings whose address has shown the waiting screen, and the sequence number their first real
/// segment was given (decided on the first request that sees video).
fn waited() -> MutexGuard<'static, HashMap<String, Option<i64>>> {
    static WAITED: OnceLock<Mutex<HashMap<String, Option<i64>>>> = OnceLock::new();
    WAITED
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|p| p.into_inner())
}

/// True when this recording's address has already shown the waiting screen to someone.
pub fn was_waiting(id: &str) -> bool {
    waited().contains_key(id)
}

/// The sequence number in a clip's address (`slate123.ts`), if it is one.
pub fn clip_number(name: &str) -> Option<i64> {
    name.strip_prefix("slate")?
        .strip_suffix(".ts")?
        .parse::<i64>()
        .ok()
        .filter(|n| *n >= 0)
}

/// The playlist of the waiting screen at time `at` (epoch seconds). Every clip is a new segment to
/// the player, with a discontinuity before it because the clip's timestamps start over each time.
pub fn waiting_playlist(code: &str, id: &str, at: i64) -> String {
    waited().entry(id.to_string()).or_insert(None);
    let newest = at / CLIP_SECONDS;
    let first = newest - (WAITING_WINDOW - 1);
    let mut text = format!(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:{CLIP_SECONDS}\n#EXT-X-MEDIA-SEQUENCE:{first}\n#EXT-X-DISCONTINUITY-SEQUENCE:{first}\n"
    );
    for number in first..=newest {
        text.push_str(&format!(
            "#EXT-X-DISCONTINUITY\n#EXTINF:{CLIP_SECONDS}.000,\n{code}/slate{number}.ts\n"
        ));
    }
    text
}

/// The recording's real segments as the continuation of the waiting screen: numbered after the last
/// clip that was served, with a discontinuity where the picture changes. `raw` is the recorder's own
/// playlist. While the recording runs only the newest segments are listed (a live window); once it
/// has ended, all of them are, with an end marker.
pub fn live_playlist(code: &str, id: &str, raw: &str, at: i64) -> String {
    let base = {
        let mut map = waited();
        let slot = map.entry(id.to_string()).or_insert(None);
        *slot.get_or_insert(at / CLIP_SECONDS + 1)
    };
    let mut segments: Vec<(f32, &str)> = Vec::new();
    let mut length = CLIP_SECONDS as f32;
    for line in raw.lines().map(str::trim) {
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            length = rest
                .split(',')
                .next()
                .and_then(|v| v.parse().ok())
                .unwrap_or(length);
        } else if !line.is_empty() && !line.starts_with('#') {
            segments.push((length, line));
        }
    }
    let ended = raw.contains("#EXT-X-ENDLIST");
    let first = if ended {
        0
    } else {
        segments.len().saturating_sub(LIVE_WINDOW)
    };
    let target = segments
        .iter()
        .map(|(d, _)| d.ceil() as i64)
        .max()
        .unwrap_or(CLIP_SECONDS)
        .max(1);
    // Every number before `base` was a clip with a discontinuity; the first real segment adds one.
    let discontinuities = base + i64::from(first > 0);
    let mut text = format!(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:{target}\n#EXT-X-MEDIA-SEQUENCE:{}\n#EXT-X-DISCONTINUITY-SEQUENCE:{discontinuities}\n",
        base + first as i64
    );
    for (index, (seconds, name)) in segments.iter().enumerate().skip(first) {
        if index == 0 {
            text.push_str("#EXT-X-DISCONTINUITY\n");
        }
        text.push_str(&format!("#EXTINF:{seconds:.3},\n{code}/{name}\n"));
    }
    if ended {
        text.push_str("#EXT-X-ENDLIST\n");
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_are_named_by_number() {
        assert_eq!(clip_number("slate42.ts"), Some(42));
        assert_eq!(clip_number("slate.ts"), None);
        assert_eq!(clip_number("seg00001.ts"), None);
        assert_eq!(clip_number("slate-1.ts"), None);
    }

    #[test]
    fn the_waiting_playlist_slides_forward_with_time() {
        let a = waiting_playlist("c", "wait-a", 4_000);
        let b = waiting_playlist("c", "wait-a", 4_004);
        assert!(a.contains("#EXT-X-MEDIA-SEQUENCE:998\n"));
        assert!(b.contains("#EXT-X-MEDIA-SEQUENCE:999\n"));
        assert_eq!(a.matches("c/slate").count(), 3);
        assert!(a.contains("#EXT-X-DISCONTINUITY-SEQUENCE:998\n"));
        assert!(!a.contains("ENDLIST"));
        assert!(was_waiting("wait-a"));
    }

    #[test]
    fn video_carries_on_after_the_last_clip() {
        let raw =
            "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg00000.ts\n#EXTINF:2.0,\nseg00001.ts\n";
        waiting_playlist("c", "wait-b", 4_000);
        let live = live_playlist("c", "wait-b", raw, 4_010);
        // Decided at the first request that sees video: the number after the newest clip by then.
        assert!(live.contains("#EXT-X-MEDIA-SEQUENCE:1003\n"));
        assert!(live.contains("#EXT-X-DISCONTINUITY\n#EXTINF:2.000,\nc/seg00000.ts\n"));
        assert!(!live.contains("ENDLIST"));
        // A later request keeps the same numbering.
        let later = live_playlist("c", "wait-b", raw, 4_100);
        assert!(later.contains("#EXT-X-MEDIA-SEQUENCE:1003\n"));
    }

    #[test]
    fn a_long_recording_lists_only_the_newest_segments_until_it_ends() {
        let mut raw = String::from("#EXTM3U\n#EXT-X-TARGETDURATION:2\n");
        for i in 0..20 {
            raw.push_str(&format!("#EXTINF:2.0,\nseg{i:05}.ts\n"));
        }
        waiting_playlist("c", "wait-c", 400);
        let running = live_playlist("c", "wait-c", &raw, 400);
        assert_eq!(running.matches("c/seg").count(), 6);
        assert!(!running.contains("#EXT-X-DISCONTINUITY\n"));
        raw.push_str("#EXT-X-ENDLIST\n");
        let done = live_playlist("c", "wait-c", &raw, 600);
        assert_eq!(done.matches("c/seg").count(), 20);
        assert!(done.trim_end().ends_with("#EXT-X-ENDLIST"));
    }
}
