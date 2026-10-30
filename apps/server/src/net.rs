use std::net::IpAddr;

use reqwest::Url;

use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};

fn is_private(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                // Carrier-grade NAT, 100.64.0.0/10.
                || (v4.octets()[0] == 100 && (64..128).contains(&v4.octets()[1]))
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // Unique local (fc00::/7) and link-local (fe80::/10).
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                || v6.to_ipv4_mapped().is_some_and(|v4| is_private(IpAddr::V4(v4)))
        }
    }
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
