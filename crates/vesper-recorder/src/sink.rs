use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Receives captured data one segment at a time.
pub(crate) trait Sink {
    fn segment(&mut self, data: &[u8], seconds: f32) -> io::Result<()>;
    /// Ends the recording. `last` marks the final attempt: only then does the playlist say it is over.
    fn finish(&mut self, last: bool) -> io::Result<()>;
    /// Remembers which source segment was written last, so a reconnect can carry on after it.
    fn mark(&mut self, _key: &str) {}
    /// The key passed to `mark` before the previous attempt ended.
    fn last_mark(&self) -> Option<String> {
        None
    }
}

/// One growing file.
pub(crate) struct FileSink {
    file: File,
}

impl FileSink {
    pub fn create(path: &Path) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        Ok(Self {
            file: File::create(path)?,
        })
    }
}

impl Sink for FileSink {
    fn segment(&mut self, data: &[u8], _seconds: f32) -> io::Result<()> {
        self.file.write_all(data)
    }

    fn finish(&mut self, _last: bool) -> io::Result<()> {
        self.file.flush()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SegmentEntry {
    pub name: String,
    pub seconds: f32,
}

/// Builds an HLS playlist for the given segments. Until `ended`, players treat it as a live event.
pub fn playlist_text(entries: &[SegmentEntry], ended: bool) -> String {
    let target = entries
        .iter()
        .map(|e| e.seconds.ceil() as u32)
        .max()
        .unwrap_or(10)
        .max(1);
    let mut text = format!(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:{target}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:EVENT\n"
    );
    for entry in entries {
        text.push_str(&format!("#EXTINF:{:.3},\n{}\n", entry.seconds, entry.name));
    }
    if ended {
        text.push_str("#EXT-X-ENDLIST\n");
    }
    text
}

/// A folder of numbered segments and a playlist that grows as the recording does.
pub(crate) struct SegmentSink {
    dir: PathBuf,
    entries: Vec<SegmentEntry>,
    previous_mark: Option<String>,
}

/// Marks a segment folder as complete: the playlist gains `#EXT-X-ENDLIST`.
pub fn end_playlist(dir: &Path) -> io::Result<()> {
    let text = fs::read_to_string(dir.join("index.m3u8"))?;
    let entries = parse_entries(&text);
    let tmp = dir.join("index.m3u8.tmp");
    fs::write(&tmp, playlist_text(&entries, true))?;
    fs::rename(tmp, dir.join("index.m3u8"))
}

/// Reads back the segments listed in a playlist this sink wrote earlier.
fn parse_entries(text: &str) -> Vec<SegmentEntry> {
    let mut entries = Vec::new();
    let mut lines = text.lines();
    while let Some(line) = lines.next() {
        let Some(rest) = line.strip_prefix("#EXTINF:") else {
            continue;
        };
        let seconds = rest
            .split(',')
            .next()
            .and_then(|s| s.trim().parse::<f32>().ok());
        let name = lines.next().map(str::trim).filter(|n| n.ends_with(".ts"));
        if let (Some(seconds), Some(name)) = (seconds, name) {
            entries.push(SegmentEntry {
                name: name.to_string(),
                seconds,
            });
        }
    }
    entries
}

impl SegmentSink {
    /// Starts an empty folder, or with `append` picks up where the playlist already there ends.
    pub fn open(dir: &Path, append: bool) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let entries = if append {
            fs::read_to_string(dir.join("index.m3u8"))
                .map(|text| parse_entries(&text))
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        let previous_mark = if append {
            fs::read_to_string(dir.join(".last")).ok()
        } else {
            None
        };
        Ok(Self {
            dir: dir.to_path_buf(),
            entries,
            previous_mark,
        })
    }

    fn write_playlist(&self, ended: bool) -> io::Result<()> {
        // Write then rename so a player never reads a half-written playlist.
        let tmp = self.dir.join("index.m3u8.tmp");
        fs::write(&tmp, playlist_text(&self.entries, ended))?;
        fs::rename(tmp, self.dir.join("index.m3u8"))
    }
}

impl Sink for SegmentSink {
    fn segment(&mut self, data: &[u8], seconds: f32) -> io::Result<()> {
        let name = format!("seg{:05}.ts", self.entries.len());
        fs::write(self.dir.join(&name), data)?;
        self.entries.push(SegmentEntry {
            name,
            seconds: seconds.max(0.1),
        });
        self.write_playlist(false)
    }

    fn finish(&mut self, last: bool) -> io::Result<()> {
        self.write_playlist(last)
    }

    fn mark(&mut self, key: &str) {
        let _ = fs::write(self.dir.join(".last"), key);
    }

    fn last_mark(&self) -> Option<String> {
        self.previous_mark.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appending_continues_the_numbering() {
        let dir = std::env::temp_dir().join(format!("vesper-sink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut first = SegmentSink::open(&dir, false).unwrap();
        first.segment(b"a", 6.0).unwrap();
        first.segment(b"b", 4.0).unwrap();
        first.finish(false).unwrap();

        let mut second = SegmentSink::open(&dir, true).unwrap();
        second.segment(b"c", 5.0).unwrap();
        second.finish(true).unwrap();

        let text = fs::read_to_string(dir.join("index.m3u8")).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(text.contains("seg00000.ts"));
        assert!(text.contains("seg00002.ts"));
        assert_eq!(text.matches("#EXTINF").count(), 3);
        assert!(text.contains("ENDLIST"));
    }

    #[test]
    fn a_playlist_stays_open_between_attempts_and_closes_at_the_end() {
        let dir = std::env::temp_dir().join(format!("vesper-sink-open-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut sink = SegmentSink::open(&dir, false).unwrap();
        sink.segment(b"a", 6.0).unwrap();
        sink.mark("/live/a.ts");
        sink.finish(false).unwrap();
        assert!(!fs::read_to_string(dir.join("index.m3u8"))
            .unwrap()
            .contains("ENDLIST"));
        assert_eq!(
            SegmentSink::open(&dir, true)
                .unwrap()
                .last_mark()
                .as_deref(),
            Some("/live/a.ts")
        );
        end_playlist(&dir).unwrap();
        let text = fs::read_to_string(dir.join("index.m3u8")).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(text.contains("ENDLIST"));
    }

    #[test]
    fn playlist_lists_segments_and_ends() {
        let entries = vec![
            SegmentEntry {
                name: "seg00000.ts".into(),
                seconds: 6.0,
            },
            SegmentEntry {
                name: "seg00001.ts".into(),
                seconds: 4.5,
            },
        ];
        let live = playlist_text(&entries, false);
        assert!(live.contains("#EXT-X-TARGETDURATION:6"));
        assert!(live.contains("#EXTINF:4.500,\nseg00001.ts"));
        assert!(!live.contains("ENDLIST"));
        assert!(playlist_text(&entries, true).ends_with("#EXT-X-ENDLIST\n"));
    }
}
