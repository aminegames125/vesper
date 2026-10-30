use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Receives captured data one segment at a time.
pub(crate) trait Sink {
    fn segment(&mut self, data: &[u8], seconds: f32) -> io::Result<()>;
    fn finish(&mut self) -> io::Result<()>;
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

    fn finish(&mut self) -> io::Result<()> {
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
}

impl SegmentSink {
    pub fn create(dir: &Path) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        Ok(Self {
            dir: dir.to_path_buf(),
            entries: Vec::new(),
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

    fn finish(&mut self) -> io::Result<()> {
        self.write_playlist(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
