# Architecture

Vesper is a pnpm + Turborepo monorepo with a Cargo workspace. JavaScript and Rust meet in two places: the embedded admin panel and the HTTP API. The native Android and Android TV app talks to that API.

## Packages

| Path | Language | What it is |
| --- | --- | --- |
| `apps/android` | Kotlin (Jetpack Compose, own design system in `ui/kit`) | The Android and Android TV app: schedules, record now, recordings, playback. Talks to the server over HTTP; one view model, no dependency-injection framework. |
| `apps/admin` | TypeScript (React) | Admin panel. Built to static files and **embedded into the server binary** with `rust-embed`. |
| `apps/server` | Rust (axum, rusqlite) | `vesper-server`. API, recorder jobs, scheduler, retention, admin panel hosting. |
| `crates/vesper-recorder` | Rust | Records HLS and raw streams to a file or a segment folder. Used by the server. |
| `packages/cloud-client` | TypeScript | Typed client for the server API, used by the admin panel. |

Turborepo orders the JavaScript tasks (`build`, `typecheck`, `test`); the admin panel builds before the server so the panel can be embedded. Cargo handles the Rust side.

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

## Releases

`ci.yml` checks every push: Biome, TypeScript, tests, builds, `cargo fmt`, `clippy`, tests. `release.yml` runs on a version tag and publishes the server archives and a Docker image to one GitHub release.
