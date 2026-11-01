use std::{
    collections::{HashMap, HashSet},
    io::Read,
    thread,
    time::{Duration, Instant},
};

use reqwest::{blocking::Client, Url};

use crate::{mpegts, sink::Sink, Error, Progress, Result, Run};

pub(crate) struct Media {
    pub target: u64,
    pub ended: bool,
    pub encrypted: bool,
    /// Number of the first listed segment (`#EXT-X-MEDIA-SEQUENCE`), so the matching segment of a
    /// separate audio rendition can be found even when the two playlists start at different points.
    pub sequence: u64,
    /// Segment address and its duration in seconds.
    pub segments: Vec<(Url, f32)>,
}

pub(crate) struct Master {
    pub variant: Url,
    /// The separate audio playlist, when the chosen variant keeps its sound in its own rendition.
    pub audio: Option<Url>,
    /// True when the variant names an `AUDIO` group, whether or not its rendition was found.
    pub demuxed: bool,
}

pub(crate) enum Playlist {
    Master(Master),
    Media(Media),
}

/// Reads a playlist body. A master playlist resolves to its highest-bandwidth variant.
#[cfg(test)]
pub(crate) fn parse(body: &str, base: &Url) -> Result<Playlist> {
    parse_with(body, base, false)
}

/// Like [`parse`], but a master playlist can resolve to its smallest variant to save disk space.
pub(crate) fn parse_with(body: &str, base: &Url, lowest: bool) -> Result<Playlist> {
    let lines: Vec<&str> = body.lines().map(str::trim).collect();

    if lines.iter().any(|l| l.starts_with("#EXT-X-STREAM-INF")) {
        let mut best: Option<(u64, &str, &str)> = None;
        // A variant that names an AUDIO group keeps its sound in a separate playlist. That sound is
        // still recordable by joining the two renditions, so a self-contained variant is merely
        // preferred rather than required.
        let any_muxed = lines.iter().any(|l| {
            l.strip_prefix("#EXT-X-STREAM-INF:")
                .is_some_and(|attrs| attr_value(attrs, "AUDIO").is_none())
        });
        for (i, line) in lines.iter().enumerate() {
            let Some(attrs) = line.strip_prefix("#EXT-X-STREAM-INF:") else {
                continue;
            };
            if any_muxed && attr_value(attrs, "AUDIO").is_some() {
                continue;
            }
            let bandwidth = attrs
                .split(',')
                .find_map(|a| a.trim().strip_prefix("BANDWIDTH="))
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            let Some(uri) = lines[i + 1..]
                .iter()
                .find(|l| !l.is_empty() && !l.starts_with('#'))
            else {
                continue;
            };
            let better = |b: u64| {
                if lowest {
                    bandwidth <= b
                } else {
                    bandwidth >= b
                }
            };
            if best.is_none_or(|(b, _, _)| better(b)) {
                best = Some((bandwidth, uri, attrs));
            }
        }
        let (_, uri, attrs) = best.ok_or(Error::NoStreams)?;
        let variant = base.join(uri).map_err(|_| Error::BadUrl)?;
        let group = attr_value(attrs, "AUDIO");
        let audio = group
            .as_deref()
            .and_then(|group| audio_rendition(&lines, group, base));
        return Ok(Playlist::Master(Master {
            variant,
            audio,
            demuxed: group.is_some(),
        }));
    }

    let target = lines
        .iter()
        .find_map(|l| l.strip_prefix("#EXT-X-TARGETDURATION:"))
        .and_then(|v| v.parse().ok())
        .unwrap_or(4);
    let sequence = lines
        .iter()
        .find_map(|l| l.strip_prefix("#EXT-X-MEDIA-SEQUENCE:"))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0);
    let mut segments = Vec::new();
    let mut duration = target as f32;
    for line in &lines {
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            duration = rest
                .split(',')
                .next()
                .and_then(|v| v.parse().ok())
                .unwrap_or(duration);
        } else if !line.is_empty() && !line.starts_with('#') {
            segments.push((base.join(line).map_err(|_| Error::BadUrl)?, duration));
        }
    }
    Ok(Playlist::Media(Media {
        target,
        ended: lines.iter().any(|l| l.starts_with("#EXT-X-ENDLIST")),
        encrypted: lines
            .iter()
            .any(|l| l.starts_with("#EXT-X-KEY") && !l.contains("METHOD=NONE")),
        sequence,
        segments,
    }))
}

/// The value of `key` in a playlist attribute list. Values may hold commas inside quotes.
fn attr_value(attrs: &str, key: &str) -> Option<String> {
    let mut rest = attrs;
    while !rest.is_empty() {
        rest = rest.trim_start_matches([',', ' ', '\t']);
        let eq = rest.find('=')?;
        let name = rest[..eq].trim();
        let value = &rest[eq + 1..];
        if let Some(quoted) = value.strip_prefix('"') {
            let end = quoted.find('"')?;
            if name.eq_ignore_ascii_case(key) {
                return Some(quoted[..end].to_string());
            }
            rest = &quoted[end + 1..];
        } else {
            let end = value.find(',').unwrap_or(value.len());
            if name.eq_ignore_ascii_case(key) {
                return Some(value[..end].trim().to_string());
            }
            rest = &value[end..];
        }
    }
    None
}

/// The playlist of the sound track in an `AUDIO` group, preferring the one marked as default.
fn audio_rendition(lines: &[&str], group: &str, base: &Url) -> Option<Url> {
    let mut first: Option<Url> = None;
    let mut preferred: Option<Url> = None;
    for line in lines {
        let Some(attrs) = line.strip_prefix("#EXT-X-MEDIA:") else {
            continue;
        };
        if !attr_value(attrs, "TYPE").is_some_and(|t| t.eq_ignore_ascii_case("AUDIO")) {
            continue;
        }
        if attr_value(attrs, "GROUP-ID").as_deref() != Some(group) {
            continue;
        }
        let Some(uri) = attr_value(attrs, "URI") else {
            continue;
        };
        let Ok(url) = base.join(&uri) else {
            continue;
        };
        if first.is_none() {
            first = Some(url.clone());
        }
        if attr_value(attrs, "DEFAULT").is_some_and(|d| d.eq_ignore_ascii_case("YES")) {
            preferred = Some(url);
        }
    }
    preferred.or(first)
}

fn fetch_text(client: &Client, url: &Url) -> std::result::Result<String, reqwest::Error> {
    client
        .get(url.clone())
        .timeout(Duration::from_secs(20))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
}

fn fetch_bytes(client: &Client, url: &Url) -> Option<Vec<u8>> {
    let mut response = client
        .get(url.clone())
        .timeout(Duration::from_secs(40))
        .send()
        .and_then(|r| r.error_for_status())
        .ok()?;
    let mut data = Vec::new();
    response.read_to_end(&mut data).ok()?;
    (!data.is_empty()).then_some(data)
}

/// Follows an HLS playlist, appending each new segment to the sink.
#[allow(clippy::too_many_arguments)]
pub(crate) fn record_hls<F: FnMut(Progress)>(
    client: &Client,
    start: Url,
    sink: &mut dyn Sink,
    run: &mut Run<'_, F>,
    lowest: bool,
    require_audio: bool,
) -> Result<()> {
    let mut url = start;
    let mut seen: HashSet<String> = HashSet::new();
    let mut first = true;
    let mut hops = 0;
    let mut failures = 0u32;
    let resume_after = sink.last_mark();
    // When the chosen variant keeps its sound in its own rendition, that playlist is followed too
    // and the two are joined segment by segment.
    let mut audio: Option<Url> = None;
    let mut audio_misses = 0u32;
    let mut muxed_any = false;

    loop {
        if run.done() {
            return Ok(());
        }
        if !run.allows(&url) {
            return Err(Error::Blocked);
        }
        let body = match fetch_text(client, &url) {
            Ok(body) => {
                failures = 0;
                body
            }
            Err(e) => {
                // A single failed fetch is normal on a live stream; give up only after several in a row.
                failures += 1;
                if failures >= 5 {
                    return Err(Error::Http(e.without_url().to_string()));
                }
                let until = Instant::now() + Duration::from_secs(2);
                while Instant::now() < until && !run.done() {
                    thread::sleep(Duration::from_millis(200));
                }
                continue;
            }
        };

        let media = match parse_with(&body, &url, lowest)? {
            Playlist::Master(master) => {
                // A master that points back at a master would otherwise loop forever.
                hops += 1;
                if hops > 5 {
                    return Err(Error::NoStreams);
                }
                // A variant whose sound is separate can only be recorded once the rendition is
                // known. Without one the caller is told, so it can try the channel's other address.
                if master.demuxed && master.audio.is_none() && require_audio {
                    return Err(Error::NoAudio);
                }
                audio = master.audio;
                url = master.variant;
                continue;
            }
            Playlist::Media(media) => media,
        };
        if media.encrypted {
            return Err(Error::Encrypted);
        }

        // The audio segments that cover the same moments, keyed by their absolute number.
        let mut audio_segments: HashMap<u64, Url> = HashMap::new();
        if let Some(track) = audio.clone() {
            let parsed = if run.allows(&track) {
                fetch_text(client, &track)
                    .ok()
                    .map(|body| parse_with(&body, &track, lowest))
            } else {
                None
            };
            match parsed {
                Some(Ok(Playlist::Media(tracks))) => {
                    for (offset, (segment, _)) in tracks.segments.iter().enumerate() {
                        audio_segments.insert(tracks.sequence + offset as u64, segment.clone());
                    }
                }
                _ => {
                    audio_misses += 1;
                    if require_audio && !muxed_any && audio_misses >= 4 {
                        return Err(Error::NoAudio);
                    }
                }
            }
        }

        // A live playlist lists the last minute or so; start from the live edge, not that backlog.
        if first && !media.ended {
            // After a reconnect, carry on right after the last segment we kept; otherwise start near the edge.
            let after = resume_after
                .as_deref()
                .and_then(|key| media.segments.iter().position(|(s, _)| s.path() == key));
            let skip = match after {
                Some(i) => i + 1,
                None if resume_after.is_some() => media.segments.len().saturating_sub(1),
                None => media.segments.len().saturating_sub(2),
            };
            for (segment, _) in &media.segments[..skip] {
                seen.insert(segment.to_string());
            }
        }
        first = false;

        for (offset, (segment, seconds)) in media.segments.iter().enumerate() {
            if run.done() {
                return Ok(());
            }
            if !seen.insert(segment.to_string()) {
                continue;
            }
            if !run.allows(segment) {
                return Err(Error::Blocked);
            }
            // One bad segment should not end a recording that is otherwise healthy.
            let Ok(mut response) = client
                .get(segment.clone())
                .timeout(Duration::from_secs(40))
                .send()
                .and_then(|r| r.error_for_status())
            else {
                continue;
            };
            let mut data = Vec::new();
            if response.read_to_end(&mut data).is_err() || data.is_empty() {
                continue;
            }

            // Join the sound that covers the same moment, when it lives in its own rendition.
            let mut written = 0;
            if let Some(track) = audio_segments.get(&(media.sequence + offset as u64)) {
                if let Some(sound) = fetch_bytes(client, track) {
                    if let Some(joined) = mpegts::mux(&data, &sound) {
                        written = joined.len();
                        sink.segment(&joined, *seconds)?;
                        muxed_any = true;
                    }
                }
            }
            if written == 0 {
                // No sound to join: keep the picture, and tell the caller if sound was required.
                if audio.is_some() {
                    audio_misses += 1;
                    if require_audio && !muxed_any && audio_misses >= 4 {
                        return Err(Error::NoAudio);
                    }
                }
                written = data.len();
                sink.segment(&data, *seconds)?;
            }
            sink.mark(segment.path());
            run.segments += 1;
            run.captured += *seconds;
            run.wrote(written);
        }

        if media.ended || run.done() {
            return Ok(());
        }
        // Live playlists grow; look again about every half segment.
        let until = Instant::now() + Duration::from_millis((media.target * 500).clamp(1000, 5000));
        while Instant::now() < until && !run.done() {
            thread::sleep(Duration::from_millis(200));
        }
        if run.done() {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://example.com/live/playlist.m3u8").unwrap()
    }

    fn master(body: &str, base: &Url) -> Master {
        let Playlist::Master(master) = parse(body, base).unwrap() else {
            panic!("expected a master playlist");
        };
        master
    }

    #[test]
    fn master_can_pick_the_smallest_variant() {
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh.m3u8\n";
        match parse_with(body, &base(), true).unwrap() {
            Playlist::Master(master) => {
                assert_eq!(master.variant.as_str(), "https://example.com/live/low.m3u8");
                assert!(!master.demuxed && master.audio.is_none());
            }
            Playlist::Media(_) => panic!("expected a master playlist"),
        }
    }

    #[test]
    fn master_prefers_a_variant_with_its_own_sound() {
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000,AUDIO=\"aud\"\nsilent.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nmuxed.m3u8\n";
        let url = Url::parse("http://h/master.m3u8").unwrap();
        let master = master(body, &url);
        assert_eq!(master.variant.as_str(), "http://h/muxed.m3u8");
        assert!(!master.demuxed);
    }

    #[test]
    fn a_demuxed_variant_resolves_its_audio_playlist() {
        let body = "#EXTM3U\n\
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Français\",DEFAULT=NO,URI=\"fr.m3u8\"\n\
            #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English\",DEFAULT=YES,URI=\"en.m3u8\"\n\
            #EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO=\"aud\"\nvideo.m3u8\n";
        let url = Url::parse("http://h/live/master.m3u8").unwrap();
        let master = master(body, &url);
        assert!(master.demuxed);
        assert_eq!(master.variant.as_str(), "http://h/live/video.m3u8");
        assert_eq!(master.audio.unwrap().as_str(), "http://h/live/en.m3u8");
    }

    #[test]
    fn a_demuxed_variant_without_a_rendition_is_still_reported() {
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO=\"gone\"\nvideo.m3u8\n";
        let master = master(body, &base());
        assert!(master.demuxed && master.audio.is_none());
    }

    #[test]
    fn master_picks_the_best_variant() {
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh.m3u8?x=1\n";
        let master = master(body, &base());
        assert_eq!(
            master.variant.as_str(),
            "https://example.com/live/high.m3u8?x=1"
        );
    }

    #[test]
    fn media_keeps_durations() {
        let body = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:5.5,\na.ts\n#EXTINF:6.0,\nb.ts\n#EXT-X-ENDLIST\n";
        match parse(body, &base()).unwrap() {
            Playlist::Media(m) => {
                assert!(m.ended && !m.encrypted);
                assert_eq!(m.segments.len(), 2);
                assert_eq!(m.segments[0].1, 5.5);
                assert_eq!(m.segments[1].0.as_str(), "https://example.com/live/b.ts");
            }
            Playlist::Master(_) => panic!("expected a media playlist"),
        }
    }

    #[test]
    fn media_reads_the_sequence_number() {
        let body = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:42\n#EXTINF:4,\na.ts\n";
        match parse(body, &base()).unwrap() {
            Playlist::Media(m) => assert_eq!(m.sequence, 42),
            Playlist::Master(_) => panic!("expected a media playlist"),
        }
    }

    #[test]
    fn encrypted_streams_are_flagged() {
        let body = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:4,\na.ts\n";
        match parse(body, &base()).unwrap() {
            Playlist::Media(m) => assert!(m.encrypted),
            Playlist::Master(_) => panic!("expected a media playlist"),
        }
    }

    #[test]
    fn attributes_survive_quoted_commas() {
        let attrs = "BANDWIDTH=100,CODECS=\"avc1.4d401f,mp4a.40.2\",AUDIO=\"aud\"";
        assert_eq!(attr_value(attrs, "AUDIO").as_deref(), Some("aud"));
        assert_eq!(attr_value(attrs, "BANDWIDTH").as_deref(), Some("100"));
        assert_eq!(
            attr_value(attrs, "CODECS").as_deref(),
            Some("avc1.4d401f,mp4a.40.2")
        );
        assert!(attr_value(attrs, "RESOLUTION").is_none());
    }
}
