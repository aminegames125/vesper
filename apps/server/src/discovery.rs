//! Announces the server on the local network (mDNS / Bonjour) as `_vesper._tcp`, so the Android app
//! can list it instead of asking for an address. Nothing is sent outside the local network.

use mdns_sd::{ServiceDaemon, ServiceInfo};
use tracing::{info, warn};

pub const SERVICE_TYPE: &str = "_vesper._tcp.local.";

/// A name safe to use as a DNS label: letters, digits and dashes.
fn label(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "vesper".into()
    } else {
        cleaned
    }
}

fn machine_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "vesper".into())
}

/// Starts announcing. The returned daemon keeps announcing until it is dropped.
pub fn announce(port: u16, mode: &str) -> Option<ServiceDaemon> {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            warn!("Network discovery is off: {e}");
            return None;
        }
    };
    let name = label(&machine_name());
    let props = [
        ("version", env!("CARGO_PKG_VERSION")),
        ("mode", mode),
        ("path", "/api/v1"),
    ];
    let service = ServiceInfo::new(
        SERVICE_TYPE,
        &format!("Vesper on {name}"),
        &format!("{name}.local."),
        "",
        port,
        &props[..],
    )
    .map(ServiceInfo::enable_addr_auto);
    match service {
        Ok(service) => match daemon.register(service) {
            Ok(()) => {
                info!("Announced on the local network as \"Vesper on {name}\" (port {port})");
                Some(daemon)
            }
            Err(e) => {
                warn!("Network discovery is off: {e}");
                None
            }
        },
        Err(e) => {
            warn!("Network discovery is off: {e}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::label;

    #[test]
    fn machine_names_become_dns_labels() {
        assert_eq!(label("Amine's PC"), "Amine-s-PC");
        assert_eq!(label("---"), "vesper");
        assert_eq!(label("nas01"), "nas01");
    }
}
