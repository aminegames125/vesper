use std::{fs, path::Path};

/// The admin panel is built by Turborepo into apps/admin/dist and embedded into the binary.
/// When it has not been built (plain `cargo build`), leave a placeholder so compilation still works.
fn main() {
    let dist = Path::new("../admin/dist");
    if !dist.join("index.html").exists() {
        fs::create_dir_all(dist).expect("create admin dist folder");
        fs::write(
            dist.join("index.html"),
            "<!doctype html><meta charset=utf-8><title>Vesper Cloud</title>\
             <body style=\"font-family:system-ui;padding:3rem;background:#0d0d0f;color:#f4f1ea\">\
             <h1>Vesper Cloud is running</h1>\
             <p>The admin panel was not built into this binary. Run <code>npm run build</code> and rebuild the server.</p>",
        )
        .expect("write admin placeholder");
    }
    println!("cargo:rerun-if-changed=../admin/dist");
}
