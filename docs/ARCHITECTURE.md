# Architecture

Vesper is a pnpm + Turborepo monorepo with a Cargo workspace. JavaScript and Rust live side by side and meet in three places: the Tauri shell, the embedded admin panel, and the HTTP API.

## Packages

| Path | Language | What it is |
| --- | --- | --- |
| `apps/app` | TypeScript (React 19, Vite, Tailwind 4) | The player UI. Runs in a browser, in Tauri on desktop, and in Tauri on Android. |
| `apps/app/src-tauri` | Rust | Tauri shell. Commands for local recording, folder access and starting the bundled server. |
| `apps/admin` | TypeScript (React) | Admin panel. Built to static files and **embedded into the server binary** with `rust-embed`. |
| `apps/server` | Rust (axum, rusqlite) | `vesper-server`. API, recorder jobs, scheduler, retention, admin panel hosting. |
| `crates/vesper-recorder` | Rust | Records HLS and raw streams to a file or a segment folder. Used by the shell and the server. |
| `packages/cloud-client` | TypeScript | Typed client for the server API, used by the app and the admin panel. |

Turborepo orders the JavaScript tasks (`build`, `typecheck`, `test`); the admin panel builds before the server so the panel can be embedded. Cargo handles the Rust side. `scripts/prepare-sidecar.mjs` ties them together: admin panel, server build, then copy into the place Tauri bundles sidecars from.

## One recorder, everywhere

`vesper-recorder` has no dependency on ffmpeg or on any platform API. It does blocking HTTP with rustls, so it builds for Windows, Linux and Android alike.

```text
record(options, stop_flag, on_progress) -> Summary
  Output::File(path)      one growing .ts file             (local recordings)
  Output::Segments(dir)   segNNNNN.ts + index.m3u8         (cloud recordings)
```

- **HLS source:** follow the playlist, pick the best variant of a master playlist, start at the live edge, append each new segment once, stop when the requested video duration is captured.
- **Raw source** (a `.ts` URL): copy bytes, cutting a new segment every ~10 s on a 188-byte packet boundary.
- A bad segment is skipped; a fatal error after some data was captured still returns what was recorded, with a warning.

The segment sink rewrites `index.m3u8` atomically after each segment, so a viewer can open the recording while it is still being written.

## Server

```text
HTTP /api/v1 ──► extractors (AuthUser, AdminUser) ──► handlers ──► SQLite
                                                         │
                                                         └─► jobs: one thread per recording
background task: every 5 s start due recordings; every 60 s delete expired ones
```

- **State:** one SQLite connection behind a mutex; queries are short. The lock is not re-entrant, so handlers compute anything that needs the database *before* taking it.
- **Auth:** lite mode maps every request to one implicit admin. Full mode looks up the hash of the bearer token in `sessions`.
- **Jobs:** each recording runs `vesper-recorder` on its own OS thread and writes progress and the final status to the database. Stop is an atomic flag.
- **Network safety:** `net::check_target` resolves hosts and refuses private ranges unless allowed; the proxy follows redirects manually and checks each hop.

## App

- **State:** Zustand with persistence. Library data (channels, movies, shows) is session-only; favourites, history, sources, recordings, theme and cloud connection persist.
- **Playback:** hls.js for HLS, the native element for MP4. Quality, fit, speed and zapping are player features.
- **Cloud sync:** `useCloudSync` pulls on connect and every minute and pushes changes after a short debounce; each key is a small JSON document and the newest write wins.
- **Responsive:** a left rail on desktop, a bottom bar on small screens. TV mode adds arrow-key spatial navigation.
- **Icons:** AnimateIcons, imported per icon so unused ones are tree-shaken. A shared hook starts an icon's animation when its whole button is hovered or focused.

## Releases

`ci.yml` checks every push: Biome, TypeScript, tests, builds, `cargo fmt`, `clippy`, tests, and that the Tauri shell compiles on Linux and Windows. `release.yml` runs on a version tag and publishes installers, APK, server archives and a Docker image to one GitHub release.
