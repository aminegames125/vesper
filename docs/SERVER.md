# Vesper Cloud server

`vesper-server` is a single Rust binary. It records streams, keeps your library in sync and serves an admin panel. Data lives in one folder: a SQLite database and your recordings.

## Run it

```bash
vesper-server --mode lite                       # no accounts
vesper-server --mode full                       # accounts, quotas, admin panel
vesper-server --mode full --bind 127.0.0.1:8484 --data-dir /var/lib/vesper
```

| Option | Environment | Default | Meaning |
| --- | --- | --- | --- |
| `--mode` | `VESPER_MODE` | `lite` | `lite` has no logins. `full` has users, roles and quotas. |
| `--bind` | `VESPER_BIND` | `0.0.0.0:8484` | Address and port to listen on. |
| `--data-dir` | `VESPER_DATA_DIR` | `data` | Database and recordings. Back this folder up. |
| `--admin-user` | `VESPER_ADMIN_USER` | – | Create this administrator on first start (full mode). |
| `--admin-password` | `VESPER_ADMIN_PASSWORD` | – | Password for that administrator. |
| `--allow-private` | `VESPER_ALLOW_PRIVATE` | off | Let the proxy and recorder reach private network addresses. Always on in lite mode. |
| `--trust-proxy` | `VESPER_TRUST_PROXY` | off | Read the client address from a reverse proxy's `X-Forwarded-For`, so sign-in limits work behind it. |
| `--allowed-host` | `VESPER_ALLOWED_HOSTS` | – | Extra host names a **lite** server answers to (comma separated), for example one behind a reverse proxy. |
| `--wake-command` | `VESPER_WAKE_COMMAND` | – | Command run whenever the time of the next scheduled recording changes, with that time in `VESPER_NEXT_START` (epoch seconds). Use it to set a wake timer. It can only be set here, never from the app or the admin panel. |

Without `--admin-user`, a fresh full server shows a setup screen at `/admin/` where you create the first administrator.

### Docker

```bash
docker run -d --name vesper --restart unless-stopped \
  -p 8484:8484 -v vesper-data:/data \
  -e VESPER_MODE=full -e VESPER_ADMIN_USER=admin -e VESPER_ADMIN_PASSWORD='choose-a-long-password' \
  ghcr.io/aminegames125/vesper-server:latest
```

### systemd

```ini
# /etc/systemd/system/vesper.service
[Unit]
Description=Vesper Cloud
After=network-online.target

[Service]
ExecStart=/usr/local/bin/vesper-server --mode full --bind 127.0.0.1:8484 --data-dir /var/lib/vesper
Environment=VESPER_ADMIN_USER=admin
EnvironmentFile=/etc/vesper.env        # holds VESPER_ADMIN_PASSWORD=...
User=vesper
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Behind a reverse proxy (HTTPS)

Put Caddy, nginx or Traefik in front and let it handle TLS. With Caddy:

```text
vesper.example.com {
    reverse_proxy 127.0.0.1:8484
}
```

Use HTTPS whenever the server is reachable from the internet. Lite mode must **never** be exposed publicly.

## Modes

**Lite** has one implicit user who owns everything. Anyone who can reach the port can record, sync and open the admin panel. Use it on a home network.

**Full** adds accounts. Passwords are hashed with Argon2id, sessions use random tokens of which only a hash is stored, and failed sign-ins are rate limited per address.

| Role | Can |
| --- | --- |
| `admin` | everything, including the admin panel |
| `user` | watch, sync and record within their quotas |
| `guest` | watch and sync, **cannot record** |

Per-account limits (0 means no limit): recordings at once, longest recording in hours, storage in GB, and a default retention in hours. An admin can suspend an account (which signs it out at once), reset its password, or delete it with its recordings. The last active administrator cannot be removed.

**Registration** is `closed` (only admins add users), `invite` (a valid code is required) or `open`. Invite codes carry a role, limits, a use count and an optional expiry.

## Optional: ffmpeg

Everything works without ffmpeg. If `ffmpeg` is on the server's `PATH`, three extras switch on (`GET /status` reports `"ffmpeg": true`, and the app shows the buttons only then): **thumbnails** for recordings, **Convert to MP4**, and **Cut a part** (which saves a trimmed copy and leaves the original alone).

## Recording and retention

`POST /api/v1/recordings` starts a recording now, or at `start_at` (epoch seconds). `seconds` is its length; `0` records until it is stopped, up to the account's longest recording (a day when there is no limit). The server pulls the stream with the same recorder the apps use and saves it as HLS: a folder of `.ts` segments and an `index.m3u8`. Because it is HLS, any device can play it, **even while it is still recording**.

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

A schedule says "record this channel at 11:00 for 30 minutes on these days". Create one with `POST /api/v1/schedules`:

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

`POST /api/v1/sources` saves an M3U link (`"kind": "m3u"`) or an Xtream login (`"kind": "xtream"`, with `username` and `password`) and checks it right away. `GET /api/v1/channels?source=ID&q=news&group=News&offset=0&limit=100` returns the channels with their stream addresses, group and logo, so an app can offer a channel picker. Lists are cached for ten minutes.

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
| `GET /sync`, `GET/PUT /sync/{key}` | Small JSON documents shared by your devices. |
| `GET /proxy?url=` | Fetch an address on your behalf; playlists are rewritten to stay behind the proxy. |
| `GET/POST /admin/users`, `PATCH/DELETE /admin/users/{id}` | Manage accounts. |
| `POST /admin/users/{id}/revoke` | Sign someone out everywhere. |
| `GET/POST /admin/invites`, `DELETE /admin/invites/{code}` | Invite codes. |
| `GET/PUT /admin/settings` | Registration, defaults, network. |
| `GET /admin/stats`, `/admin/audit`, `/admin/recordings` | Overview, activity log, all recordings. |

A typed client lives in [`packages/cloud-client`](../packages/cloud-client).

## Security notes

- **Providers' logins are stored on the server** inside recordings (the stream address contains them) and, if you turn on source sync, in the sync data. Run the server yourself and protect the data folder.
- The proxy and the recorder refuse **private network addresses** by default in full mode, so a public server cannot be used to probe the network it runs in. Redirects are re-checked at every hop. An admin can allow private addresses in Settings.
- Lite mode has **no authentication**. Do not port-forward it. It only answers to home-network host names and refuses requests that come from another website, with one exception: media links that carry their own token (and share links) may be fetched from other origins, which is what lets a Chromecast play them.
- Put a reverse proxy with TLS in front of any server that leaves your home network.
- Back up the data folder; it holds the only copy of accounts and recordings.

## Build from source

```bash
pnpm install
pnpm --filter @vesper/admin build      # the panel is embedded into the binary
cargo build --release -p vesper-server
```
