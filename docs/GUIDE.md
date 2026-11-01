# Walkthrough

An end-to-end path from nothing to your first recording, with pointers to the detailed guides.

| Guide | Read it for |
| --- | --- |
| [Kodi guide](KODI.md) | Installing the add-on, recording from Live TV, watching, settings, troubleshooting |
| [Server guide](SERVER.md) | Options, Docker Compose, systemd, reverse proxy, lite and full mode, API |
| [Architecture](ARCHITECTURE.md) | How the add-on, server and recorder fit together |

## 1. Put the server somewhere that stays on

Anything that is on while you are out will do: a spare PC, a NAS, a mini PC, a Raspberry Pi 4 or newer (use the Linux arm64 build). It needs disk space for the recordings.

- **Docker Compose** is the least work. See [Docker Compose](SERVER.md#docker-compose).
- **A binary** from the [latest release](https://github.com/aminegames125/vesper/releases/latest): Windows x64, Linux x64, Linux arm64. See [Run it](SERVER.md#run-it), [systemd](SERVER.md#systemd) and [Windows](SERVER.md#windows).

Choose a mode now:

- **Lite** for one home network. No login. Never expose it to the internet.
- **Full** if the server is shared or reachable from outside. Users, quotas, HTTPS behind a reverse proxy. See [Full mode setup](SERVER.md#full-mode-setup).

Open `http://<the machine's address>:8484/admin/` to check that it runs. Use the machine's network address, not `localhost`, from other devices.

## 2. Set up Live TV in Kodi

Vesper uses the IPTV providers Kodi already has. In Kodi, set up **PVR IPTV Simple Client** with your provider's remote M3U link. If you already watch live TV in Kodi, you are done.

## 3. Install the add-on

Install the Vesper repository zip, then the add-on from it. Step by step in the [Kodi guide](KODI.md#install). Within about 20 seconds of Kodi starting, the add-on finds the server and connects your providers. For a full-mode server, enter the username and password in the add-on settings first ([sign-in](KODI.md#full-mode-sign-in)).

## 4. Record

- **A channel now:** TV > Channels, context menu on a channel, **Record with Vesper**, pick a length.
- **A programme:** TV > Guide, context menu on a programme, **Record with Vesper**. A future programme is scheduled; one that is on now records from now until it ends.
- **Repeating:** on a programme choose *Record every day*, *Record every week* or *Record every episode*. Other day patterns go through the [HTTP API](SERVER.md#schedules). **Schedules** in the add-on lists, edits and pauses them.

Details: [Record](KODI.md#record).

## 5. Watch

Add-ons > Video add-ons > Vesper. **Continue watching** has what you left part way, **Recording now and coming up** shows live captures (open one to watch from the start) and **Recordings** holds the finished ones. See [Watch and manage recordings](KODI.md#watch-and-manage-recordings).

## 6. How long things are kept

Recordings are deleted from the server after a while so the disk never fills up. The default is **a week**. Change the default in the admin panel (Settings, Defaults for new accounts), set a timer for one recording through the API (`keep_hours`), or use **Keep forever** in the add-on. Watched recordings can be deleted sooner (admin panel, Settings, Storage). A recording is refused when the disk has less than 512 MB free. More in [Recording and retention](SERVER.md#recording-and-retention).

## 7. The extras

- **ffmpeg (optional):** install it on the server for thumbnails, MP4 export and cutting.
- **Webhook:** the admin panel can post to Discord, ntfy or a Slack-style hook when a recording finishes or fails. See [Webhook](SERVER.md#webhook).
- **TV guide on the server:** an XMLTV address in the admin panel lets a schedule follow the guide when a programme runs over. Kodi's own guide is used for recording from Kodi.
- **Waking a sleeping PC:** a machine that is off cannot record. Use `--wake-command` ([Options](SERVER.md#options)).

## 8. Updates

The add-on updates through its repository. For the server, replace the binary or run `docker compose pull && docker compose up -d`; your data folder is kept. See [Upgrading](SERVER.md#upgrading).
