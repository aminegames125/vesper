# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.19.0] - 2026-10-31 <!-- release: minor; push: 25; changes: 1 -->

### Added
- Kodi add-on for recordings, live channels and schedules

## [0.18.0] - 2026-10-31 <!-- release: minor; push: 24; changes: 1 -->

### Added
- Cast from shared links and playlists, TV channel zapping, fewer 404 failures

## [0.17.0] - 2026-10-31 <!-- release: minor; push: 23; changes: 1 -->

### Added
- The app finds the server on the local network

## [0.16.0] - 2026-10-31 <!-- release: minor; push: 22; changes: 1 -->

### Added
- Picture quality for watch and cast, landing page, new banner, and fixes for the open findings

## [0.15.0] - 2026-10-31 <!-- release: minor; push: 21; changes: 1 -->

### Added
- Downloads, deletion timer, Chromecast, TV guide, series rules and a TV home screen

## [0.14.1] - 2026-10-31 <!-- release: patch; push: 20; changes: 1 -->

### Fixed
- Reconnect stalled streams, keep one open playlist, enforce quota while recording, cap downloads, guard lite mode and pin DNS

## [0.14.0] - 2026-10-31 <!-- release: minor; push: 19; changes: 1 -->

### Added
- Webhook, keep newest N, run now, duplicate, pause all, rename, favourites and server status, plus fixes from a bug hunt

## [0.13.1] - 2026-10-31 <!-- release: patch; push: 18; changes: 1 -->

### Fixed
- Make gradlew executable so CI can build the Android app

## [0.13.0] - 2026-10-31 <!-- release: minor; push: 17; changes: 2 -->

### Added
- Native Android and Android TV app with record now and schedules, new README
- Record until stopped, and a schedules page in the admin panel

## [0.12.0] - 2026-10-31 <!-- release: minor; push: 16; changes: 1 -->

### Added
- Repeating schedules, padding, reconnect on drop, disk check, playlists and channel search

## [0.11.2] - 2026-10-31 <!-- release: patch; push: 15; changes: 1 -->

### Changed
- Turn Vesper into a scheduled IPTV recorder, old player lives on old-vesper

## [0.11.1] - 2026-10-31 <!-- release: patch; push: 14; changes: 1 -->

### Fixed
- Readable text in the dark theme and a proper adaptive, themed app icon

## [0.11.0] - 2026-10-31 <!-- release: minor; push: 13; changes: 1 -->

### Added
- Shorter rounded navigation with a More menu on desktop, phone and TV

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
