use std::net::IpAddr;

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::state::AppState;

/// The host part of a `Host` header or an origin: no port, no brackets, lower case.
fn bare_host(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    if let Some(rest) = value.strip_prefix('[') {
        return rest.split(']').next().unwrap_or_default().to_string();
    }
    value.split(':').next().unwrap_or_default().to_string()
}

/// True for names that only exist on a home network: an address, `localhost`, a single label or `.local`.
fn home_host(host: &str) -> bool {
    host.parse::<IpAddr>().is_ok()
        || host == "localhost"
        || !host.contains('.')
        || [
            ".local",
            ".lan",
            ".home",
            ".internal",
            ".home.arpa",
            ".localhost",
        ]
        .iter()
        .any(|suffix| host.ends_with(suffix))
}

/// Lite mode has no logins, so refuse what a web page on the internet could do to it: answer only to
/// home-network host names (which stops DNS rebinding) and to requests that did not come from
/// another site (which stops a page from pressing buttons on your server).
pub async fn lite(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if !state.config.is_lite() {
        return next.run(request).await;
    }
    let headers = request.headers();
    let host_header = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let host = bare_host(host_header);
    let allowed = home_host(&host)
        || state
            .config
            .allowed_hosts
            .iter()
            .any(|h| bare_host(h) == host);
    let cross_site = headers
        .get("sec-fetch-site")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == "cross-site");
    let foreign_origin = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|origin| {
            let without_scheme = origin.split("://").nth(1).unwrap_or(origin);
            !without_scheme.eq_ignore_ascii_case(host_header)
        });
    // A Chromecast fetches the stream itself, from its own page, so media links that carry their own
    // token (or a share link) are open to other origins. They are useless without that token.
    let media = is_media(request.uri().path())
        && matches!(
            request.method(),
            &Method::GET | &Method::HEAD | &Method::OPTIONS
        )
        && (request.uri().query().is_some_and(|q| q.contains("token="))
            || request.uri().path().contains("/share/")
            || request.uri().path().starts_with("/s/")
            || request.method() == Method::OPTIONS);
    if !allowed || ((cross_site || foreign_origin) && !media) {
        return (
            StatusCode::FORBIDDEN,
            "Vesper in lite mode only answers on your home network. Use the server's own address, or add its name with --allowed-host.",
        )
            .into_response();
    }
    if media && request.method() == Method::OPTIONS {
        return with_media_cors((StatusCode::NO_CONTENT, ()).into_response());
    }
    let reply = next.run(request).await;
    if media {
        with_media_cors(reply)
    } else {
        reply
    }
}

/// Paths that serve video or images to a player.
fn is_media(path: &str) -> bool {
    path.starts_with("/s/")
        || path.ends_with("/index.m3u8")
        || path.contains("/seg/")
        || path.ends_with("/download")
        || path.ends_with("/thumb.jpg")
        || path.ends_with("/export.mp4")
}

fn with_media_cors(mut reply: Response) -> Response {
    let headers = reply.headers_mut();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, HEAD, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("range, authorization, content-type"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("content-range, content-length, accept-ranges"),
    );
    reply
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_names_are_recognised() {
        for host in [
            "192.168.1.20",
            "::1",
            "localhost",
            "nas",
            "box.local",
            "tv.home.arpa",
        ] {
            assert!(home_host(&bare_host(host)), "{host}");
        }
        for host in ["evil.example.com", "attacker.io"] {
            assert!(!home_host(&bare_host(host)), "{host}");
        }
        assert_eq!(bare_host("[::1]:8484"), "::1");
    }

    #[test]
    fn only_player_paths_count_as_media() {
        assert!(is_media("/api/v1/recordings/x/index.m3u8"));
        assert!(is_media("/api/v1/share/t/seg/seg00001.ts"));
        assert!(is_media("/api/v1/recordings/x/thumb.jpg"));
        assert!(!is_media("/api/v1/recordings"));
        assert!(!is_media("/api/v1/recordings/x/stop"));
        assert_eq!(bare_host("Nas:8484"), "nas");
    }
}
