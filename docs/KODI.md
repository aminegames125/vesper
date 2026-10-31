# Vesper for Kodi

An add-on for [Kodi](https://kodi.tv) 19 (Matrix) and later. It is a thin remote for your Vesper server: recordings, playlists and schedules stay on the server, and Kodi only plays them. It works on every Kodi (Android TV and Fire TV, LibreELEC, CoreELEC, Windows, Linux, macOS) because it is plain Python.

## Install (recommended: the repository, so it updates itself)

1. Download [repository.vesper-1.0.0.zip](https://amineos.dev/vesper/kodi/repository.vesper/repository.vesper-1.0.0.zip) (on a TV box, open that address in its browser or put the file on a USB stick).
2. In Kodi: **Settings > System > Add-ons**, turn on **Unknown sources**.
3. **Add-ons > Install from zip file** and pick it.
4. **Add-ons > Install from repository > Vesper repository > Video add-ons > Vesper > Install.**

From then on Kodi checks for new versions on its own. The repository is rebuilt after every Vesper release.

## Install from a single zip (no updates)

1. Download `plugin.video.vesper-….zip` from the [latest release](https://github.com/aminegames125/vesper/releases/latest).
2. In Kodi: **Settings > System > Add-ons**, turn on **Unknown sources**.
3. **Add-ons > Install from zip file** and pick the zip. (On a TV box, put the zip on a USB stick, a network share, or fetch it with a file manager.)
4. Open **Add-ons > Video add-ons > Vesper**. With no address saved it offers **Find Vesper on this network**; pick your server and you are in.

Building the zip yourself: `python apps/kodi/build.py` (writes `apps/kodi/dist/`).

## Add your IPTV provider from Kodi

You do not need the phone app or the admin panel. On first start the home screen leads with **Add your IPTV provider**; later it lives under **IPTV providers**. Pick one of:

- **Playlist link (M3U)**: paste the link your provider gave you.
- **Xtream login**: server address, username and password.
- **Use the one from Kodi's Live TV**: if you already set a playlist up in *PVR IPTV Simple Client*, Vesper finds its link and offers it, so you do not type it twice. (Playlists that are files on the device are skipped, because the server cannot read them.)

The server checks the provider and loads its channels. They show up under Live TV, Movies and Series, and each one has **Record now** in its context menu. The provider is saved on the server, so the Android app sees it too. Remove one from **IPTV providers**; recordings already made stay.

## What it does

| Screen | What you can do |
| --- | --- |
| **Continue watching** | Recordings you started and did not finish. Playing one offers to resume where you stopped. |
| **Recording now and coming up** | See what is being captured and what starts next. Open a recording that is still in progress to watch it live from the start. |
| **Recordings** | Everything finished, with folders. Open the context menu (hold OK, or press `C` on a keyboard) to keep one forever, mark it watched, stop it or delete it. |
| **Live TV, Movies, Series** | Your server's playlists, by group. Press OK to watch. The context menu has **Record now** (30 minutes, 1 or 2 hours, or until you stop it), **What's on** (the TV guide; pick a programme to record it) and, for movies and episodes, **Download to the server**. |
| **Schedules** | See what records on its own. Pause or resume one, run it now, or delete it. Create them in the Vesper app or the admin panel. |

Where you stop is saved on the server, so the Android app and any other Kodi pick up from the same place.

## Settings

- **Address**: leave empty to find the server automatically (uses mDNS on the local network; some guest Wi-Fi, VPN and Docker bridge setups block it, so you can also type `192.168.1.20:8484`).
- **Username and password**: only when the server runs in *full* mode. Lite mode needs none.
- **Play recordings with InputStream Adaptive**: off by default, because Kodi's own player handles HLS. Turn it on if a recording stutters.

## Good to know

- Live channels play straight from your provider, from the Kodi device, so they use one of your provider connections while you watch. Recording happens on the server.
- Kodi has no cast sender, so casting stays in the Android app.
- Vesper does not add channels to Kodi's own Live TV window; it has its own Live TV list. Recording is done by the server, not by Kodi.
- Tested here: the add-on's logic against a real Vesper server (lite and full mode), adding and removing a provider, and network discovery. The "use the one from Kodi's Live TV" import is tested against sample settings files only, not a real PVR IPTV Simple install. It has **not** been run inside a real Kodi yet, so how the menus look and feel on your TV, and the context menu on your remote, is untested. Please open an issue if something is off.
