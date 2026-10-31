//! Records a live or on-demand stream to disk with no external tools.
//!
//! The same code runs inside the desktop and mobile apps and inside the cloud server, so a
//! recording behaves identically on every device. HLS streams are followed segment by segment;
//! plain continuous streams (for example a `.ts` URL) are copied as they arrive.

mod dns;
mod hls;
mod sink;

use std::{
    io::Read,
    path::PathBuf,
    sync::mpsc,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

pub use dns::is_private_ip;
pub use sink::{end_playlist, playlist_text, SegmentEntry};

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

/// Decides whether the recorder may fetch an address. A server uses it to keep a stream's playlist,
/// segments and redirects from reaching its private network.
#[derive(Clone)]
pub struct UrlGuard(Arc<dyn Fn(&Url) -> bool + Send + Sync>);

impl UrlGuard {
    pub fn new(allow: impl Fn(&Url) -> bool + Send + Sync + 'static) -> Self {
        Self(Arc::new(allow))
    }

    pub(crate) fn allows(&self, url: &Url) -> bool {
        (self.0)(url)
    }
}

impl std::fmt::Debug for UrlGuard {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("UrlGuard")
    }
}

#[derive(Debug, Clone)]
pub struct Options {
    pub url: String,
    /// Recording stops by itself after this many seconds.
    pub max_seconds: u64,
    pub output: Output,
    pub user_agent: String,
    /// When set, every address the recorder fetches must pass it.
    pub guard: Option<UrlGuard>,
    /// Continue the segment folder that is already there instead of starting it over. A server
    /// uses this to reconnect after the stream drops and keep one playable recording.
    pub append: bool,
    /// Leave the playlist open when this attempt ends, because another one will carry on. Call
    /// [`end_playlist`] once the whole recording is over.
    pub more_to_come: bool,
    /// Refuse to connect to private network addresses, checking the address actually connected to
    /// (which closes the gap between checking a name and connecting to it).
    pub public_only: bool,
    /// Pick the smallest variant of a master playlist instead of the best one, to save disk space.
    pub lowest_quality: bool,
}

impl Options {
    pub fn new(url: impl Into<String>, max_seconds: u64, output: Output) -> Self {
        Self {
            url: url.into(),
            max_seconds,
            output,
            user_agent: "Vesper/0.2".into(),
            guard: None,
            append: false,
            more_to_come: false,
            public_only: false,
            lowest_quality: false,
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
    #[error("This server does not reach private network addresses.")]
    Blocked,
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
    pub guard: Option<UrlGuard>,
    last_report: Instant,
}

impl<F: FnMut(Progress)> Run<'_, F> {
    /// False when a guard is set and refuses this address.
    pub fn allows(&self, url: &Url) -> bool {
        self.guard.as_ref().is_none_or(|g| g.allows(url))
    }

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
    if options.guard.as_ref().is_some_and(|g| !g.allows(&url)) {
        return Err(Error::Blocked);
    }
    let limit = Duration::from_secs(options.max_seconds.max(1));
    let mut builder = Client::builder()
        .user_agent(options.user_agent.clone())
        .connect_timeout(Duration::from_secs(15))
        .timeout(limit + Duration::from_secs(45));
    if options.public_only {
        builder = builder.dns_resolver(Arc::new(dns::PublicOnly));
    }
    if let Some(guard) = options.guard.clone() {
        // Redirects are a way around the first check, so every hop goes through the guard too.
        builder = builder.redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 10 {
                attempt.error("too many redirects")
            } else if guard.allows(attempt.url()) {
                attempt.follow()
            } else {
                attempt.error("blocked address")
            }
        }));
    }
    let client = builder.build().map_err(|e| Error::Http(e.to_string()))?;

    let mut sink: Box<dyn Sink> = match &options.output {
        Output::File(path) => Box::new(FileSink::create(path)?),
        Output::Segments(dir) => Box::new(SegmentSink::open(dir, options.append)?),
    };
    let mut run = Run {
        stop,
        started: Instant::now(),
        limit,
        bytes: 0,
        segments: 0,
        captured: 0.0,
        on_progress,
        guard: options.guard.clone(),
        last_report: Instant::now(),
    };

    let is_hls = url.path().to_lowercase().ends_with(".m3u8");
    let outcome = if is_hls {
        hls::record_hls(
            &client,
            url,
            sink.as_mut(),
            &mut run,
            options.lowest_quality,
        )
    } else {
        record_raw(&client, url, sink.as_mut(), &mut run)
    };
    sink.finish(!options.more_to_come)?;

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

    /// A stream that sends nothing for this long has stalled; the caller may join it again.
    const SILENCE: Duration = Duration::from_secs(20);

    let mut response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| Error::Http(e.to_string()))?;
    // Reads happen on their own thread so a silent connection cannot block Stop or the silence check.
    let (tx, rx) = mpsc::sync_channel::<std::io::Result<Vec<u8>>>(16);
    thread::spawn(move || {
        let mut buffer = [0u8; 64 * 1024];
        loop {
            match response.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(Ok(buffer[..n].to_vec())).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                    break;
                }
            }
        }
    });
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk_start = Instant::now();
    let mut last_data = Instant::now();

    while !run.done() {
        let received = match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(received) => received,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if last_data.elapsed() >= SILENCE {
                    flush(sink, &mut pending, chunk_start, run)?;
                    return Err(Error::Http("The stream went silent.".into()));
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        last_data = Instant::now();
        match received {
            Ok(data) => {
                let n = data.len();
                pending.extend_from_slice(&data);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write as _, net::TcpListener, thread};

    /// Serves `body` to every request on a random local port.
    fn serve(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut stream = stream;
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf);
                let reply = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(reply.as_bytes());
            }
        });
        format!("http://127.0.0.1:{port}/master.m3u8")
    }

    #[test]
    fn a_master_playlist_that_points_at_itself_ends() {
        let url = serve("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmaster.m3u8\n");
        let dir = std::env::temp_dir().join(format!("vesper-rec-{}", std::process::id()));
        let options = Options::new(url, 30, Output::Segments(dir.clone()));
        let started = Instant::now();
        let result = record(&options, &AtomicBool::new(false), |_| {});
        let _ = std::fs::remove_dir_all(dir);
        assert!(result.is_err());
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn a_guard_can_refuse_the_address() {
        let url = serve("#EXTM3U\n");
        let dir = std::env::temp_dir().join(format!("vesper-rec-guard-{}", std::process::id()));
        let mut options = Options::new(url, 30, Output::Segments(dir.clone()));
        options.guard = Some(UrlGuard::new(|_| false));
        let result = record(&options, &AtomicBool::new(false), |_| {});
        let _ = std::fs::remove_dir_all(dir);
        assert!(matches!(result, Err(Error::Blocked)));
    }
}
