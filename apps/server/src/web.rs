use axum::{
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Redirect, Response},
};
use rust_embed::RustEmbed;

/// The admin panel, built by Turborepo and baked into the binary.
#[derive(RustEmbed)]
#[folder = "../admin/dist"]
struct Panel;

fn asset(path: &str) -> Option<Response> {
    let file = Panel::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    // Hashed build files never change; the page itself must always be fresh.
    let cache = if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    Some(
        (
            [
                (header::CONTENT_TYPE, mime.to_string()),
                (header::CACHE_CONTROL, cache.to_string()),
            ],
            file.data.into_owned(),
        )
            .into_response(),
    )
}

pub async fn serve(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return Redirect::temporary("/admin/").into_response();
    }
    let Some(rest) = path.strip_prefix("admin") else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let rest = rest.trim_start_matches('/');
    let file = if rest.is_empty() { "index.html" } else { rest };
    // Unknown paths fall back to the single-page app.
    asset(file)
        .or_else(|| asset("index.html"))
        .unwrap_or_else(|| (StatusCode::NOT_FOUND, "Admin panel not built").into_response())
}
