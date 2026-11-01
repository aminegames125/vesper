# Contributing to Vesper

Thanks for helping. Vesper is small on purpose: a Kodi add-on and a recording server. Changes that keep it light, calm and dependable are the best ones. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Where things are

| Path | What it is |
| --- | --- |
| `apps/kodi/plugin.video.vesper` | The Kodi add-on (Python, standard library only) |
| `apps/kodi/repository.vesper` | The Kodi repository add-on |
| `apps/kodi/tests` | Add-on tests (`unittest`; no Kodi and no server needed) |
| `apps/server`, `crates/vesper-recorder` | The server and the recorder (Rust) |
| `apps/admin` | The admin panel (React), embedded into the server binary |
| `packages/cloud-client` | Typed TypeScript client for the server API |
| `apps/site` | The website |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit together.

## Set up

You need Node 22+, pnpm 10+, a stable Rust toolchain and Python 3.11+ (for the add-on).

```bash
corepack enable
pnpm install            # pnpm only: npm and yarn are blocked
```

**Server and admin panel**

```bash
pnpm --filter @vesper/admin build     # the panel is embedded into the binary
pnpm server:lite                      # cargo run -p vesper-server -- --mode lite
pnpm server:full                      # accounts; create the administrator at /admin/
pnpm dev                              # the admin panel with hot reload
```

The server listens on `http://localhost:8484` and keeps its data in `./data`.

**Kodi add-on**

```bash
python -I -m unittest discover -s apps/kodi/tests -v    # the tests
python apps/kodi/build.py                               # apps/kodi/dist/plugin.video.vesper-<version>.zip
python apps/kodi/make_repo.py --version 0.0.0 --out out # the repository catalogue
```

To try the add-on in Kodi, install the zip from `apps/kodi/dist` (Add-ons > Install from zip file) and point it at a server you started above. The tests replace Kodi's modules with stand-ins, so please also try UI changes in a real Kodi and say in the pull request which version and device you used.

## Before you open a pull request

```bash
pnpm exec biome check --write .
pnpm turbo run typecheck test build
cargo fmt --all
cargo clippy --workspace -- -D warnings
cargo test -p vesper-recorder -p vesper-server
python -I -m unittest discover -s apps/kodi/tests
```

CI runs the same checks.

## Guidelines

- **Match the surrounding code**: naming, comment density and idiom. Comments say *why*, not *what*.
- **Keep it light.** Think twice before adding a dependency, in JavaScript, Rust or Python. The add-on must keep working with only what Kodi's Python provides.
- **Kodi compatibility.** The add-on targets Kodi 19 and later (`xbmc.python` 3.0.0). Do not use APIs that need a newer Kodi without a fallback.
- **Admin panel.** Calm interface: short fades, no looping motion, honour `prefers-reduced-motion`. Every control needs an accessible name and a visible focus. Use the colour tokens (`bg-panel`, `text-muted`, `accent`), never raw colours, so dark and light stay in step.
- **Server changes** need a test where practical, and the database lock is not re-entrant: compute values before taking it.
- **Security-sensitive code** (auth, proxy, recorder targets) gets extra care; see [SECURITY.md](SECURITY.md).
- **Docs** live in `README.md` and `docs/`. Change them with the code, and do not describe a feature that is only half done.
- Small, focused pull requests are reviewed fastest. Explain the problem, not just the change.

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Every push to `main` that passes the checks is released automatically: `feat:` makes a minor release, `fix:` and the rest a patch, and a `!` or `BREAKING CHANGE` a major one. `scripts/bump-version.mjs` writes the version into the configs, the README badge, the add-on manifest and the [changelog](CHANGELOG.md); do not edit those version numbers by hand.

## What we will not merge

- Bundled channels, playlists or anything that facilitates piracy.
- Tracking or analytics of any kind.
- Official macOS or iOS builds that the maintainer cannot test.
