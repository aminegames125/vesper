# Contributing to Vesper

Thanks for helping. Vesper is small on purpose, so changes that keep it light, calm and dependable are the best ones.

## Set up

```bash
corepack enable
pnpm install            # pnpm only: npm and yarn are blocked
pnpm dev                # the app in a browser
pnpm desktop            # the desktop app with the bundled server
pnpm server:lite        # the server
```

You need Node 22+, pnpm 10+ and stable Rust. See the [README](README.md#️-develop) for platform notes and [docs/ANDROID.md](docs/ANDROID.md) for Android.

## Before you open a pull request

```bash
pnpm exec biome check --write .
pnpm turbo run typecheck test build
cargo fmt --all
cargo clippy --workspace -- -D warnings
cargo test -p vesper-recorder -p vesper-server
```

CI runs the same checks.

## Guidelines

- **Match the surrounding code**: naming, comment density and idiom. Comments say *why*, not *what*.
- **Keep it light.** Think twice before adding a dependency, in JavaScript or in Rust.
- **Calm interface.** Short fades, no looping motion, honour `prefers-reduced-motion`. Every control needs an accessible name and a visible focus.
- **Both themes.** Use the colour tokens (`bg-panel`, `text-muted`, `accent`), never raw colours, so dark and light stay in step.
- **Server changes** need a test where practical, and the database lock is not re-entrant: compute values before taking it.
- **Security-sensitive code** (auth, proxy, recorder targets) gets extra care; see [SECURITY.md](SECURITY.md).
- Small, focused pull requests are reviewed fastest. Explain the problem, not just the change.

## What we will not merge

- Bundled channels, playlists or anything that facilitates piracy.
- Tracking or analytics of any kind.
- Official macOS or iOS builds that the maintainer cannot test.
