//! Serving files from disk with `Range` support, so a player can seek and a download can resume.

use std::{io::SeekFrom, path::Path};

use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::Response,
};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use crate::error::{ApiError, ApiResult};

/// The first and last byte (inclusive) a `Range: bytes=...` header asks for, clamped to the file.
/// `None` means the header cannot be satisfied.
pub fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?;
    // Only the first range is served; players ask for one at a time.
    let spec = spec.split(',').next()?.trim();
    let (from, to) = spec.split_once('-')?;
    if len == 0 {
        return None;
    }
    let (start, end) = if from.is_empty() {
        // "-500" is the last 500 bytes.
        let tail: u64 = to.parse().ok()?;
        if tail == 0 {
            return None;
        }
        (len.saturating_sub(tail), len - 1)
    } else {
        let start: u64 = from.parse().ok()?;
        let end = if to.is_empty() {
            len - 1
        } else {
            to.parse::<u64>().ok()?.min(len - 1)
        };
        (start, end)
    };
    (start <= end && start < len).then_some((start, end))
}

/// Streams `path`, answering 206 for a satisfiable range and 416 for one that is not.
pub async fn serve(
    path: &Path,
    content_type: &'static str,
    cache: &'static str,
    request: &HeaderMap,
    disposition: Option<String>,
) -> ApiResult<Response> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| ApiError::not_found("File not found."))?;
    let len = file
        .metadata()
        .await
        .map_err(|_| ApiError::not_found("File not found."))?
        .len();
    let range = request.get(header::RANGE).and_then(|v| v.to_str().ok());

    let mut response = Response::new(Body::empty());
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    if let Some(name) = disposition.and_then(|d| HeaderValue::from_str(&d).ok()) {
        headers.insert(header::CONTENT_DISPOSITION, name);
    }

    match range.map(|r| parse_range(r, len)) {
        Some(None) => {
            *response.status_mut() = StatusCode::RANGE_NOT_SATISFIABLE;
            if let Ok(v) = HeaderValue::from_str(&format!("bytes */{len}")) {
                response.headers_mut().insert(header::CONTENT_RANGE, v);
            }
        }
        Some(Some((start, end))) => {
            file.seek(SeekFrom::Start(start))
                .await
                .map_err(|_| ApiError::not_found("File not found."))?;
            let count = end - start + 1;
            *response.status_mut() = StatusCode::PARTIAL_CONTENT;
            let headers = response.headers_mut();
            if let Ok(v) = HeaderValue::from_str(&format!("bytes {start}-{end}/{len}")) {
                headers.insert(header::CONTENT_RANGE, v);
            }
            headers.insert(header::CONTENT_LENGTH, HeaderValue::from(count));
            *response.body_mut() = Body::from_stream(ReaderStream::new(file.take(count)));
        }
        None => {
            response
                .headers_mut()
                .insert(header::CONTENT_LENGTH, HeaderValue::from(len));
            *response.body_mut() = Body::from_stream(ReaderStream::new(file));
        }
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_are_read_and_clamped() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=900-5000", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=0-1,5-9", 1000), Some((0, 1)));
    }

    #[test]
    fn unsatisfiable_ranges_are_refused() {
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=9-3", 1000), None);
        assert_eq!(parse_range("bytes=-0", 1000), None);
        assert_eq!(parse_range("items=0-5", 1000), None);
        assert_eq!(parse_range("bytes=0-5", 0), None);
    }
}
