mod account;
mod admin;
mod files;
mod guide;
pub mod library;
mod proxy;
mod recordings;
mod schedules;
pub mod sources;
mod status;
mod sync;

use axum::{
    routing::{delete, get, post},
    Router,
};

pub use recordings::DEFAULT_KEEP_HOURS;
pub use sources::Channel;

use crate::state::AppState;

/// Settings an admin can change, with their defaults.
pub const SETTING_DEFAULTS: &[(&str, &str)] = &[
    ("registration", "closed"),
    ("default_max_concurrent", "1"),
    ("default_max_hours", "4"),
    ("default_storage_gb", "5"),
    ("default_keep_hours", recordings::DEFAULT_KEEP_HOURS),
    ("delete_watched_days", "0"),
    ("allow_private", "false"),
    ("session_days", "30"),
    ("webhook_url", ""),
    ("epg_url", ""),
    ("quiet_start", ""),
    ("quiet_end", ""),
    ("update_check", "true"),
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/info", get(account::info))
        .route("/setup", post(account::setup))
        .route("/auth/login", post(account::login))
        .route("/auth/register", post(account::register))
        .route("/auth/logout", post(account::logout))
        .route("/auth/me", get(account::me))
        .route("/auth/password", post(account::change_password))
        .route(
            "/recordings",
            get(recordings::list).post(recordings::create),
        )
        .route(
            "/recordings/{id}",
            get(recordings::show)
                .patch(recordings::patch)
                .delete(recordings::remove),
        )
        .route("/downloads", post(recordings::create_download))
        .route(
            "/recordings/{id}/bookmarks",
            get(library::bookmarks).post(library::add_bookmark),
        )
        .route(
            "/recordings/{id}/bookmarks/{bookmark}",
            delete(library::remove_bookmark),
        )
        .route(
            "/recordings/{id}/share",
            post(library::create_share).get(library::list_shares),
        )
        .route(
            "/recordings/{id}/share/{token}",
            delete(library::revoke_share),
        )
        .route("/recordings/{id}/thumb.jpg", get(library::thumb))
        .route("/recordings/{id}/export", post(library::export))
        .route("/recordings/{id}/export.mp4", get(library::export_file))
        .route("/recordings/{id}/trim", post(library::trim))
        .route("/share/{token}/index.m3u8", get(library::shared_playlist))
        .route("/share/{token}/seg/{name}", get(library::shared_segment))
        .route("/share/{token}/download", get(library::shared_download))
        .route("/recordings/clear-failed", post(recordings::clear_failed))
        .route("/status", get(status::status))
        .route("/channels/test", post(status::test_channel))
        .route("/schedules/pause", post(schedules::pause_all))
        .route("/schedules/export", get(schedules::export))
        .route("/schedules/import", post(schedules::import))
        .route("/guide", get(guide::programmes))
        .route("/guide/search", get(guide::search))
        .route("/guide/status", get(guide::guide_status))
        .route("/guide/refresh", post(guide::refresh))
        .route("/series-rules", get(guide::rules).post(guide::create_rule))
        .route(
            "/series-rules/{id}",
            axum::routing::patch(guide::set_rule_enabled).delete(guide::remove_rule),
        )
        .route("/calendar", get(guide::calendar))
        .route("/status/storage", get(status::storage))
        .route("/schedules/{id}/run", post(schedules::run_now))
        .route("/schedules/{id}/duplicate", post(schedules::duplicate))
        .route("/recordings/{id}/stop", post(recordings::stop))
        .route("/recordings/{id}/keep", post(recordings::set_keep))
        .route("/recordings/{id}/index.m3u8", get(recordings::playlist))
        .route("/recordings/{id}/seg/{name}", get(recordings::segment))
        .route("/recordings/{id}/download", get(recordings::download))
        .route("/schedules", get(schedules::list).post(schedules::create))
        .route(
            "/schedules/{id}",
            axum::routing::put(schedules::update)
                .patch(schedules::set_enabled)
                .delete(schedules::remove),
        )
        .route("/sources", get(sources::list).post(sources::create))
        .route("/sources/{id}", delete(sources::remove))
        .route("/channels", get(sources::channels))
        .route("/sync", get(sync::all))
        .route("/sync/{key}", get(sync::get_one).put(sync::put_one))
        .route("/proxy", get(proxy::fetch))
        .route("/admin/stats", get(admin::stats))
        .route("/admin/users", get(admin::users).post(admin::create_user))
        .route(
            "/admin/users/{id}",
            axum::routing::patch(admin::update_user).delete(admin::delete_user),
        )
        .route("/admin/users/{id}/revoke", post(admin::revoke_sessions))
        .route(
            "/admin/invites",
            get(admin::invites).post(admin::create_invite),
        )
        .route("/admin/invites/{code}", delete(admin::delete_invite))
        .route(
            "/admin/settings",
            get(admin::settings).put(admin::update_settings),
        )
        .route("/admin/audit", get(admin::audit))
        .route("/admin/crashes", get(admin::crashes))
        .route("/admin/recordings", get(admin::recordings))
        .route("/admin/schedules", get(admin::schedules))
        .route("/admin/schedules/{id}", delete(admin::delete_schedule))
        .route("/admin/recordings/{id}", delete(admin::delete_recording))
}
