# Vesper Cloud server. Build from the repository root:
#   docker build -f apps/server/Dockerfile -t vesper-server .
#   docker run -p 8484:8484 -v vesper-data:/data vesper-server

# 1. The admin panel, embedded into the binary later.
FROM node:22-slim AS admin
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY scripts ./scripts
COPY apps/admin ./apps/admin
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @vesper/admin...
RUN pnpm --filter @vesper/admin build

# 2. The server.
FROM rust:1-slim-bookworm AS build
WORKDIR /repo
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps/server ./apps/server
COPY --from=admin /repo/apps/admin/dist ./apps/admin/dist
RUN cargo build --release -p vesper-server

# 3. A small runtime image.
FROM debian:bookworm-slim
RUN useradd --system --create-home --home-dir /data vesper
COPY --from=build /repo/target/release/vesper-server /usr/local/bin/vesper-server
USER vesper
VOLUME /data
EXPOSE 8484
ENV VESPER_DATA_DIR=/data VESPER_BIND=0.0.0.0:8484
ENTRYPOINT ["vesper-server"]
