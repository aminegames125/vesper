# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.10.0] - 2026-10-31 <!-- release: minor; push: 12; changes: 2 -->

### Added
- Designed changelog with release type and push counts, banner for releases

### Fixed
- Player controls, Live TV playback, local-only server, sync and onboarding bugs

## [0.9.0] - 2026-10-31

### Added
- Immersive desktop layout, three-pane Live TV, fix cloud and stream access on ports

## [0.8.0] - 2026-10-31

### Added
- Focus-driven full-screen TV Home with glass top bar

## [0.7.0] - 2026-10-31

### Added
- Rotating full-bleed TV billboard, floating TV bar, Android first-run welcome

## [0.6.0] - 2026-10-31

### Added
- New desktop shell, full-screen welcome, two-pane sources, automatic changelog

## [0.5.0] - 2026-10-31

### Added
- Netflix-style TV top bar and expanding rows

## [0.4.0] - 2026-10-31

### Added
- TV side rail, taller TV hero, and settings to hide Home rows

## [0.3.1] - 2026-10-31

### Fixed
- Polish desktop, Android and TV UI motion, focus and hierarchy

## [0.3.0] - 2026-10-31

### Added
- Working desktop playback, reliable server start, billboard, top 10, richer player

## [0.2.2] - 2026-10-31

### Fixed
- One-click MSIX installer that trusts the signing certificate

## [0.2.1] - 2026-10-31

### Changed
- Version every push to main automatically

## [0.2.0] - 2026-10-30

### Added
- **Vesper Cloud** server (Rust, axum, SQLite) with **lite** and **full** modes, an embedded admin panel, users, roles, quotas, invite codes, activity log, cloud recording, scheduled recording, retention, sync and a stream proxy.
- Shared `vesper-recorder` crate: HLS and raw recorder that needs no ffmpeg, used by the app and the server.
- Local recording on Android and Android TV through the same crate.
- Cloud settings in the app: connect, sign in, choose what syncs, run the bundled server on this PC.
- Cloud tab in Recordings; record to the cloud from the player and the guide.
- Phone layout and Android TV mode.
- GitHub Actions: CI and a release pipeline for installers, APK, server archives and a Docker image.
- Documentation, banners and design kit.

### Changed
- Redesigned app: Home, Live TV, timeline Guide, Favourites, dark and light themes, animated icons.
- Monorepo with pnpm and Turborepo; npm and yarn are blocked.

## [0.1.0]

First version of Vesper: Xtream and M3U sources, live TV, movies, series, catch-up and ffmpeg-based recording.
