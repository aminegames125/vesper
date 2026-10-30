use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use crate::{config::Config, db::Db};

/// Stop flags of recordings that are running right now, keyed by recording id.
pub type Jobs = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub config: Arc<Config>,
    pub jobs: Jobs,
    /// Failed logins per address: (count, window start). Slows down password guessing.
    pub attempts: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn allow_private(&self) -> bool {
        self.config.is_lite()
            || self.config.allow_private
            || self.db.setting("allow_private", "false") == "true"
    }
}
