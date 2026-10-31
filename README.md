<p align="center">
  <img src="brand/banner.svg" alt="Vesper: scheduled IPTV recording" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/aminegames125/vesper/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/aminegames125/vesper/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white&style=for-the-badge&color=FF5C7A&labelColor=151518" /></a>
  <!-- version:start --><img alt="Version" src="https://img.shields.io/badge/version-0.12.0-FF5C7A?style=for-the-badge&labelColor=151518" /> <img alt="minor update" src="https://img.shields.io/badge/release-minor-FF5C7A?style=for-the-badge&labelColor=151518" /><!-- version:end -->
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-FF5C7A?style=for-the-badge&labelColor=151518" /></a>
</p>

# Vesper

**Schedule IPTV recordings.** Pick a channel, a date and a time, for example 11:00 to 11:30, and the server records it for you. No need to be watching.

Vesper is a recorder, not a player:

- **Server** for Linux and Windows (and Docker). It runs the schedule, records the streams, keeps the files and cleans up old ones.
- **Native Android and Android TV apps** with system UI only, to set up schedules and watch what was recorded. *Not built yet.*

## Status

| Part | State |
| --- | --- |
| Recorder (`crates/vesper-recorder`) | Works. HLS and raw streams, no ffmpeg. |
| Server (`apps/server`) | Works. Accounts, scheduled recordings, retention, quotas, admin panel. |
| Admin panel (`apps/admin`) | Works. |
| Android and Android TV apps | Next. |

The earlier IPTV player (desktop, web and Android) is kept on the [`old-vesper`](https://github.com/aminegames125/vesper/tree/old-vesper) branch.

## Run the server

```bash
pnpm install
pnpm --filter @vesper/admin build
cargo run -p vesper-server -- --mode lite
```

See the [server guide](docs/SERVER.md) for modes, accounts, Docker and the API, and [architecture](docs/ARCHITECTURE.md) for how the parts fit together.

## Develop

You need Node 22+, pnpm 10+ (pnpm only) and a recent stable Rust.

```bash
pnpm lint        # biome and clippy
pnpm test        # turbo and cargo tests
```

## Licence

MIT. See [LICENSE](LICENSE).
