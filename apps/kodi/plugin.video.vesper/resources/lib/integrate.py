"""The Kodi side of extending Vesper: finding other add-ons' extension files, and Kodi's own
favourites. The checking lives in extensions.py and kodifav.py, which do not need Kodi."""

import json

import xbmc
import xbmcvfs

from . import extensions, kodifav, plugins

FILE = "vesper-extension.json"
ROOTS = ("special://home/addons/", "special://xbmc/addons/")

_cache = {"loaded": False, "menu": [], "problems": []}


def _installed():
    ids = []
    for root in ROOTS:
        try:
            ids.extend(xbmcvfs.listdir(root)[0])
        except Exception:
            pass
    return sorted(set(ids))


def _read(addon_id):
    for root in ROOTS:
        path = "%s%s/%s" % (root, addon_id, FILE)
        if xbmcvfs.exists(path):
            handle = xbmcvfs.File(path)
            try:
                return handle.read()
            finally:
                handle.close()
    return None


def load(force=False):
    """Registers every resolver other add-ons ship and returns `(menu entries, problems)`.
    The result is kept for the life of the process; `force` reads the folders again."""
    if _cache["loaded"] and not force:
        return _cache["menu"], _cache["problems"]
    found, problems = extensions.scan(_installed(), _read)
    menu = []
    for addon_id, ext in found.items():
        for target, name, rules in ext["resolvers"]:
            plugins.register(target, name, rules)
        menu.extend(dict(item, owner=ext["name"]) for item in ext["menu"])
    for addon_id, why in problems:
        xbmc.log("Vesper: ignoring the extension of %s: %s" % (addon_id, why), xbmc.LOGWARNING)
    _cache.update(loaded=True, menu=menu, problems=problems)
    return menu, problems


def kodi_favourites():
    path = "special://profile/favourites.xml"
    if not xbmcvfs.exists(path):
        return []
    handle = xbmcvfs.File(path)
    try:
        return kodifav.parse(handle.read())
    finally:
        handle.close()


def announce(event, data):
    """Tells every add-on that listens (xbmc.Monitor.onNotification, method `Other.<event>`)."""
    request = {"jsonrpc": "2.0", "id": 1, "method": "JSONRPC.NotifyAll", "params": {"sender": "plugin.video.vesper", "message": event, "data": data}}
    xbmc.executeJSONRPC(json.dumps(request))
