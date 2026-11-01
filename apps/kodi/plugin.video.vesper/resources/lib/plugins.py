"""Turns what Kodi shows for a video into an address the Vesper server can download.

Kodi hands add-ons a path like `plugin://plugin.video.youtube/play/?video_id=abc`, which only Kodi
understands. The server (through yt-dlp) wants the web page: `https://www.youtube.com/watch?v=abc`.
This maps one to the other for the add-ons below. Any other `plugin://` path is tried with the common
parameter names add-ons use for a web address, so the list is a floor, not a ceiling.

No Kodi imports, so it can be tested on its own.
"""

import urllib.parse

# Parameters add-ons commonly use for the page or stream address of a video.
ADDRESS_PARAMS = ("url", "video_url", "page_url", "webpage_url", "link", "stream_url", "src", "u")

# (add-on id, name, [(parameter, address template)]). The first parameter present wins. An add-on
# with no rules still works through the common address parameters above.
PLUGINS = [
    ("plugin.video.youtube", "YouTube", [("video_id", "https://www.youtube.com/watch?v={}"), ("videoid", "https://www.youtube.com/watch?v={}")]),
    ("plugin.video.twitch", "Twitch", [("video_id", "https://www.twitch.tv/videos/{}"), ("channel_name", "https://www.twitch.tv/{}")]),
    ("plugin.video.vimeo", "Vimeo", [("video_id", "https://vimeo.com/{}")]),
    ("plugin.video.dailymotion_com", "Dailymotion", [("video_id", "https://www.dailymotion.com/video/{}"), ("url", "https://www.dailymotion.com/video/{}")]),
    ("plugin.video.odysee", "Odysee", []),
    ("plugin.video.peertube", "PeerTube", []),
    ("plugin.video.rumble", "Rumble", []),
    ("plugin.video.bitchute", "BitChute", []),
    ("plugin.video.arteplussept", "ARTE", []),
    ("plugin.video.ted.talks", "TED Talks", []),
    ("plugin.video.ardmediathek_de", "ARD Mediathek", []),
    ("plugin.video.zdf_de_2016", "ZDF Mediathek", []),
    ("plugin.video.iplayerwww", "BBC iPlayer", []),
    ("plugin.video.itv", "ITVX", []),
    ("plugin.video.svtplay", "SVT Play", []),
    ("plugin.video.nrk", "NRK TV", []),
    ("plugin.video.francetv", "France TV", []),
    ("plugin.video.plutotv", "Pluto TV", []),
    ("plugin.video.crunchyroll", "Crunchyroll", []),
    ("plugin.video.mixcloud", "Mixcloud", []),
    ("plugin.audio.soundcloud", "SoundCloud", []),
    ("plugin.video.reddit_viewer", "Reddit", []),
    ("plugin.video.facebook", "Facebook", []),
    ("plugin.video.internet.archive", "Internet Archive", []),
    ("plugin.video.tubitv", "Tubi", []),
]

BY_ID = {addon_id: (name, rules) for addon_id, name, rules in PLUGINS}


class Unsupported(Exception):
    """Something the person can read about why this one cannot be downloaded."""


def is_web(address):
    return address.lower().startswith(("http://", "https://"))


def _first(query, names):
    for name in names:
        value = query.get(name)
        if value:
            return value
    return ""


def resolve(path):
    """Returns `(address, source name)` for a path Kodi shows, or raises Unsupported."""
    path = (path or "").strip()
    if not path:
        raise Unsupported("Pick a video first.")
    # Kodi writes `image://...` and `videodb://...` for library entries; only real addresses help.
    if is_web(path):
        # A stream address Kodi plays directly: pipes carry headers for Kodi's own player only.
        return path.split("|", 1)[0], "Web address"
    parsed = urllib.parse.urlparse(path)
    if parsed.scheme in ("smb", "nfs", "special", "videodb", "musicdb", "file") or not parsed.scheme:
        raise Unsupported("Vesper cannot reach that location from the server. Only web addresses and add-on videos can be saved.")
    if parsed.scheme != "plugin":
        raise Unsupported("Vesper cannot save %s:// items." % parsed.scheme)

    addon_id = parsed.netloc
    name, rules = BY_ID.get(addon_id, (addon_id.split(".", 2)[-1].replace("_", " ").title() or "Add-on", []))
    query = dict(urllib.parse.parse_qsl(parsed.query))
    for param, template in rules:
        if query.get(param):
            value = query[param]
            return (value if is_web(value) else template.format(urllib.parse.quote(value, safe=""))), name
    found = _first(query, ADDRESS_PARAMS)
    if found:
        found = urllib.parse.unquote(found) if "%3A" in found.upper() else found
        if is_web(found):
            return found.split("|", 1)[0], name
    raise Unsupported(
        "%s did not tell Vesper where this video lives. Open it once with the add-on's own download option, or copy its web address and use Download from address." % name
    )


def supported_ids():
    return [addon_id for addon_id, _, _ in PLUGINS]


def installed(has_addon):
    """The plugins above that this Kodi has, as `[(id, name)]`. `has_addon(id)` asks Kodi."""
    return [(addon_id, name) for addon_id, name, _ in PLUGINS if has_addon(addon_id)]
