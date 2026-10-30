//! Records a live or on-demand stream to disk with no external tools.
//!
//! The same code runs inside the desktop and mobile apps and inside the cloud server, so a
//! recording behaves identically on every device. HLS streams are followed segment by segment;
//! plain continuous streams (for example a `.ts` URL) are copied as they arrive.

mod hls;
mod sink;

use std::{
    io::Read,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

pub use sink::{playlist_text, SegmentEntry};

use reqwest::{blocking::Client, Url};
use sink::{FileSink, SegmentSink, Sink};

/// Where the captured bytes go.
#[derive(Debug, Clone)]
pub enum Output {
    /// One growing transport-stream file, ideal for a local recording.
    File(PathBuf),
    /// A folder of `.ts` segments plus an `index.m3u8`, playable while it is still recording.
    Segments(PathBuf),
}

#[derive(Debug, Clone)]
pub struct Options {
    pub url: String,
    /// Recording stops by itself after this many seconds.
    pub max_seconds: u64,
    pub output: Output,
    pub user_agent: String,
}

impl Options {
    pub fn new(url: impl Into<String>, max_seconds: u64, output: Output) -> Self {
        Self {
            url: url.into(),
            max_seconds,
            output,
            user_agent: "Vesper/0.2".into(),
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Progress {
    pub bytes: u64,
    pub seconds: u64,
}

#[derive(Debug, Clone, Default)]
pub struct Summary {
    pub bytes: u64,
    pub seconds: u64,
    pub segments: usize,
    /// Set when the stream failed part-way; what was captured before that is still kept.
    pub warning: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("That stream address is not valid.")]
    BadUrl,
    #[error("Could not reach the stream: {0}")]
    Http(String),
    #[error("This stream is encrypted and cannot be recorded.")]
    Encrypted,
    #[error("The playlist has no streams.")]
    NoStreams,
    #[error("Could not write the recording: {0}")]
    Io(#[from] std::io::Error),
    #[error("Nothing was captured: {0}")]
    Empty(String),
}

pub type Result<T> = std::result::Result<T, Error>;

pub(crate) struct Run<'a, F: FnMut(Progress)> {
    pub stop: &'a AtomicBool,
    pub started: Instant,
    pub limit: Duration,
    pub bytes: u64,
    pub segments: usize,
    /// Seconds of video captured so far, as the stream counts them.
    pub captured: f32,
    pub on_progress: F,
    last_report: Instant,
}

impl<F: FnMut(Progress)> Run<'_, F> {
    pub fn done(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
            || self.started.elapsed() >= self.limit
            || self.captured >= self.limit.as_secs_f32()
    }

    pub fn wrote(&mut self, bytes: usize) {
        self.bytes += bytes as u64;
        if self.last_report.elapsed() >= Duration::from_secs(1) {
            self.last_report = Instant::now();
            (self.on_progress)(Progress {
                bytes: self.bytes,
                seconds: self.started.elapsed().as_secs(),
            });
        }
    }
}

/// Records until `max_seconds` pass, `stop` is set, or the stream ends. Blocks the calling thread.
pub fn record(
    options: &Options,
    stop: &AtomicBool,
    on_progress: impl FnMut(Progress),
) -> Result<Summary> {
    let url = Url::parse(&options.url).map_err(|_| Error::BadUrl)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(Error::BadUrl);
    }
    let limit = Duration::from_secs(options.max_seconds.max(1));
    let client = Client::builder()
        .user_agent(options.user_agent.clone())
        .connect_timeout(Duration::from_secs(15))
        .timeout(limit + Duration::from_secs(45))
        .build()
        .map_err(|e| Error::Http(e.to_string()))?;

    let mut sink: Box<dyn Sink> = match &options.output {
        Output::File(path) => Box::new(FileSink::create(path)?),
        Output::Segments(dir) => Box::new(SegmentSink::create(dir)?),
    };
    let mut run = Run {
        stop,
        started: Instant::now(),
        limit,
        bytes: 0,
        segments: 0,
        captured: 0.0,
        on_progress,
        last_report: Instant::now(),
    };

    let is_hls = url.path().to_lowercase().ends_with(".m3u8");
    let outcome = if is_hls {
        hls::record_hls(&client, url, sink.as_mut(), &mut run)
    } else {
        record_raw(&client, url, sink.as_mut(), &mut run)
    };
    sink.finish()?;

    let seconds = run.started.elapsed().as_secs();
    match outcome {
        Ok(()) => Ok(Summary {
            bytes: run.bytes,
            seconds,
            segments: run.segments,
            warning: None,
        }),
        Err(e) if run.bytes == 0 => Err(Error::Empty(e.to_string())),
        Err(e) => Ok(Summary {
            bytes: run.bytes,
            seconds,
            segments: run.segments,
            warning: Some(e.to_string()),
        }),
    }
}

/// Copies a continuous stream, cutting it into ~10 second chunks so a segmented sink stays seekable.
fn record_raw<F: FnMut(Progress)>(
    client: &Client,
    url: Url,
    sink: &mut dyn Sink,
    run: &mut Run<'_, F>,
) -> Result<()> {
    const PACKET: usize = 188;
    const CHUNK: Duration = Duration::from_secs(10);

    let mut response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| Error::Http(e.to_string()))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk_start = Instant::now();

    while !run.done() {
        match response.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                pending.extend_from_slice(&buffer[..n]);
                run.wrote(n);
                if chunk_start.elapsed() >= CHUNK && pending.len() >= PACKET {
                    let cut = pending.len() / PACKET * PACKET;
                    let rest = pending.split_off(cut);
                    sink.segment(&pending, chunk_start.elapsed().as_secs_f32())?;
                    run.segments += 1;
                    pending = rest;
                    chunk_start = Instant::now();
                }
            }
            Err(e) => {
                flush(sink, &mut pending, chunk_start, run)?;
                return Err(Error::Http(e.to_string()));
            }
        }
    }
    flush(sink, &mut pending, chunk_start, run)
}

fn flush<F: FnMut(Progress)>(
    sink: &mut dyn Sink,
    pending: &mut Vec<u8>,
    chunk_start: Instant,
    run: &mut Run<'_, F>,
) -> Result<()> {
    if !pending.is_empty() {
        sink.segment(pending, chunk_start.elapsed().as_secs_f32())?;
        run.segments += 1;
        pending.clear();
    }
    Ok(())
}
