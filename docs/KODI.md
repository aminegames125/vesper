# Vesper for Kodi

The Kodi guide: install the add-on, connect it to your server, record from Kodi's own Live TV and watch recordings with resume.

Vesper adds recording to the Live TV you already have. The add-on does not bring channel lists of its own: it reads the IPTV providers Kodi already uses and adds **Record with Vesper** to Kodi's channel list and TV guide. Your Vesper server records and stores the video; Kodi plays it back.

Contents: [Before you start](#before-you-start) · [Install](#install) · [First run](#first-run) · [Connect to the server](#connect-to-the-server) · [Full mode sign-in](#full-mode-sign-in) · [HTTPS](#https-and-self-signed-certificates) · [Record](#record) · [Schedules](#schedules) · [Watch](#watch-and-manage-recordings) · [Notifications](#notifications) · [Settings](#settings) · [Troubleshooting](#troubleshooting) · [What is tested](#what-is-tested-and-what-is-not)

## Before you start

- **A Vesper server that is running.** See the [server guide](SERVER.md) or the [README quick start](../README.md#quick-start).
- **Kodi 19 (Matrix) or later**, on any device. The add-on is plain Python.
- **Live TV set up in Kodi** with **PVR IPTV Simple Client** and a remote M3U link. That is where Vesper finds your channels.

## Install

### With the repository (recommended, updates itself)

1. Download [repository.vesper-1.0.0.zip](https://amineos.dev/vesper/kodi/repository.vesper/repository.vesper-1.0.0.zip). On a TV box, open that address in its browser or put the file on a USB stick.
2. In Kodi: **Settings > System > Add-ons**, turn on **Unknown sources** (Kodi shows a warning; accept it).
3. **Add-ons > Install from zip file** and pick the file.
4. **Add-ons > Install from repository > Vesper repository > Video add-ons > Vesper > Install.**

When a new add-on version is published, Kodi offers the update on its own.

### With a zip file (no automatic updates)

Download `plugin.video.vesper-<version>.zip` from the [latest release](https://github.com/aminegames125/vesper/releases/latest) and use **Add-ons > Install from zip file**. To build the zip yourself:

```bash
python apps/kodi/build.py        # writes apps/kodi/dist/plugin.video.vesper-<version>.zip
```

## First run

About 20 seconds after Kodi starts, the add-on's background service:

1. **Finds your Vesper server** on the network, when there is exactly one, and saves its address. If that server is in full mode, the notification tells you to enter your username and password.
2. **Connects your IPTV providers.** Every remote playlist set up in PVR IPTV Simple Client is sent to the server once. It checks again every 6 hours, so a provider you add later is picked up too.

A short notification confirms each step. Providers that are already on the server are skipped.

## Connect to the server

**Discovery (default).** The server announces itself on the local network (mDNS, `_vesper._tcp`) and the add-on asks for it. In the add-on, choose **Find Vesper on this network**, or use the button of the same name in the add-on settings. With several servers you pick one.

**Manual address.** Use this when discovery cannot work: guest Wi-Fi, VPNs, Docker's bridge network, a server on another subnet or on the internet. In the add-on settings set the address to something like `192.168.1.20:8484` or `https://vesper.example.com`, or choose **Type the server address** on the add-on's first screen. Use the machine's network address, never `localhost`: Kodi runs on another device. Without a scheme, `http://` is assumed. If you type a plain `http://` address that is not on a home network, the add-on warns that your password would travel unprotected.

**Test the connection** in the settings tells you whether the server answers and, in full mode, whether you are signed in.

## Full mode sign-in

A server started with `--mode full` needs an account. In the add-on settings enter your **Username** and **Password**. The add-on signs in when it needs to, keeps the session token in its add-on data folder, and signs in again by itself if the token expires or is revoked.

- **Create an account from Kodi.** If the server's registration is `open`, or you have an invite code, choose **Create an account (invite code)** in the settings. The add-on asks for the code (when needed), a username and a password, and saves them. An administrator can also create accounts in the admin panel.
- **Sign out** in the settings forgets the session token on this device.
- Use an account with the role `user` or `admin`. A `guest` can watch but cannot record.
- Quotas apply: a recording can be refused because you are at your limit for recordings at once, longest recording or storage. The server's message is shown in a Kodi notification.
- The password is stored in Kodi's own add-on settings, which are plain text on the device. Use an account made for Kodi and not one you use anywhere else.
- Over plain `http://` the sign-in crosses your network unencrypted. On a home LAN that may be fine; for anything else put the server behind HTTPS.

## HTTPS and self-signed certificates

To reach a full-mode server over the internet, put it behind a reverse proxy with HTTPS ([examples](SERVER.md#behind-a-reverse-proxy-https)) and set the add-on address to `https://your.host.name`.

By default the add-on checks the server's certificate. A server with a publicly trusted certificate (Caddy and Let's Encrypt make this automatic) just works. If you use **your own certificate on a home server**, a self-signed one for example, the add-on reports that the certificate is not trusted. Turn off **Check the HTTPS certificate** in the settings to accept it. The add-on then also tells Kodi's player to skip the check for this server's addresses. Only do that for a server you control: with the check off, the connection is encrypted but the server's identity is not verified.

## Record

Open Kodi's **TV > Channels** or **TV > Guide**, open the context menu on a channel or a programme (hold OK, press the menu button, or `C` on a keyboard) and choose **Record with Vesper**.

- **A channel.** Pick how long: 30 minutes, 1 hour, 2 hours or *until I stop it*. It starts now. "Until I stop it" runs until you stop it from the add-on, or until the account's longest-recording limit (a day when there is none).
- **A programme in the guide.** A menu offers:
  - *Record this programme* (or *Record from now until it ends* if it is on now). It records with a minute of padding before the start and three minutes after the end. A future programme is scheduled for its start time. A programme that is already over is refused.
  - *Record every week at this time* and *Record every day at this time*. These create a repeating schedule on the server, so the add-on needs to know your time zone. It reads it from the system where it can; on a device where it cannot (often Windows), enter it under **Advanced > Time zone**, for example `Europe/Paris`. Without a time zone these two choices are not offered.
  - *Record every episode of "title"*. This creates a series rule on the server. It is offered when the channel has a guide id, and it relies on the **server's own TV guide** (an XMLTV address set in the admin panel, [TV guide](SERVER.md#tv-guide-and-series-rules)) to find the episodes, not on Kodi's guide.

The entry appears in the TV channels, TV guide and TV search windows. It is not available while a channel is playing full screen.

Vesper finds the channel on the server **by name** (case and punctuation do not matter). If several channels match it asks which one you mean; if none do, it tells you to add the provider to Kodi's Live TV. If the server knows a backup address for the channel (the same channel from another provider), it is used when the first address keeps failing.

## Schedules

**Add-ons > Video add-ons > Vesper > Schedules** lists what records on its own: repeating schedules and "every episode" rules.

- A **schedule** can be paused or resumed, run now, **edited** (title, start time, length, and repeat: once, every day, weekdays, weekends) or deleted.
- A **series rule** can be paused or deleted.

Schedules with other repeat patterns (for example only Tuesday and Thursday) can be created through the server's [HTTP API](SERVER.md#schedules) and then appear here.

## Watch and manage recordings

Open **Add-ons > Video add-ons > Vesper**.

| Screen | What you can do |
| --- | --- |
| **Continue watching** | Recordings you started and did not finish. Playing one offers to resume where you stopped. |
| **Recording now and coming up** | What is being captured and what starts next. Open a recording in progress to watch it from the start. |
| **Recordings** | Everything finished or failed, with folders. The context menu can keep one forever, mark it watched or unwatched, rename it, move it to a folder, stop it (while recording) or delete it. |
| **Schedules** | See [Schedules](#schedules). |
| **Server** | A summary: version and mode, free disk and how many days it lasts, what records and what is next, channels that stopped working, an available update, and in full mode your account and storage use. |

- **Resume.** Where you stop is saved on the server when playback stops. A recording counts as watched when you reach the end or are within the last 30 seconds. Stopping in the first 20 seconds saves nothing. Because the position lives on the server, a second Kodi on the same server picks up from the same place.
- **While it is still recording.** The playlist grows as the server writes segments, so you can open it before it finishes. It plays from the start. How seeking behaves near the live edge has not been checked on real hardware.
- **Retention.** The server deletes recordings after a while (a week by default, shown on the recording as "Deleted in N d"). Use **Keep forever** to exempt one.
- A recording that failed keeps whatever was captured and shows the reason.

## Notifications

While Kodi runs, the add-on checks the server about every 30 seconds and shows a Kodi notification when a recording **starts**, **finishes** or **fails**, and warns once when the server has less than 2 GB of disk left. It announces only changes it sees while Kodi is running. Turn it off with **Tell me when a recording starts, ends or fails** under **Notifications** in the settings.

## Settings

Open the add-on's settings from **Add-ons > My add-ons > Video add-ons > Vesper > Configure**.

| Setting | What it does |
| --- | --- |
| **Address (leave empty to find it)** | The server address. Leave empty to find it automatically. |
| **Find Vesper on this network** | Runs discovery now and saves the result. |
| **Connect my Kodi IPTV providers now** | Runs the provider step straight away instead of waiting for the 6-hour check. |
| **Check the HTTPS certificate** | On by default. Turn off only for your own server with a self-signed certificate. |
| **Test the connection** | Checks the address and the sign-in. |
| **Username (only if the server asks)**, **Password** | Only for a full-mode server. |
| **Create an account (invite code)**, **Sign out** | Full mode: make an account from Kodi; forget the session on this device. |
| **Offer to resume where I stopped** | Offer *Resume* or *Start from the beginning* when you play a recording you left part way. On by default. |
| **Play recordings with InputStream Adaptive** | Off by default (an expert setting). Turn it on if a recording stutters with Kodi's default player. |
| **Tell me when a recording starts, ends or fails** | Notifications, on by default. |
| **Time zone for repeating recordings** | An IANA name such as `Europe/Paris`, for the "every day" and "every week" choices. Normally detected. |

## Good to know

- **Which providers work.** Playlists in PVR IPTV Simple Client with a remote address are connected automatically, including Xtream providers that give you an M3U link. A playlist that is a file on the device is skipped, because the server cannot read it. Other Live TV add-ons (Tvheadend, Zattoo and so on) do not reveal stream addresses, so Vesper cannot record those. Add the provider's M3U link to PVR IPTV Simple Client and it works.
- **Live viewing stays Kodi's own.** It uses one provider connection from the Kodi device; recording uses another from the server. If your provider allows one connection, watching live and recording at once may fail.
- **Your provider's login is stored on the server**, because it is part of the stream address. Run the server yourself and protect its data folder.

## Troubleshooting

| What you see | What to try |
| --- | --- |
| "Cannot reach http://... (...)" | The address is wrong, the server is off, or Kodi is on another network. Open `http://<address>/admin/` in a browser on the same network. Use **Test the connection**. |
| "Nothing found. Is the server running and on the same network?" | Discovery is blocked or the server runs with `--no-discovery`. Type the address in the settings. With Docker on Linux use host networking. |
| "This server needs a username and password" | Full mode. Enter an account in the add-on settings. |
| "Wrong username or password" | Re-enter them in the settings. Failed sign-ins are limited to 8 per minute per address; wait a minute after "Too many attempts". |
| "This server has no administrator yet" | A full-mode server that was never set up. Open `/admin/` in a browser and create the administrator. |
| "... is not in a provider Vesper knows" | The channel name does not exist in any playlist on the server. Check that the playlist is a remote M3U link in PVR IPTV Simple Client, then run **Connect my Kodi IPTV providers now**. |
| "Nothing new. Set up a playlist in Live TV..." | Kodi has no remote playlist for the add-on to read. Set one up in PVR IPTV Simple Client. |
| Recording refused: disk, quota or "not allowed" | The server's message is shown. Free disk (under 512 MB is refused), raise the account's quota, or use an account that is not a `guest`. |
| "The certificate of ... is not trusted" | See [HTTPS and self-signed certificates](#https-and-self-signed-certificates). |
| "Record every week/day" is missing | The add-on could not tell your time zone. Set **Time zone for repeating recordings**. |
| "Record every episode" is missing, or records nothing | The channel has no guide id, or the server has no TV guide. Set an XMLTV address in the admin panel. |
| A recording stutters | Turn on **Play recordings with InputStream Adaptive**. |
| The context menu has no **Record with Vesper** | It only shows in the TV channels, guide and search windows, not while a channel is playing. Check that the add-on is enabled. |

Kodi's log (`kodi.log`, enable debug logging in **Settings > System > Logging**) helps in a bug report. Remove passwords and provider addresses first. Open issues at [github.com/aminegames125/vesper/issues](https://github.com/aminegames125/vesper/issues).

## What is tested and what is not

Honest status, so you know what to expect.

**Tested**, by the add-on's automated tests (`python -I -m unittest discover -s apps/kodi/tests`), which run without Kodi. The original provider-connect and recording calls were also tried against a real Vesper server in lite and full mode with a stand-in for Kodi's Python modules; the newer features (repeating schedules, series rules, certificate switch, notifications, account creation) are covered by the unit tests only:

- channel-name matching and guide time handling (Kodi reports guide times in UTC);
- reading the provider settings from sample `pvr.iptvsimple` settings files;
- the provider hand-off, recording, schedule, series rule, stop, keep, rename, delete and resume calls;
- the notification logic, time-zone detection and repeat-field calculation;
- network discovery (the mDNS question and reply parsing);
- building the add-on zip and the repository catalogue.

**Not tested in a real Kodi:**

- how the **Record with Vesper** entry and its menus look and behave in Kodi's Live TV windows on a TV or with a remote;
- whether Kodi hands the add-on the guide entry it expects on every Kodi version and PVR setup;
- playback and seeking of a recording that is still being captured;
- the HTTPS certificate switch against Kodi's own player;
- Kodi 19 and 20 specifically (the code handles both settings layouts of PVR IPTV Simple Client, but it has not been run on them), and Android TV, Fire TV, LibreELEC and CoreELEC devices.

If something is off, please open an issue with your Kodi version, device, server mode and add-on version.
