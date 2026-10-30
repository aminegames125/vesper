use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, request::Parts, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use reqwest::Url;
use serde::Deserialize;

use crate::{
    auth::{bearer, AuthUser},
    error::{ApiError, ApiResult},
    net::check_target,
    state::AppState,
};

#[derive(Deserialize)]
pub struct Target {
    url: String,
}

const FORWARD: [HeaderName; 4] = [
    header::CONTENT_TYPE,
    header::CONTENT_LENGTH,
    header::ACCEPT_RANGES,
    header::CONTENT_RANGE,
];

/// Fetches an address on the client's behalf. Web clients use this for hosts that send no CORS headers,
/// and phones use it so provider logins can stay on the server.
pub async fn fetch(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
    parts: Parts,
    headers: HeaderMap,
    Query(target): Query<Target>,
) -> ApiResult<Response> {
    let mut url = check_target(&state, &target.url).await?;
    let mut response = None;

    // Follow redirects by hand so every hop is checked, not only the first address.
    for _ in 0..5 {
        let mut request = state.http.get(url.clone());
        if let Some(range) = headers.get(header::RANGE) {
            request = request.header(header::RANGE, range);
        }
        let reply = request
            .send()
            .await
            .map_err(|e| ApiError::bad(format!("Could not reach that address: {e}")))?;
        if reply.status().is_redirection() {
            let next = reply
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .and_then(|loc| url.join(loc).ok())
                .ok_or_else(|| ApiError::bad("The address redirected somewhere invalid."))?;
            check_target(&state, next.as_str()).await?;
            url = next;
            continue;
        }
        response = Some(reply);
        break;
    }
    let reply = response.ok_or_else(|| ApiError::bad("Too many redirects."))?;

    let status = StatusCode::from_u16(reply.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let is_playlist = url.path().to_lowercase().ends_with(".m3u8")
        || reply
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|t| t.contains("mpegurl"));

    if is_playlist {
        let base = url.clone();
        let text = reply
            .text()
            .await
            .map_err(|e| ApiError::bad(e.to_string()))?;
        let token = bearer(&parts);
        let body: String = text
            .lines()
            .map(|line| format!("{}\n", rewrite_line(line, &base, token.as_deref())))
            .collect();
        return Ok((
            status,
            [(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")],
            body,
        )
            .into_response());
    }

    // Copy the headers a player cares about before the body is handed over as a stream.
    let forwarded: Vec<(HeaderName, HeaderValue)> = FORWARD
        .iter()
        .filter_map(|name| reply.headers().get(name).map(|v| (name.clone(), v.clone())))
        .collect();
    let mut out = Response::new(Body::from_stream(reply.bytes_stream()));
    *out.status_mut() = status;
    for (name, value) in forwarded {
        out.headers_mut().insert(name, value);
    }
    Ok(out)
}

fn proxied(target: &Url, token: Option<&str>) -> String {
    let mut link = Url::parse("http://proxy/api/v1/proxy").expect("static url");
    {
        let mut pairs = link.query_pairs_mut();
        pairs.append_pair("url", target.as_str());
        if let Some(token) = token {
            pairs.append_pair("token", token);
        }
    }
    format!("{}?{}", link.path(), link.query().unwrap_or_default())
}

/// Points every address in a playlist back through the proxy, so segments load the same way.
fn rewrite_line(line: &str, base: &Url, token: Option<&str>) -> String {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if !trimmed.starts_with('#') {
        return base
            .join(trimmed)
            .map(|abs| proxied(&abs, token))
            .unwrap_or_else(|_| trimmed.to_string());
    }
    // Quoted URIs inside tags, such as keys and alternate audio.
    if let Some(start) = trimmed.find("URI=\"") {
        let rest = &trimmed[start + 5..];
        if let Some(end) = rest.find('"') {
            if let Ok(abs) = base.join(&rest[..end]) {
                return format!(
                    "{}URI=\"{}\"{}",
                    &trimmed[..start],
                    proxied(&abs, token),
                    &rest[end + 1..]
                );
            }
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playlists_point_back_at_the_proxy() {
        let base = Url::parse("https://cdn.example.com/live/index.m3u8").unwrap();
        let line = rewrite_line("seg1.ts", &base, Some("tok"));
        assert!(
            line.starts_with("/api/v1/proxy?url=https%3A%2F%2Fcdn.example.com%2Flive%2Fseg1.ts")
        );
        assert!(line.ends_with("&token=tok"));
        assert_eq!(rewrite_line("#EXTINF:4,", &base, None), "#EXTINF:4,");
    }
}
