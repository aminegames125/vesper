use std::{net::IpAddr, net::SocketAddr, sync::Arc};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

use reqwest::Url;

use crate::{
    config::Config,
    db::Db,
    error::{ApiError, ApiResult},
    state::AppState,
};

fn is_private(ip: IpAddr) -> bool {
    vesper_recorder::is_private_ip(ip)
}

/// Looks hosts up for the server's own HTTP client and drops private addresses unless they are
/// allowed, so the address that was checked is the address that is connected to.
pub struct PublicOnly {
    pub db: Db,
    pub config: Arc<Config>,
}

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        let allow = self.config.is_lite()
            || self.config.allow_private
            || self.db.setting("allow_private", "false") == "true";
        Box::pin(async move {
            let host = name.as_str().to_string();
            let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
                .await?
                .filter(|a| allow || !is_private(a.ip()))
                .collect();
            if addrs.is_empty() {
                return Err("blocked address".into());
            }
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}

/// Reads a response body but gives up once it passes `max` bytes, however it is sent.
pub async fn read_capped(mut reply: reqwest::Response, max: usize) -> ApiResult<Vec<u8>> {
    let mut body = Vec::new();
    while let Some(chunk) = reply
        .chunk()
        .await
        .map_err(|e| ApiError::bad(format!("Could not read the reply: {e}")))?
    {
        if body.len() + chunk.len() > max {
            return Err(ApiError::bad("That reply is too large."));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// For the recorder, which runs on its own thread: true when every address the host resolves to is public.
pub fn resolves_public(url: &Url) -> bool {
    use std::net::ToSocketAddrs;
    let Some(host) = url.host_str() else {
        return false;
    };
    let port = url.port_or_known_default().unwrap_or(80);
    (host, port)
        .to_socket_addrs()
        .is_ok_and(|mut addrs| addrs.all(|a| !is_private(a.ip())))
}

/// Parses an address and, unless private networks are allowed, refuses hosts that resolve to one.
/// This keeps a public server from being used to probe the network it runs in.
pub async fn check_target(state: &AppState, raw: &str) -> ApiResult<Url> {
    let url = Url::parse(raw).map_err(|_| ApiError::bad("That address is not valid."))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ApiError::bad(
            "Only http and https addresses are supported.",
        ));
    }
    if state.allow_private() {
        return Ok(url);
    }
    let host = url
        .host_str()
        .ok_or_else(|| ApiError::bad("That address has no host."))?;
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| ApiError::bad("Could not find that host."))?;
    for addr in addrs {
        if is_private(addr.ip()) {
            return Err(ApiError::forbidden(
                "This server does not reach private network addresses. An admin can allow it in settings.",
            ));
        }
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_ranges_are_detected() {
        for ip in [
            "127.0.0.1",
            "10.1.2.3",
            "192.168.0.9",
            "172.16.5.5",
            "169.254.1.1",
            "100.64.0.1",
            "::1",
            "fd00::1",
            "fe80::1",
        ] {
            assert!(is_private(ip.parse().unwrap()), "{ip} should be private");
        }
        for ip in ["8.8.8.8", "1.1.1.1", "100.128.0.1", "2606:4700::1111"] {
            assert!(!is_private(ip.parse().unwrap()), "{ip} should be public");
        }
    }
}
