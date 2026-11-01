## What and why

<!-- The problem this solves, not only the change. -->

## Which part

- [ ] Kodi add-on
- [ ] Server or recorder
- [ ] Admin panel
- [ ] Docs, CI or other

## How I tested it

<!-- For add-on changes: Kodi version and device, and lite or full server mode. -->

## Checklist

- [ ] `pnpm exec biome check .` and `pnpm turbo run typecheck test build` pass (if JavaScript changed)
- [ ] `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings` and `cargo test` pass (if Rust changed)
- [ ] `python -I -m unittest discover -s apps/kodi/tests` passes (if the add-on changed)
- [ ] Docs updated, and nothing described that is not finished
- [ ] No new dependency, or the reason is explained above
