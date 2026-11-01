"""Saving movies, episodes, web videos and live streams to the Vesper server instead of recording."""

import xbmc
import xbmcgui

from . import api, common, plugins

QUALITIES = [
    ("best", "Best available"),
    ("2160", "Up to 4K"),
    ("1080", "Up to 1080p"),
    ("720", "Up to 720p"),
    ("480", "Up to 480p"),
    ("audio", "Audio only (MP3)"),
]

# Shown when the server cannot be asked; the server refuses any it cannot run.
FALLBACK_ENCODERS = [{"id": "copy", "label": "Original (no re-encode)", "available": True}]


def say(message, error=False):
    icon = xbmcgui.NOTIFICATION_ERROR if error else xbmcgui.NOTIFICATION_INFO
    xbmcgui.Dialog().notification("Vesper", message, icon, 5000)


def pick_encoder(client):
    """Asks which encoder to use, listing only what the server can run. None when cancelled."""
    try:
        encoders = [e for e in client.capabilities().get("encoders", []) if e.get("available")] or FALLBACK_ENCODERS
    except api.VesperError:
        encoders = FALLBACK_ENCODERS
    pick = xbmcgui.Dialog().select("Encoder", [e["label"] for e in encoders])
    return encoders[pick]["id"] if pick >= 0 else None


def pick_quality():
    pick = xbmcgui.Dialog().select("Quality", [label for _, label in QUALITIES])
    return QUALITIES[pick][0] if pick >= 0 else None


def start(client, title, address, live=False, tag="", ask=False):
    """Sends one download to the server, using the encoder and quality from the settings (or asking)."""
    encoder = common.setting("encoder") or ""
    quality = common.setting("quality") or "best"
    if ask or common.flag("ask_encoder", False):
        encoder = pick_encoder(client)
        if encoder is None:
            return False
        if not live and not address.lower().split("?")[0].endswith((".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts")):
            quality = pick_quality()
            if quality is None:
                return False
    try:
        client.download(title, address, encoder=encoder, quality=quality, live=live, tag=tag)
    except api.VesperError as e:
        say(str(e), error=True)
        return False
    say(("Capturing live: " if live else "Downloading: ") + title)
    return True


def from_context():
    """The "Download with Vesper" entry in the menu of any video Kodi lists."""
    path = xbmc.getInfoLabel("ListItem.FileNameAndPath") or xbmc.getInfoLabel("ListItem.Path")
    title = xbmc.getInfoLabel("ListItem.Title") or xbmc.getInfoLabel("ListItem.Label") or "Video"
    try:
        address, source = plugins.resolve(path)
    except plugins.Unsupported as e:
        return say(str(e), error=True)
    try:
        c = common.client()
    except api.VesperError as e:
        return say(str(e), error=True)
    choices = ["Download", "Download, choosing the encoder", "This is a live stream: capture until I stop it"]
    pick = xbmcgui.Dialog().select("%s (%s)" % (title, source), choices)
    if pick < 0:
        return
    start(c, title, address, live=pick == 2, ask=pick == 1)


def from_address():
    """Download from a web address typed or pasted in."""
    address = xbmcgui.Dialog().input("Web address of the video").strip()
    if not address:
        return
    if not plugins.is_web(address):
        return say("Type a web address that starts with http:// or https://.", error=True)
    title = xbmcgui.Dialog().input("Title", defaultt=address.rsplit("/", 1)[-1][:60]).strip() or address[:60]
    try:
        c = common.client()
    except api.VesperError as e:
        return say(str(e), error=True)
    pick = xbmcgui.Dialog().yesno("Vesper", "Is this a live stream?", nolabel="No, a video", yeslabel="Yes, live")
    start(c, title, address, live=bool(pick))


def many(client, entries, label):
    """Downloads a whole season or show after one confirmation. Returns how many were started."""
    if not entries:
        return 0
    if not xbmcgui.Dialog().yesno("Download", "Download %d episodes of %s to the server?" % (len(entries), label), nolabel="Cancel", yeslabel="Download"):
        return 0
    encoder = common.setting("encoder") or ""
    started = 0
    for entry in entries:
        try:
            client.download(entry["name"], entry["url"], encoder=encoder, tag=label)
            started += 1
        except api.VesperError as e:
            say("%s: %s" % (entry["name"], e), error=True)
            if "storage" in str(e).lower() or "too many" in str(e).lower():
                break
    say("Started %d download%s." % (started, "" if started == 1 else "s"))
    return started
