## What and why

<!-- The problem this solves, not only the change. -->

## Checklist

- [ ] `pnpm exec biome check .` and `pnpm turbo run typecheck test build` pass
- [ ] `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings` and `cargo test` pass (if Rust changed)
- [ ] Works in the dark **and** light theme (if the UI changed)
- [ ] No new dependency, or the reason is explained above
