mod account;
mod admin;
mod proxy;
mod recordings;
mod sync;

use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::state::AppState;

/// Settings an admin can change, with their defaults.
pub const SETTING_DEFAULTS: &[(&str, &str)] = &[
    ("registration", "closed"),
    ("default_max_concurrent", "1"),
    ("default_max_hours", "4"),
    ("default_storage_gb", "5"),
    ("default_keep_hours", ""),
    ("allow_private", "false"),
    ("session_days", "30"),
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
            get(recordings::show).delete(recordings::remove),
        )
        .route("/recordings/{id}/stop", post(recordings::stop))
        .route("/recordings/{id}/keep", post(recordings::set_keep))
        .route("/recordings/{id}/index.m3u8", get(recordings::playlist))
        .route("/recordings/{id}/seg/{name}", get(recordings::segment))
        .route("/recordings/{id}/download", get(recordings::download))
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
        .route("/admin/recordings", get(admin::recordings))
        .route("/admin/recordings/{id}", delete(admin::delete_recording))
}
