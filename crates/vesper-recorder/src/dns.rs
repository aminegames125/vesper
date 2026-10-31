use std::net::{IpAddr, SocketAddr, ToSocketAddrs};

use reqwest::dns::{Addrs, Name, Resolve, Resolving};

/// True for addresses that only make sense inside a network: loopback, private, link-local and the like.
pub fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || o[0] == 0
                // Carrier-grade NAT, 100.64.0.0/10, and benchmarking, 198.18.0.0/15.
                || (o[0] == 100 && (64..128).contains(&o[1]))
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // Unique local (fc00::/7) and link-local (fe80::/10).
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                || v6.to_ipv4_mapped().is_some_and(|v4| is_private_ip(IpAddr::V4(v4)))
        }
    }
}

/// Looks a host up and keeps only public addresses, so what is checked is what is connected to.
pub(crate) struct PublicOnly;

impl Resolve for PublicOnly {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let host = name.as_str().to_string();
            let addrs: Vec<SocketAddr> = (host.as_str(), 0)
                .to_socket_addrs()?
                .filter(|a| !is_private_ip(a.ip()))
                .collect();
            if addrs.is_empty() {
                return Err("blocked address".into());
            }
            Ok(Box::new(addrs.into_iter()) as Addrs)
        })
    }
}
