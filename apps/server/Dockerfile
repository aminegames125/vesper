# Vesper server. Build from the repository root (docker compose does this for you):
#   docker build -f apps/server/Dockerfile -t vesper-server .
#   docker run -p 8484:8484 -v vesper-data:/data -e VESPER_MODE=full \
#     -e VESPER_ADMIN_USER=admin -e VESPER_ADMIN_PASSWORD=change-me-please vesper-server
# The release workflow publishes it for linux/amd64 and linux/arm64 (Raspberry Pi, NAS).

# 1. The admin panel, embedded into the binary later. It is plain files, so it is built once on the
#    build machine whatever the target architecture is.
FROM --platform=$BUILDPLATFORM node:22-slim AS admin
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

# 3. A small runtime image. ffmpeg makes thumbnails (shown in Kodi), exports and trims; curl is
#    for the health check; ca-certificates lets the server reach https providers.
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /data vesper
COPY --from=build /repo/target/release/vesper-server /usr/local/bin/vesper-server
USER vesper
VOLUME /data
EXPOSE 8484
ENV VESPER_DATA_DIR=/data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${SERVER_PORT:-8484}/api/v1/info" >/dev/null || exit 1
ENTRYPOINT ["vesper-server"]
