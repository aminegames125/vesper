use std::path::PathBuf;

use clap::{Parser, ValueEnum};

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum Mode {
    /// No accounts: anyone who can reach the server can use it. For a trusted home network.
    Lite,
    /// Accounts, roles, quotas, invites and an admin panel.
    Full,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Lite => "lite",
            Mode::Full => "full",
        }
    }
}

/// Vesper Cloud: your own IPTV server.
#[derive(Parser, Debug, Clone)]
#[command(name = "vesper-server", version, about)]
pub struct Config {
    /// Extra host names a lite server accepts (comma separated), for example one behind a reverse proxy.
    #[arg(
        long = "allowed-host",
        env = "VESPER_ALLOWED_HOSTS",
        value_delimiter = ','
    )]
    pub allowed_hosts: Vec<String>,

    /// `lite` has no logins; `full` has users, roles and quotas.
    #[arg(long, env = "VESPER_MODE", value_enum, default_value = "lite")]
    pub mode: Mode,

    /// Address to listen on.
    #[arg(long, env = "VESPER_BIND", default_value = "0.0.0.0:8484")]
    pub bind: String,

    /// Where the database and recordings are stored.
    #[arg(long, env = "VESPER_DATA_DIR", default_value = "data")]
    pub data_dir: PathBuf,

    /// Create this admin on first start (full mode). Otherwise the admin panel asks you to.
    #[arg(long, env = "VESPER_ADMIN_USER")]
    pub admin_user: Option<String>,

    #[arg(long, env = "VESPER_ADMIN_PASSWORD", hide_env_values = true)]
    pub admin_password: Option<String>,

    /// Let the proxy and recorder reach addresses on private networks. Always on in lite mode.
    #[arg(long, env = "VESPER_ALLOW_PRIVATE")]
    pub allow_private: bool,

    /// Trust the X-Forwarded-For header from a reverse proxy in front of this server, so sign-in
    /// limits count each real client instead of the proxy.
    #[arg(long, env = "VESPER_TRUST_PROXY")]
    pub trust_proxy: bool,

    /// Do not announce this server on the local network (mDNS), so Kodi cannot find it by itself.
    #[arg(long, env = "VESPER_NO_DISCOVERY")]
    pub no_discovery: bool,

    /// A command run whenever the time of the next scheduled recording changes, with the time in
    /// the VESPER_NEXT_START environment variable (epoch seconds). Use it to set a wake timer
    /// (rtcwake, schtasks). It can only be set here, never from the add-on or the admin panel.
    #[arg(long, env = "VESPER_WAKE_COMMAND")]
    pub wake_command: Option<String>,
}

impl Config {
    pub fn recordings_dir(&self) -> PathBuf {
        self.data_dir.join("recordings")
    }

    pub fn is_lite(&self) -> bool {
        self.mode == Mode::Lite
    }
}
