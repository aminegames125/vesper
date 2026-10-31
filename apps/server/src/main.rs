mod api;
mod auth;
mod config;
mod db;
mod error;
mod jobs;
mod net;
mod state;
mod web;

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::Router;
use clap::Parser;
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowHeaders, AllowOrigin, Any, CorsLayer},
};
use tracing::info;

use crate::{config::Config, db::Db, state::AppState};

/// Full mode signs requests with bearer tokens, so any origin may call it. Lite mode has no
/// logins, so a web page the user happens to visit must not be able to; only the desktop app's
/// own origins and localhost are allowed (native clients send no Origin and are unaffected).
fn cors(lite: bool) -> CorsLayer {
    let origin = if lite {
        AllowOrigin::predicate(|origin, _| {
            let Ok(origin) = origin.to_str() else {
                return false;
            };
            let host = origin.split("://").nth(1).unwrap_or("");
            let host = host.split(':').next().unwrap_or("");
            matches!(host, "localhost" | "127.0.0.1" | "tauri.localhost")
                || origin.starts_with("tauri://")
        })
    } else {
        AllowOrigin::any()
    };
    CorsLayer::new()
        .allow_origin(origin)
        .allow_methods(Any)
        // `*` does not cover Authorization in browsers, so echo what the preflight asks for.
        .allow_headers(AllowHeaders::mirror_request())
        .expose_headers([axum::http::header::CONTENT_RANGE])
        .max_age(Duration::from_secs(3600))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "vesper_server=info".into()),
        )
        .init();

    let config = Config::parse();
    std::fs::create_dir_all(config.recordings_dir()).expect("could not create the data folder");
    let db = Db::open(&config.data_dir.join("vesper.db")).expect("could not open the database");

    if config.is_lite() {
        db.ensure_lite_user()
            .expect("could not prepare the local user");
    } else if let (Some(user), Some(password)) = (&config.admin_user, &config.admin_password) {
        bootstrap_admin(&db, user, password);
    }

    let state = AppState {
        db,
        config: Arc::new(config),
        jobs: Default::default(),
        attempts: Arc::new(Mutex::new(HashMap::new())),
        http: reqwest::Client::builder()
            .user_agent("Vesper/0.2")
            .connect_timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("http client"),
    };
    jobs::spawn_background(state.clone());

    let app = Router::new()
        .nest("/api/v1", api::router())
        .fallback(web::serve)
        .layer(cors(state.config.is_lite()))
        .layer(CompressionLayer::new())
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(&state.config.bind)
        .await
        .unwrap_or_else(|e| {
            eprintln!("Could not listen on {}: {e}", state.config.bind);
            std::process::exit(1);
        });
    info!(
        "Vesper Cloud {} ({} mode) listening on http://{}",
        env!("CARGO_PKG_VERSION"),
        state.config.mode.as_str(),
        state.config.bind
    );
    if !state.config.is_lite() && state.db.user_count() == 0 {
        info!("No accounts yet: open the admin panel to create the first administrator.");
    }

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
        info!("Shutting down");
    })
    .await
    .expect("server error");
}

/// Creates the administrator named on the command line, once.
fn bootstrap_admin(db: &Db, username: &str, password: &str) {
    if db.user_count() > 0 {
        return;
    }
    let hash = auth::hash_password(password).expect("could not hash the admin password");
    db.conn()
        .execute(
            "INSERT INTO users (id, username, pass_hash, role, max_concurrent, max_hours, storage_bytes, created_at)
             VALUES (?1, ?2, ?3, 'admin', 0, 0, 0, ?4)",
            rusqlite::params![uuid::Uuid::new_v4().to_string(), username, hash, db::now()],
        )
        .expect("could not create the admin");
    info!("Created administrator '{username}'");
}
