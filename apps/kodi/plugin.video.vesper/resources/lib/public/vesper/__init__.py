"""Vesper's public API for other Kodi add-ons.

Add this to your add-on's addon.xml:

    <requires>
      <import addon="plugin.video.vesper" version="0.28.0"/>
    </requires>

then, in Python:

    import vesper
    vesper.download("Some video", "https://example.org/watch/1")

Everything here is stable within one `API_VERSION`; a change that could break a caller raises the
number. Calls that talk to the server raise `vesper.VesperError` with a message fit to show.
If you only want to teach Vesper about your add-on's `plugin://` paths, you do not need any code:
ship a `vesper-extension.json` (see docs/EXTENDING.md).
"""

import sys

import xbmcaddon

API_VERSION = 1

_path = xbmcaddon.Addon("plugin.video.vesper").getAddonInfo("path")
if _path not in sys.path:
    sys.path.insert(0, _path)

from resources.lib import api, common, integrate, library, plugins, syncstate  # noqa: E402

VesperError = api.VesperError


def configured():
    """True when the person has set up a server address."""
    return bool(api.normalise(common.setting("server")))


def client():
    """A signed-in `resources.lib.api.Vesper` for the saved server. Raises VesperError."""
    return common.client()


def capabilities():
    """What the server can do: `{"ffmpeg", "ytdlp", "encoders", "plugins", ...}`."""
    return client().capabilities()


def resolve(kodi_path):
    """`(web address, source name)` for a path Kodi shows (`plugin://...`, `https://...`), or raises
    `vesper.Unsupported` saying why it cannot be downloaded."""
    integrate.load()
    return plugins.resolve(kodi_path)


Unsupported = plugins.Unsupported


def download(title, address, encoder="", quality="", live=False, tag=""):
    """Saves a web address to the server (a file, or a page read by yt-dlp). Returns the item's id.
    `encoder` is an id from `capabilities()["encoders"]`; empty uses the person's default."""
    return client().download(title, address, encoder=encoder, quality=quality, live=live, tag=tag)["id"]


def download_path(title, kodi_path, **options):
    """Like `download`, starting from a Kodi path such as a `plugin://` address."""
    address, _source = resolve(kodi_path)
    return download(title, address, **options)


def record(title, address, seconds, channel_name=""):
    """Starts recording a live stream now, for `seconds` (0 = until stopped). Returns the item's id."""
    return client().record(title, address, seconds, channel_name=channel_name)["id"]


def register_resolver(addon_id, name, rules):
    """Teaches `resolve` about your add-on for this session: `rules` is a list of
    `(parameter name, "https://site/watch/{}")`. A `vesper-extension.json` does the same for good."""
    plugins.register(addon_id, name, rules)


def favorites():
    """The person's favourites, shared with their other devices: `[{"name", "url", "kind"}]`."""
    return syncstate.favorites(library.store())


def add_favorite(name, url, kind="movie"):
    """Adds a favourite (does nothing if it is already one). Returns True if it was added."""
    store = library.store()
    if any(f.get("url") == url for f in syncstate.favorites(store)):
        return False
    syncstate.toggle_favorite(store, {"name": name, "url": url, "kind": kind})
    store.save()
    return True


def sync():
    """Syncs favourites and resume points with the server now."""
    library.run_sync(loud=False)


def announce(event, data):
    """Sends a notification other add-ons can hear (see EVENTS)."""
    integrate.announce(event, data)


# What Vesper announces with JSONRPC.NotifyAll. Listen with xbmc.Monitor.onNotification: `sender`
# is "plugin.video.vesper" and `method` is "Other.<event>", with the data below as JSON.
EVENTS = {
    "item_started": "a recording or download began: {id, title, kind, status, error}",
    "item_finished": "a recording or download finished: {id, title, kind, status, error}",
    "item_failed": "a recording or download failed: {id, title, kind, status, error}",
    "download_started": "a download was sent to the server: {title, url, live}",
}
