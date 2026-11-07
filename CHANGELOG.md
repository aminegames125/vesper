# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.28.3] - 2026-11-07 <!-- release: patch; push: 43; changes: 2 -->

### Fixed
- Follow SERVER_PORT when no bind address is set, so game panels that forward a port just work

### Changed
- Carry unchanged server and Kodi files into each release, and ship less by accident

## [0.28.2] - 2026-11-01 <!-- release: patch; push: 42; changes: 1 -->

### Fixed
- Kodi sign-in prompt, and CI and releases build only what changed

## [0.28.1] - 2026-11-01 <!-- release: patch; push: 41; changes: 1 -->

### Fixed
- Release doctor counts failures per draft and deletes drafts a newer release has overtaken

## [0.28.0] - 2026-11-01 <!-- release: minor; push: 40; changes: 1 -->

### Added
- Server plugins and Kodi extensions

## [0.27.3] - 2026-11-01 <!-- release: patch; push: 39; changes: 1 -->

### Changed
- Release doctor that publishes, retries or deletes stale draft releases

## [0.27.2] - 2026-11-01 <!-- release: patch; push: 38; changes: 1 -->

### Fixed
- Run make_repo.py without -I so it can import build.py

## [0.27.1] - 2026-11-01 <!-- release: patch; push: 37; changes: 1 -->

### Changed
- Remove the Android app folder and its leftovers

## [0.27.0] - 2026-11-01 <!-- release: minor; push: 36; changes: 2 -->

### Added
- Viewer dashboard, downloads with yt-dlp and encoders, sync, Kodi VOD

### Changed
- Ignore generated Gradle and Kotlin build output

## [0.26.0] - 2026-11-01 <!-- release: minor; push: 35; changes: 1 -->

### Added
- Footer with a full-width wordmark, like the portfolio

## [0.25.0] - 2026-11-01 <!-- release: minor; push: 34; changes: 2 -->

### Added
- Redesign the landing page around the Vesper mark

### Changed
- Fix formatting that failed CI

## [0.24.0] - 2026-11-01 <!-- release: minor; push: 33; changes: 2 -->

### Changed
- Vesper is now only a Kodi extension plus a self-hosted recording server. The Android and Android TV app is removed from this branch; the full earlier project, app included, is kept on the `old-full-app` branch.
- Rewrote the README and the guides around recording from Kodi's own Live TV and guide: install the add-on through the Vesper repository, record, and watch recordings in Kodi with resume, including while they are still recording.
- Documented the server's lite mode (home network, no login) and full mode (users, bearer tokens, quotas, HTTPS behind a reverse proxy) as equal paths, with Docker Compose, systemd, Windows service, Caddy and nginx examples.
- Added a code of conduct and a support page, and reworked the contributing guide, security policy, issue templates and pull request template for the Kodi add-on and the server.

### Removed
- The Android and Android TV app documentation and the old app screenshots.

## [0.23.1] - 2026-11-01 <!-- release: patch; push: 32; changes: 1 -->

### Changed
- Revert the app to v0.22.2 (#9)

## [0.22.2] - 2026-11-01 <!-- release: patch; push: 30; changes: 1 -->

### Fixed
- Join demuxed HLS audio renditions and fix Docker full mode

## [0.22.1] - 2026-10-31 <!-- release: patch; push: 29; changes: 1 -->

### Changed
- Keep the add-on version in step with the release

## [0.22.0] - 2026-10-31 <!-- release: minor; push: 28; changes: 3 -->

### Added
- Record from Kodi's own Live TV and connect its IPTV providers automatically

### Fixed
- Prefer HLS variants with sound built in so recordings are not silent

### Changed
- Describe the Kodi add-on as recording on top of Kodi's Live TV

## [0.21.0] - 2026-10-31 <!-- release: minor; push: 27; changes: 1 -->

### Added
- Add and manage IPTV providers from inside Kodi

## [0.20.0] - 2026-10-31 <!-- release: minor; push: 26; changes: 1 -->

### Added
- Kodi repository on GitHub Pages so the add-on installs and updates itself

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
