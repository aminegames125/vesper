# Vesper for Kodi

Recording and scheduling on top of the Live TV you already have in Kodi. The add-on does not bring its own channel lists: it reads the IPTV providers Kodi already uses, and adds **Record with Vesper** to Kodi's own channel list and TV guide. Your Vesper server makes and keeps the recordings; Kodi plays them back.

Works on Kodi 19 (Matrix) and later, on every Kodi (Android TV and Fire TV, LibreELEC, CoreELEC, Windows, Linux, macOS), because it is plain Python.

## Install (recommended: the repository, so it updates itself)

1. Download [repository.vesper-1.0.0.zip](https://amineos.dev/vesper/kodi/repository.vesper/repository.vesper-1.0.0.zip) (on a TV box, open that address in its browser or put the file on a USB stick).
2. In Kodi: **Settings > System > Add-ons**, turn on **Unknown sources**.
3. **Add-ons > Install from zip file** and pick it.
4. **Add-ons > Install from repository > Vesper repository > Video add-ons > Vesper > Install.**

Or install a single `plugin.video.vesper-….zip` from the [latest release](https://github.com/aminegames125/vesper/releases/latest) the same way (no automatic updates). Build it yourself with `python apps/kodi/build.py`.

That is all. About 20 seconds after Kodi starts, the add-on:

1. **finds your Vesper server** on the network (when there is exactly one), and
2. **connects your IPTV providers**: every playlist set up in Kodi's Live TV (*PVR IPTV Simple Client*) is handed to the server, once. It checks again every 6 hours, so a provider you add later is picked up too.

## Record

Open Kodi's **TV > Channels** or **TV > Guide**, press the menu button on a channel or a programme (hold OK, or `C` on a keyboard), and choose **Record with Vesper**.

- **A channel:** pick how long: 30 minutes, 1 or 2 hours, or until you stop it. It starts now.
- **A programme in the guide:** it records that programme, with a minute before and three after. If it has not started it is **scheduled**; if it is on now it records from now until it ends.

If a channel has a backup address on the server (the same channel from another provider), it is used when the first one fails.

## Watch and manage recordings

**Add-ons > Video add-ons > Vesper** has only what Kodi cannot do itself:

| Screen | What you can do |
| --- | --- |
| **Continue watching** | Recordings you started and did not finish. Playing one offers to resume where you stopped. |
| **Recording now and coming up** | What is being captured and what starts next. Open a recording in progress to watch it from the start. |
| **Recordings** | Everything finished, with folders. The context menu keeps one forever, marks it watched, stops it or deletes it. |
| **Schedules** | Repeating schedules made in the Vesper app: pause, resume, run now, delete. |

Where you stop is saved on the server, so the Android app and any other Kodi pick up from the same place.

## Settings

- **Address**: leave empty to find the server automatically (mDNS; some guest Wi-Fi, VPN and Docker bridge setups block it, so you can also type `192.168.1.20:8484`).
- **Connect my Kodi IPTV providers now**: runs the provider step straight away instead of waiting.
- **Username and password**: only when the server runs in *full* mode. Lite mode needs none.
- **Play recordings with InputStream Adaptive**: off by default. Turn it on if a recording stutters.

## Good to know

- **Which providers work.** Playlists in *PVR IPTV Simple Client* (including Xtream providers that give you an M3U link) are connected automatically. A playlist that is a file on the device is skipped, because the server cannot read it. Other Live TV add-ons (Tvheadend, Zattoo and so on) do not reveal their stream addresses, so Vesper cannot record those; it tells you so instead of failing quietly. Add the provider's M3U link to *PVR IPTV Simple Client* and it works.
- **Channel names must match.** Vesper finds the channel by name (case and punctuation do not matter). If several channels match, it asks which one.
- **Repeating schedules** (every day at 20:00) are made in the Vesper app or admin panel. From Kodi you schedule single programmes.
- **Live viewing** stays Kodi's own: it uses one of your provider connections from the Kodi device, while recording uses one from the server.
- **Not tested in a real Kodi.** Tested here: the matching, time handling, provider connection and recording calls, against a real Vesper server (lite and full mode) with a stand-in for Kodi; the provider import against sample settings files; and network discovery. Not tested: how the entry appears in Kodi's Live TV menus on your TV or remote, whether Kodi gives the add-on the guide entry it expects, and its UTC guide times. The entry is added to the TV channels, guide and search windows only; it is not available while a channel is playing full screen. Please open an issue if something is off.
