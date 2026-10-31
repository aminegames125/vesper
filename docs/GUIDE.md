# Using Vesper

A walk through setting Vesper up and the things people ask for most. For every option and endpoint see the [server guide](SERVER.md).

## 1. Put the server somewhere that stays on

Anything that is on while you are out will do: a spare PC, a NAS, a mini PC, a Raspberry Pi 4 or newer.

**Windows.** Download `vesper-server-windows-x64.exe` from the [latest release](https://github.com/aminegames125/vesper/releases/latest), put it in a folder of its own and run it. To start it with Windows, press `Win + R`, type `shell:startup` and drop a shortcut to the file there. Allow it through the firewall when Windows asks (private networks only).

**Linux.** Download the build for your CPU, make it executable and run it. The [systemd unit](SERVER.md#systemd) keeps it running.

**Docker, with Compose.** Save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  vesper:
    image: ghcr.io/aminegames125/vesper-server:latest
    restart: unless-stopped
    ports:
      - "8484:8484"
    volumes:
      - ./vesper-data:/data
    environment:
      VESPER_MODE: lite   # no accounts; use "full" for several people
```

**A NAS.** Most NAS systems (Synology, QNAP, Unraid, TrueNAS) can run the Docker image: map port `8484` and a folder for `/data`, and pick a folder on the big disk. Back that folder up.

Open `http://<the machine's address>:8484/admin/` to see the admin panel.

## 2. Install the app

Download the APK from the release page and install it on your phone, tablet or Android TV. In the app, type the server's address (for example `192.168.1.20:8484`). Use the machine's **network address**, not `localhost`: a TV or Chromecast cannot reach `localhost`.

## 3. Add your channels

Settings, **Add a playlist**: paste your M3U link or Xtream login. The server reads it, so the login stays on the server. With more than one playlist, same-named channels are joined and the other address becomes an automatic backup.

## 4. Record

- **Record now**: Recordings, **Record now**, pick a channel and a length.
- **Schedule**: Schedule, **New schedule**. Pick the channel, the day and time, how long, and the repeat.
- **From the TV guide**: add your provider's XMLTV link in the admin panel (Settings, TV guide). Then Schedule, **TV guide** finds a programme by name and records it once or **every time** it is on.
- **Share a link** to a stream from another app (Share, Vesper) to record it straight away.

## 5. How long things are kept

Recordings and downloads are deleted from the server after a while so the disk never fills up. The default is **a week**. You can:

- change the default: Settings, **Deleting old recordings** (as an admin);
- change it for one schedule while you create it ("Delete recordings after");
- change it for one recording any time: its menu, **Delete after…** (1 day, 1 week, 1 month, or forever);
- have watched recordings go sooner: admin panel, Settings, Storage.

The app warns you the day before something is deleted.

## 6. Movies and series

In the channel list, switch to **Movies** or **Series**. The download button saves the file on the server. When it is done, it shows in Recordings and plays like any recording; from there, **Save to this phone** copies it to the phone.

## 7. Chromecast

If a stream does not play on your Android TV app, play it on your phone and cast it: open a channel (the play button), press the cast icon, choose the TV. The phone hands the stream's address to the Chromecast, which then plays it by itself.

Notes:

- The phone needs Google Play services (the TV does not).
- Chromecast plays HLS and MP4 well. A raw `.ts` Xtream channel is automatically offered as `.m3u8`, which most providers also serve.
- The phone and the Chromecast must be on the same network, and the app must use the server's network address (not `localhost`).

## 8. The things in the background

- **Backup address**: if a channel keeps failing, the recorder switches to its backup and back.
- **Channel checks**: once a day the server opens every channel your schedules use. A channel that stops answering is shown in Settings, and sent to your webhook.
- **Quiet hours**: set them in the admin panel for the webhook, and in the app for its own notifications.
- **Disk forecast**: Settings shows how many days of room are left at the recent pace.
- **ffmpeg (optional)**: install it on the server and thumbnails, *Convert to MP4* and *Cut a part* appear.

## 9. Waking a sleeping PC

A server cannot wake itself from being off. If the PC sleeps, give it a wake timer for the next recording:

```bash
vesper-server --wake-command "sudo rtcwake -m no -t \$VESPER_NEXT_START"
```

On Windows, a small script run through `--wake-command` can create a scheduled task with *Wake the computer to run this task* for the time in `%VESPER_NEXT_START%`.

## 10. HTTPS and the internet

Lite mode is for your home network only. To reach the server from outside, use `--mode full`, put it behind a reverse proxy with HTTPS (for example Caddy: `vesper.example.com { reverse_proxy 127.0.0.1:8484 }`), and add `--trust-proxy`.

## 11. Updates

Download the new release and replace the file (or `docker compose pull && docker compose up -d`). Your data folder is kept. Once a week the server tells the app if a newer version exists; turn that off in the admin panel (Settings, Updates).
