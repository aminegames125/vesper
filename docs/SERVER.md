# Vesper server

`vesper-server` is a single Rust binary. It records streams, keeps your library and serves an admin panel. Everything lives in one data folder: a SQLite database (`vesper.db`) and your recordings. It is the other half of the [Vesper Kodi add-on](https://github.com/aminegames125/vesper/blob/main/docs/KODI.md), which records from Kodi's Live TV and plays recordings back.

Contents: [Run it](#run-it) · [Options](#options) · [Docker Compose](#docker-compose) · [systemd](#systemd) · [Windows](#windows) · [Behind a reverse proxy](#behind-a-reverse-proxy-https) · [Lite and full mode](#lite-and-full-mode) · [Full mode setup](#full-mode-setup) · [Security model](#security-model) · [Backups](#backups) · [Upgrading](#upgrading) · [HTTP API](#http-api)

## Run it

Download the archive for your system from the [latest release](https://github.com/aminegames125/vesper/releases/latest) (Windows x64, Linux x64, Linux arm64; each has a `.sha256` file), unpack it and run:

```bash
vesper-server --mode lite                       # no accounts, for a home network
vesper-server --mode full                       # accounts, quotas, admin panel
vesper-server --mode full --bind 127.0.0.1:8484 --data-dir /var/lib/vesper
```

It listens on port `8484`; open `http://<machine>:8484/admin/`. Or use [Docker](#docker-compose).

## Options

Every option is a flag or an environment variable.

| Option | Environment | Default | Meaning |
| --- | --- | --- | --- |
| `--mode` | `VESPER_MODE` | `lite` | `lite` has no logins. `full` has users, roles and quotas. |
| `--bind` | `VESPER_BIND` | `0.0.0.0:8484` | Address and port to listen on. |
| `--data-dir` | `VESPER_DATA_DIR` | `data` | Database and recordings. Back this folder up. |
| `--admin-user` | `VESPER_ADMIN_USER` | none | Create this administrator on first start (full mode). |
| `--admin-password` | `VESPER_ADMIN_PASSWORD` | none | Password for that administrator (at least 8 characters). |
| `--allow-private` | `VESPER_ALLOW_PRIVATE` | off | Let the proxy and recorder reach private network addresses. Always on in lite mode. |
| `--trust-proxy` | `VESPER_TRUST_PROXY` | off | Read the client address from a reverse proxy's `X-Forwarded-For` (the last entry, which the proxy appended), so sign-in limits count real clients. |
| `--allowed-host` | `VESPER_ALLOWED_HOSTS` | none | Extra host names a **lite** server answers to (comma separated), for example one behind a reverse proxy. |
| `--no-discovery` | `VESPER_NO_DISCOVERY` | off | Do not announce the server on the local network (mDNS `_vesper._tcp`), so Kodi cannot find it by itself. |
| `--wake-command` | `VESPER_WAKE_COMMAND` | none | Command run whenever the time of the next scheduled recording changes, with that time in `VESPER_NEXT_START` (epoch seconds). Use it to set a wake timer. It can only be set here, never from the admin panel or API. |

Without `--admin-user`, a fresh full server shows a setup screen at `/admin/` where the first visitor creates the first administrator. On a server that is already reachable from the internet, pass the admin variables instead of leaving that screen open.

A machine that sleeps cannot record. Keep it awake, or use `--wake-command`, for example `--wake-command 'sudo rtcwake -m no -t $VESPER_NEXT_START'` on Linux (single quotes, so your shell does not expand the variable).

## Docker Compose

The image is `ghcr.io/aminegames125/vesper-server` (tags `latest` and one per release such as `v0.23.1`). It stores everything under `/data`, runs as an unprivileged user and listens on `8484`.

**Lite**, for a home network:

```yaml
# docker-compose.yml
services:
  vesper:
    image: ghcr.io/aminegames125/vesper-server:latest
    restart: unless-stopped
    ports:
      - "8484:8484"
    volumes:
      - vesper-data:/data
    environment:
      VESPER_MODE: lite

volumes:
  vesper-data:
```

**Full**, with an administrator created on first start and the server reachable only through a reverse proxy on the same host:

```yaml
services:
  vesper:
    image: ghcr.io/aminegames125/vesper-server:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:8484:8484"      # only the reverse proxy can reach it
    volumes:
      - vesper-data:/data
    environment:
      VESPER_MODE: full
      VESPER_TRUST_PROXY: "true"
      VESPER_ADMIN_USER: admin
      VESPER_ADMIN_PASSWORD: ${VESPER_ADMIN_PASSWORD:?set it in .env}

volumes:
  vesper-data:
```

Put `VESPER_ADMIN_PASSWORD=a-long-password` in a `.env` file next to the compose file (keep it out of version control). The administrator is created only when there are no users, so the variables can stay or be removed afterwards.

Then `docker compose up -d`.

Notes:

- **Discovery in Docker.** mDNS does not cross Docker's default bridge network, so Kodi will not find a containerised server by itself. Type the address in the add-on, or on Linux use `network_mode: host` (then drop `ports`).
- **Bind mounts.** A named volume just works. If you use `./vesper-data:/data`, the folder must be writable by the container's `vesper` user.
- **NAS.** Synology, QNAP, Unraid and TrueNAS can run the same image: map port `8484` and a folder on the big disk to `/data`.
- Build the image yourself from the repository root: `docker build -f apps/server/Dockerfile -t vesper-server .`

## systemd

```ini
# /etc/systemd/system/vesper.service
[Unit]
Description=Vesper server
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/vesper-server --mode full --bind 127.0.0.1:8484 --data-dir /var/lib/vesper --trust-proxy
Environment=VESPER_ADMIN_USER=admin
EnvironmentFile=/etc/vesper.env
User=vesper
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`/etc/vesper.env` holds one line, `VESPER_ADMIN_PASSWORD=...`.

```bash
sudo useradd --system --home /var/lib/vesper --create-home vesper
sudo chmod 600 /etc/vesper.env
sudo systemctl enable --now vesper
```

For a lite server on the home network, use `--mode lite` and drop `--bind`, `--trust-proxy` and the admin lines.

## Windows

Run `vesper-server.exe` from a folder of its own and allow it through the firewall for private networks when Windows asks. To start it when you sign in, press `Win + R`, type `shell:startup` and put a shortcut there. To run it as a service without anyone signed in, a service wrapper such as [NSSM](https://nssm.cc) works. This is a sketch the project has not tested:

```bat
nssm install Vesper "C:\vesper\vesper-server.exe" --mode lite --data-dir "C:\vesper\data"
nssm set Vesper AppEnvironmentExtra VESPER_ADMIN_USER=admin VESPER_ADMIN_PASSWORD=...
nssm start Vesper
```

## Behind a reverse proxy (HTTPS)

Use a reverse proxy for TLS whenever the server is reachable from outside your home. Bind Vesper to `127.0.0.1` so the proxy is the only way in, run it in **full** mode and add `--trust-proxy`. Do not enable `--trust-proxy` on a server that clients can also reach directly: they could then forge their address.

**Caddy** (gets and renews a certificate by itself):

```text
vesper.example.com {
    reverse_proxy 127.0.0.1:8484
}
```

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name vesper.example.com;
    ssl_certificate     /etc/letsencrypt/live/vesper.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vesper.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8484;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

Then point the Kodi add-on at `https://vesper.example.com`. The add-on checks the certificate by default; with a self-signed one, turn off **Check the HTTPS certificate** in the add-on settings.

A lite server behind a proxy would also need `--allowed-host vesper.example.com`, but lite mode must never be reachable from the internet. Use full mode for that.

## Lite and full mode

**Lite** has one implicit user who owns everything. Anyone who can reach the port can record, sync and open the admin panel. Use it on a home network. To limit what a web page on the internet could do to it, a lite server answers only to home-network host names (an address, `localhost`, a single-label name, or a name ending in `.local`, `.lan`, `.home`, `.internal`) and refuses requests that come from another website. Media links that carry their own token, and share links, are the exception, so players on other origins can use them.

**Full** adds accounts. Passwords are hashed with Argon2id (at least 8 characters), sessions use random tokens of which only a hash is stored, and failed sign-ins are limited to 8 per address per minute.

| Role | Can |
| --- | --- |
| `admin` | everything, including the admin panel |
| `user` | watch, sync and record within their quotas |
| `guest` | watch and sync, **cannot record** |

Per-account limits (0 means no limit): recordings at once, longest recording in hours, storage in GB, and a default retention in hours. An admin can suspend an account (which signs it out at once), reset its password, or delete it with its recordings. The last active administrator cannot be removed.

**Registration** is `closed` (only admins add users), `invite` (a valid code is required) or `open`. Invite codes carry a role, limits, a use count and an optional expiry. Sessions last 30 days by default.

| | Lite | Full |
| --- | --- | --- |
| Login | none | username and password, bearer token |
| Admin panel | open to the network | administrator only |
| Private addresses for the recorder | always allowed | refused unless `--allow-private` or an admin allows them |
| Expose to the internet | never | yes, behind HTTPS |

## Full mode setup

1. Start the server with `--mode full`, giving `VESPER_ADMIN_USER` and `VESPER_ADMIN_PASSWORD` ([Docker Compose](#docker-compose) or [systemd](#systemd) above), or open `/admin/` once and create the administrator on the setup screen.
2. Put HTTPS in front if it leaves your home ([reverse proxy](#behind-a-reverse-proxy-https)).
3. In the admin panel, **Users**: create an account for each person or device (role `user`), or set **Settings > Joining** to `invite` and make invite codes.
4. Set quotas under **Settings > Defaults for new accounts** or per user.
5. In Kodi, set the add-on's address and that account's username and password. See the [Kodi guide](https://github.com/aminegames125/vesper/blob/main/docs/KODI.md#full-mode-sign-in).

Over the API, `POST /api/v1/auth/login` with `{"username": "...", "password": "..."}` returns a bearer token.

## Optional: ffmpeg

Everything works without ffmpeg. If `ffmpeg` is on the server's `PATH`, three extras switch on (`GET /status` reports `"ffmpeg": true`, and clients show the buttons only then): **thumbnails** for recordings, **Convert to MP4**, and **Cut a part** (which saves a trimmed copy and leaves the original alone).

## Recording and retention

`POST /api/v1/recordings` starts a recording now, or at `start_at` (epoch seconds). `seconds` is its length; `0` records until it is stopped, up to the account's longest recording (a day when there is no limit). The server pulls the stream with its built-in recorder and saves it as HLS: a folder of `.ts` segments and an `index.m3u8`. Because it is HLS, any device can play it, **even while it is still recording**.

- Live playlists start at the live edge, not at the provider's backlog.
- A recording ends when `seconds` of video have been captured, when stopped, or when the stream ends.
- Encrypted (DRM) streams are refused.
- **Deletion timer:** `keep_hours` deletes the recording that long after it finishes. `0` keeps it forever. When omitted, the account's own value applies, otherwise the server default (`default_keep_hours`, **a week** unless an admin changes or clears it). The timer can be changed afterwards for any single item (`PATCH /recordings/{id}` with `keep_hours`, counted from now) and optionally pulled in once something is marked watched (`delete_watched_days`). Schedules made before the timer existed keep their recordings as they always did.
- **Backup address:** a recording or schedule can name a second address for the channel. After three failed reconnects in a row the recorder switches to it (and back), so a flaky provider link does not end the recording.
- **Picture quality:** `quality: "lowest"` picks the smallest variant of an HLS stream to save disk space.
- **Follow the guide:** with `follow_guide` and an `epg_id`, a programme that runs over keeps recording until the guide says it ended (up to three hours more).
- A scheduled recording that fails before capturing anything is tried again, up to three times, while its programme is still on.
- If the server restarts during a recording, that recording is marked failed and what was captured is kept.

## Schedules

A schedule says "record this channel at 11:00 for 30 minutes on these days". The Kodi add-on creates daily, weekly and one-off schedules from the guide; the admin panel lists and deletes them. For any other pattern, such as Tuesday and Thursday only, make it with the API. Find the channel's address with `GET /api/v1/channels?q=news`, then create one with `POST /api/v1/schedules` (in full mode add `-H 'Authorization: Bearer <token>'`):

```bash
curl -X POST http://localhost:8484/api/v1/schedules -H 'content-type: application/json' -d @schedule.json
```

where `schedule.json` is:

```json
{
  "title": "Morning news",
  "url": "http://provider.example/live/news.ts",
  "tz": "Europe/Paris",
  "start_time": "11:00",
  "seconds": 1800,
  "days": 31,
  "start_date": "2026-11-02",
  "end_date": null,
  "pad_before": 60,
  "pad_after": 120
}
```

- `days` is a bit mask, Monday is 1 and Sunday is 64: `31` is weekdays, `127` every day, `0` records once on `start_date`.
- `start_time` is on the wall clock of `tz`, so 11:00 stays 11:00 across daylight-saving changes.
- `pad_before` and `pad_after` start early and stop late, in seconds (up to an hour each).
- The server keeps the next two weeks of occurrences as ordinary `scheduled` recordings, so they show up in `GET /recordings` with a `scheduleId` and can be cancelled one by one.
- The reply carries `warnings` (for example an overlap with another recording on an account that records one at a time). The schedule is saved either way.
- If the stream drops, the server joins it again (up to 8 times, with growing pauses) and keeps one continuous recording. A recording is refused when the disk has less than 512 MB free.

## Downloads

`POST /api/v1/downloads` with `{"title": "...", "url": "..."}` saves a movie or episode file from one of your sources onto the server (resumable, with progress and the same storage and disk checks as recordings). It appears in `GET /recordings` with `"kind": "download"`; play it from `GET /recordings/{id}/download`, which supports `Range` requests so players can seek and downloads can resume. Up to three run at a time per account.

## TV guide and series rules

Set a **guide address** (an XMLTV `.xml` or `.xml.gz` link from your provider) in the admin panel. The server reads it twice a day, keeps the next two weeks, and matches programmes to channels by the playlist's `tvg-id`, then by name. `GET /guide`, `GET /guide/search?q=` and `POST /guide/refresh` read it.

A **series rule** (`POST /series-rules`) records every programme whose title contains some text on one channel, a minute early and a few minutes late if you like, optionally keeping only the newest N and putting them in a folder. `GET /calendar` lists what is going to be recorded in the next days and marks entries that overlap more than the account's "recordings at once".

## Library

Recordings can have a **folder** (`tag`), a **watched** mark and a **resume position** (`PATCH /recordings/{id}`), **bookmarks** (`/recordings/{id}/bookmarks`), and a **share link** (`POST /recordings/{id}/share`) that plays without signing in until it expires. `GET /recordings?tag=&q=` filters. `GET /status/storage` shows what takes the room, and `GET /status` forecasts how many days of disk are left at the recent pace.

## Playlists and channels

`GET /channels?source=all` merges every source of the account: channels with the same name become one, with the other addresses listed as `alt` (used as backups). Channels are classified as `live`, `movie` or `series` (`&kind=`) from the address and group name.

`POST /api/v1/sources` saves an M3U link (`"kind": "m3u"`) or an Xtream login (`"kind": "xtream"`, with `username` and `password`) and checks it right away. `GET /api/v1/channels?source=ID&q=news&group=News&offset=0&limit=100` returns the channels with their stream addresses, group and logo, so a client can offer a channel picker. Lists are cached for ten minutes.

## Live TV in the browser

You do not need Kodi to use Vesper. Open the server's address in a browser, sign in (lite mode needs no login) and pick **Watch**, then **Live TV**:

- **Playlists** adds or removes an M3U link or an Xtream login, the same sources the Kodi add-on sends.
- Search channels by name or group, then open one to **Watch live**, **Record** it now for 30 minutes, 1 hour, 2 hours or until you stop it, or **Record** a programme from the guide (a minute early, three minutes late; a programme that has not started is scheduled).
- While watching, **Record this** keeps what you have seen and carries on recording.

Watching works by capturing the channel on the server and playing it back as it grows, so the picture starts after a few seconds and lags the broadcast by about one segment. It is a recording that counts toward your concurrent-recording limit, is tagged `.watch`, and is left out of lists (`GET /recordings`), webhooks and plugin events. It ends by itself about a minute after the browser stops fetching its playlist, and its files are deleted. Nothing is re-encoded, so the browser must be able to play the provider's codecs (H.264 and AAC in practice).

## Webhook

Set a **webhook address** in the admin panel (Settings, Notifications); a schedule can have its own. Messages wait out the **quiet hours** you set there. When a recording finishes or fails, or a channel that schedules use stops answering (checked once a day), Vesper posts JSON to it: `event`, `id`, `title`, `seconds`, `bytes`, `error`, plus `content` and `text` with a readable sentence so Discord, ntfy and Slack-style hooks show something useful.

## HTTP API

Base path `/api/v1`. Send `Authorization: Bearer <token>`; media routes also accept `?token=`. In lite mode no token is needed. Errors are `{ "error": "message" }`.

| Method and path | Purpose |
| --- | --- |
| `GET /info` | Version, mode, registration setting, whether setup is needed. Public. |
| `POST /setup` | Create the first administrator (full mode, only while there are no users). |
| `POST /auth/login`, `/auth/register`, `/auth/logout` | Sessions. |
| `GET /auth/me`, `POST /auth/password` | Your account. |
| `GET /recordings`, `POST /recordings` | List and create. |
| `GET /recordings/{id}`, `DELETE /recordings/{id}` | One recording. |
| `POST /recordings/{id}/stop`, `/keep` | Stop or cancel; change retention. |
| `GET /recordings/{id}/index.m3u8` | Playlist for any HLS player. |
| `GET /recordings/{id}/download` | The whole recording as one `.ts` file. |
| `GET/POST /schedules`, `PUT/PATCH/DELETE /schedules/{id}` | Repeating or one-off schedules. `PATCH` pauses or resumes. `keep_last` keeps only the newest N finished recordings. |
| `POST /schedules/{id}/run` | Record a schedule's channel right now. |
| `POST /schedules/{id}/duplicate` | Copy a schedule (the copy starts paused). |
| `POST /schedules/pause` | `{"paused": true}` pauses every schedule of the account, `false` resumes them. |
| `PATCH /recordings/{id}` | Rename a recording: `{"title": "..."}`. |
| `POST /recordings/clear-failed` | Delete all failed recordings of the account. |
| `GET /status`, `GET /status/storage` | Version, disk, counts, next recording, disk forecast, what expires soon, broken channels, update notice; what takes the room. |
| `POST /channels/test` | `{"url": "..."}` opens a stream briefly. With `"seconds": 10` it records a throwaway sample and reports the bitrate. |
| `POST /downloads` | Save a movie or episode on the server. |
| `GET /recordings/{id}/thumb.jpg`, `POST /recordings/{id}/export`, `GET .../export.mp4`, `POST .../trim` | Thumbnail, MP4 export and cutting (need ffmpeg). |
| `GET/POST /recordings/{id}/bookmarks`, `DELETE .../bookmarks/{bookmark}` | Bookmarks. |
| `POST /recordings/{id}/share`, `GET /share/{token}/index.m3u8` | Make and use a link that works without signing in. |
| `GET /guide`, `/guide/search`, `/guide/status`, `POST /guide/refresh` | The TV guide. |
| `GET/POST /series-rules`, `PATCH/DELETE /series-rules/{id}` | Record every episode of a programme. |
| `GET /calendar` | What will be recorded, with overlaps marked. |
| `GET /schedules/export`, `POST /schedules/import` | Keep schedules in a file or move them to another server. |
| `GET /admin/crashes` | Crash reports the server wrote itself (`data/crash/`). Nothing is sent anywhere. |
| `GET/POST /sources`, `DELETE /sources/{id}`, `GET /channels` | Playlists and their channels. |
| `GET/POST /admin/users`, `PATCH/DELETE /admin/users/{id}` | Manage accounts. |
| `POST /admin/users/{id}/revoke` | Sign someone out everywhere. |
| `GET/POST /admin/invites`, `DELETE /admin/invites/{code}` | Invite codes. |
| `GET/PUT /admin/settings` | Registration, defaults, network. |
| `GET /admin/stats`, `/admin/audit`, `/admin/recordings` | Overview, activity log, all recordings. |

A typed TypeScript client lives in [`packages/cloud-client`](https://github.com/aminegames125/vesper/tree/main/packages/cloud-client).

## Security model

- **Provider logins are stored on the server.** They are part of stream addresses in recordings and of the playlists you add. Run the server yourself, restrict who can read the data folder, and use full mode if more than one person has access.
- **Lite mode has no authentication.** Do not port-forward it. The host-name and cross-site checks guard against a web page reaching it from your browser; they are not a substitute for a login.
- **Server-side request forgery.** The proxy and the recorder fetch addresses on a user's behalf. In full mode they refuse private network addresses by default and re-check every redirect, so a public server cannot be used to probe the network it runs in. An admin can allow private addresses in Settings.
- **Tokens.** Bearer tokens are random and stored only as hashes. Playback uses a separate media token, which the Kodi add-on puts in the playback address.
- **TLS.** The server speaks plain HTTP. Terminate TLS in a reverse proxy for anything that leaves your home.
- **Secrets on the command line.** `--admin-password` is visible in the process list; prefer the environment variable or an `EnvironmentFile`.
- **Crash reports** the server writes itself stay in `data/crash/`. Nothing is sent anywhere.
- To report a vulnerability see [SECURITY.md](https://github.com/aminegames125/vesper/blob/main/SECURITY.md).

## Backups

The data folder holds the only copy of accounts, schedules and recordings. For a consistent copy, stop the server (or the container), copy the whole folder (`vesper.db`, any `-wal` and `-shm` files next to it, and `recordings/`), then start it again. Recordings are large and expendable by design, so some people back up only `vesper.db`. Schedules can also be exported to a file with `GET /api/v1/schedules/export` and loaded into another server with `POST /api/v1/schedules/import`.

## Upgrading

Download the new release and replace the binary, or run `docker compose pull && docker compose up -d`. Your data folder is kept and the database is upgraded on start. Take a backup first if the data matters. Once a week the server checks whether a newer version exists and shows it in the admin panel; turn that off in **Settings > Updates**. The Kodi add-on updates itself through its repository.

## Build from source

```bash
pnpm install
pnpm --filter @vesper/admin build      # the panel is embedded into the binary
cargo build --release -p vesper-server
```
