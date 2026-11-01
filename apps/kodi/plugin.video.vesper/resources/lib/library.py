"""Keeping Kodi and the server in step: the sync of favourites and resume points, and the `.strm`
files that put finished downloads into Kodi's own video library."""

import json
import os

import xbmc
import xbmcgui
import xbmcvfs

from . import api, common, syncstate, vod

PLAY = "plugin://plugin.video.vesper/?action=play&id="


def _data_dir():
    folder = xbmcvfs.translatePath("special://profile/addon_data/%s/" % common.ADDON.getAddonInfo("id"))
    os.makedirs(folder, exist_ok=True)
    return folder


def store():
    return syncstate.Store(os.path.join(_data_dir(), "sync.json"))


def say(message, error=False):
    icon = xbmcgui.NOTIFICATION_ERROR if error else xbmcgui.NOTIFICATION_INFO
    xbmcgui.Dialog().notification("Vesper", message, icon, 4000)


def run_sync(loud=False):
    """Pulls and pushes favourites and resume points, then refreshes the library files."""
    if not common.flag("sync_enabled", True) and not loud:
        return
    try:
        c = common.client()
        pulled, pushed = syncstate.sync(store(), c)
        exported = export_library(c) if common.flag("export_library", False) else 0
    except api.VesperError as e:
        if loud:
            say(str(e), error=True)
        return
    if loud:
        say("Synced: %d from the server, %d sent%s." % (pulled, pushed, ", %d added to the library" % exported if exported else ""))


# -- the Kodi video library ---------------------------------------------------------------


def export_folder():
    return xbmcvfs.translatePath(common.setting("library_path") or os.path.join(_data_dir(), "library"))


def export_library(client):
    """Writes a `.strm` for each finished download, and removes the ones whose download is gone.
    Returns how many were added. Add the folder as a source in Kodi (Videos > Files > Add videos)."""
    base = export_folder()
    index_path = os.path.join(_data_dir(), "exported.json")
    try:
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    except (OSError, ValueError):
        index = {}
    rows = [r for r in client.recordings(kind="download").get("recordings", []) if r["status"] == "done"]
    live_ids = {r["id"] for r in rows}
    added = 0
    for rel, rid in list(index.items()):
        if rid not in live_ids:
            try:
                os.remove(os.path.join(base, rel))
            except OSError:
                pass
            del index[rel]
    have = set(index)
    for r in rows:
        # Series folders only when the file name really looks like an episode.
        rel = vod.library_path(r["title"], "series" if vod.parse_episode(r["title"]) else "movie")
        if rel in have:
            continue
        target = os.path.join(base, *rel.split("/"))
        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(PLAY + r["id"])
        except OSError:
            continue
        index[rel] = r["id"]
        added += 1
    try:
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index, f)
    except OSError:
        pass
    if added:
        xbmc.executebuiltin("UpdateLibrary(video)")
    return added
