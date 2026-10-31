use std::{
    collections::HashSet,
    io::Read,
    thread,
    time::{Duration, Instant},
};

use reqwest::{blocking::Client, Url};

use crate::{sink::Sink, Error, Progress, Result, Run};

pub(crate) struct Media {
    pub target: u64,
    pub ended: bool,
    pub encrypted: bool,
    /// Segment address and its duration in seconds.
    pub segments: Vec<(Url, f32)>,
}

pub(crate) enum Playlist {
    Master(Url),
    Media(Media),
}

/// Reads a playlist body. A master playlist resolves to its highest-bandwidth variant.
pub(crate) fn parse(body: &str, base: &Url) -> Result<Playlist> {
    let lines: Vec<&str> = body.lines().map(str::trim).collect();

    if lines.iter().any(|l| l.starts_with("#EXT-X-STREAM-INF")) {
        let mut best: Option<(u64, &str)> = None;
        for (i, line) in lines.iter().enumerate() {
            let Some(attrs) = line.strip_prefix("#EXT-X-STREAM-INF:") else {
                continue;
            };
            let bandwidth = attrs
                .split(',')
                .find_map(|a| a.trim().strip_prefix("BANDWIDTH="))
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            if let Some(uri) = lines[i + 1..]
                .iter()
                .find(|l| !l.is_empty() && !l.starts_with('#'))
            {
                if best.is_none_or(|(b, _)| bandwidth >= b) {
                    best = Some((bandwidth, uri));
                }
            }
        }
        let (_, uri) = best.ok_or(Error::NoStreams)?;
        return base
            .join(uri)
            .map(Playlist::Master)
            .map_err(|_| Error::BadUrl);
    }

    let target = lines
        .iter()
        .find_map(|l| l.strip_prefix("#EXT-X-TARGETDURATION:"))
        .and_then(|v| v.parse().ok())
        .unwrap_or(4);
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
        segments,
    }))
}

/// Follows an HLS playlist, appending each new segment to the sink.
pub(crate) fn record_hls<F: FnMut(Progress)>(
    client: &Client,
    start: Url,
    sink: &mut dyn Sink,
    run: &mut Run<'_, F>,
) -> Result<()> {
    let mut url = start;
    let mut seen: HashSet<String> = HashSet::new();
    let mut first = true;
    let mut hops = 0;
    let mut failures = 0u32;
    let resume_after = sink.last_mark();

    loop {
        if run.done() {
            return Ok(());
        }
        if !run.allows(&url) {
            return Err(Error::Blocked);
        }
        let fetched = client
            .get(url.clone())
            .timeout(Duration::from_secs(20))
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text());
        let body = match fetched {
            Ok(body) => {
                failures = 0;
                body
            }
            Err(e) => {
                // A single failed fetch is normal on a live stream; give up only after several in a row.
                failures += 1;
                if failures >= 5 {
                    return Err(Error::Http(e.to_string()));
                }
                let until = Instant::now() + Duration::from_secs(2);
                while Instant::now() < until && !run.done() {
                    thread::sleep(Duration::from_millis(200));
                }
                continue;
            }
        };

        let media = match parse(&body, &url)? {
            Playlist::Master(variant) => {
                // A master that points back at a master would otherwise loop forever.
                hops += 1;
                if hops > 5 {
                    return Err(Error::NoStreams);
                }
                url = variant;
                continue;
            }
            Playlist::Media(media) => media,
        };
        if media.encrypted {
            return Err(Error::Encrypted);
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

        for (segment, seconds) in &media.segments {
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
            if response.read_to_end(&mut data).is_ok() && !data.is_empty() {
                sink.segment(&data, *seconds)?;
                sink.mark(segment.path());
                run.segments += 1;
                run.captured += *seconds;
                run.wrote(data.len());
            }
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

    #[test]
    fn master_picks_the_best_variant() {
        let body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh.m3u8?x=1\n";
        match parse(body, &base()).unwrap() {
            Playlist::Master(url) => {
                assert_eq!(url.as_str(), "https://example.com/live/high.m3u8?x=1")
            }
            Playlist::Media(_) => panic!("expected a master playlist"),
        }
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
    fn encrypted_streams_are_flagged() {
        let body = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:4,\na.ts\n";
        match parse(body, &base()).unwrap() {
            Playlist::Media(m) => assert!(m.encrypted),
            Playlist::Master(_) => panic!("expected a media playlist"),
        }
    }
}
