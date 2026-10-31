use std::net::IpAddr;

use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
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
    if !allowed || cross_site || foreign_origin {
        return (
            StatusCode::FORBIDDEN,
            "Vesper in lite mode only answers on your home network. Use the server's own address, or add its name with --allowed-host.",
        )
            .into_response();
    }
    next.run(request).await
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
        assert_eq!(bare_host("Nas:8484"), "nas");
    }
}
