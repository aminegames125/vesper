"""The screens. Every function draws one directory or does one action; `route` picks by `action`."""

import re
import sys
import time
import urllib.parse

import xbmc
import xbmcgui
import xbmcplugin

from . import api, bridge, common, discovery, downloads, integrate, library, plugins, syncstate, vod

HANDLE = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else -1
BASE = "plugin://plugin.video.vesper/"

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# -- small helpers --------------------------------------------------------------------------


def url(**params):
    return BASE + "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})


def say(message, heading="Vesper", error=False):
    icon = xbmcgui.NOTIFICATION_ERROR if error else xbmcgui.NOTIFICATION_INFO
    xbmcgui.Dialog().notification(heading, message, icon, 4000)


def clock(seconds):
    seconds = max(0, int(seconds))
    h, m, s = seconds // 3600, seconds // 60 % 60, seconds % 60
    return "%d:%02d:%02d" % (h, m, s) if h else "%d:%02d" % (m, s)


def when(epoch):
    return time.strftime("%a %d %b, %H:%M", time.localtime(epoch))


def size(n):
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return ("%d %s" if unit == "B" else "%.1f %s") % (n, unit)
        n /= 1024.0


def item(label, art=None, plot="", playable=False, resume=0, total=0, menu=None):
    li = xbmcgui.ListItem(label=label)
    art = art or {}
    li.setArt({"icon": art.get("icon", ""), "thumb": art.get("thumb", art.get("icon", "")), "poster": art.get("thumb", "")})
    tag = li.getVideoInfoTag() if hasattr(li, "getVideoInfoTag") else None
    if tag is not None and hasattr(tag, "setTitle"):
        tag.setTitle(label)
        tag.setPlot(plot)
        if total:
            tag.setDuration(int(total))
        if resume and total:
            tag.setResumePoint(float(resume), float(total))
    else:
        li.setInfo("video", {"title": label, "plot": plot, "duration": int(total or 0)})
    if playable:
        li.setProperty("IsPlayable", "true")
    if menu:
        li.addContextMenuItems(menu)
    return li


def add(target, li, folder):
    xbmcplugin.addDirectoryItem(HANDLE, target, li, isFolder=folder)


def finish(content="videos", cache=False):
    xbmcplugin.setContent(HANDLE, content)
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=cache)


def refresh():
    xbmc.executebuiltin("Container.Refresh")


def failed(error):
    say(str(error), error=True)
    xbmcplugin.endOfDirectory(HANDLE, succeeded=False)


def get_client():
    if not api.normalise(common.setting("server")):
        raise api.VesperError("No server yet. Open Settings and choose Find Vesper on this network.")
    return common.client()


# -- start ----------------------------------------------------------------------------------


def root():
    if not api.normalise(common.setting("server")):
        add(url(action="discover"), item("Find Vesper on this network", plot="Looks for your server automatically."), False)
        add(url(action="type_address"), item("Type the server address", plot="For example 192.168.1.20:8484"), False)
        return finish()
    try:
        c = get_client()
        rows = c.recordings().get("recordings", [])
        providers = c.sources()
    except api.VesperError as e:
        add(url(action="discover"), item("Find Vesper on this network"), False)
        add(url(action="settings"), item("Open settings"), False)
        say(str(e), error=True)
        return finish()
    live = sum(1 for r in rows if r["status"] == "recording")
    soon = sum(1 for r in rows if r["status"] in ("scheduled", "queued"))
    resumable = sum(1 for r in rows if r["status"] == "done" and not r["watched"] and r["positionS"] > 20)
    parts = []
    if live:
        parts.append("%d recording now" % live)
    if soon:
        parts.append("%d coming up" % soon)
    add(url(action="recordings", view="continue"), item("Continue watching" + (" (%d)" % resumable if resumable else "")), True)
    add(url(action="recordings", view="active"), item("Recording now and coming up", plot=", ".join(parts)), True)
    add(url(action="recordings", view="done", kind="recording"), item("Recordings"), True)
    add(url(action="vod", kind="movie"), item("Movies", plot="Movies from your providers: play them or save them to the server."), True)
    add(url(action="vod", kind="series"), item("Series", plot="Shows and seasons from your providers."), True)
    add(url(action="downloads"), item("Downloads", plot="Movies, episodes and videos saved on your server."), True)
    add(url(action="favorites"), item("Favourites", plot="Kept in step on all your devices."), True)
    add(url(action="kodi_favourites"), item("Kodi favourites", plot="Your Kodi favourites: play them here or save them to the server."), True)
    menu, _problems = integrate.load()
    for entry in menu:
        add(entry["path"], item(entry["label"], plot="From " + entry["owner"]), True)
    add(url(action="schedules"), item("Schedules", plot="What records on its own: repeating schedules and series."), True)
    add(url(action="plugins"), item("Add-ons Vesper can save from", plot="YouTube, Twitch, Vimeo and more."), True)
    add(url(action="download_address"), item("Download from a web address", plot="Paste a link: a video, a YouTube live, a movie file."), False)
    add(url(action="sync_now"), item("Sync now", plot="Favourites and resume points, and the Kodi library files."), False)
    add(url(action="status"), item("Server", plot="Disk space, what is next, and your account."), False)
    if not providers:
        add(
            url(action="sync"),
            item("Connect my IPTV providers", plot="Reads the playlists set up in Kodi's Live TV. To record, press the menu button on a channel or programme and choose Record with Vesper."),
            False,
        )
    finish()


def type_address():
    text = xbmcgui.Dialog().input("Server address", defaultt=common.setting("server"))
    if not text:
        return
    address = api.normalise(text)
    if address.startswith("http://") and not api.is_private_host(address):
        # A server out on the internet: the password would travel unprotected.
        if not xbmcgui.Dialog().yesno(
            "Vesper",
            "This address is not on your home network and does not use HTTPS, so your password would be sent in the clear. "
            "Put the server behind HTTPS (a reverse proxy) and type an https:// address. Use it anyway?",
            nolabel="No",
            yeslabel="Use it anyway",
        ):
            return
    common.set_setting("server", address)
    refresh()


def discover():
    progress = xbmcgui.DialogProgress()
    progress.create("Vesper", "Looking for Vesper on this network...")
    found = discovery.discover(3.5)
    progress.close()
    if not found:
        say("Nothing found. Is the server running and on the same network? You can type the address instead.", error=True)
        return
    if len(found) == 1:
        chosen = found[0]
    else:
        pick = xbmcgui.Dialog().select("Choose a server", ["%s  (%s)" % (s["name"], s["address"]) for s in found])
        if pick < 0:
            return
        chosen = found[pick]
    common.set_setting("server", chosen["address"])
    if chosen.get("mode") == "full" and not common.setting("username"):
        say("Found %s. It has accounts: enter your username and password in the settings." % chosen["name"])
        xbmc.executebuiltin("Addon.OpenSettings(plugin.video.vesper)")
    else:
        say("Connected to " + chosen["name"])
    refresh()


# -- recordings -----------------------------------------------------------------------------


def status_line(r):
    if r["status"] == "recording":
        return "Recording now, %s so far" % clock(r["seconds"])
    if r["status"] in ("scheduled", "queued"):
        return "Starts " + when(r["startAt"])
    if r["status"] == "failed":
        return "Failed: " + (r.get("error") or "unknown error")
    bits = [clock(r["seconds"]), size(r["bytes"])]
    if r.get("keepUntil"):
        left = r["keepUntil"] - time.time()
        bits.append("Deleted in %d d" % max(0, left // 86400) if left > 86400 else "Deleted soon")
    return ", ".join(bits)


def recording_item(c, r):
    label = r["title"]
    if r["status"] == "recording":
        label = "[COLOR FFFF5C7A]REC[/COLOR]  " + label
    elif r["status"] in ("scheduled", "queued"):
        label = "[COLOR FF9A9AA3]" + when(r["startAt"]) + "[/COLOR]  " + label
    elif r["status"] == "failed":
        label = "[COLOR FF9A9AA3]Failed[/COLOR]  " + label
    elif r["watched"]:
        label = "[COLOR FF9A9AA3]" + label + "[/COLOR]"
    plot = "\n".join(x for x in (r.get("channelName"), status_line(r)) if x)
    art = {}
    if r.get("thumb"):
        art = {"thumb": c.thumb_url(r["id"])}
    playable = r["status"] in ("done", "recording")
    menu = []
    if r["status"] == "recording":
        menu.append(("Stop recording", "RunPlugin(%s)" % url(action="stop", id=r["id"])))
    if r["status"] == "done":
        menu.append(("Keep forever", "RunPlugin(%s)" % url(action="keep", id=r["id"])))
        menu.append(
            ("Mark as unwatched" if r["watched"] else "Mark as watched", "RunPlugin(%s)" % url(action="watched", id=r["id"], value="0" if r["watched"] else "1"))
        )
    menu.append(("Rename", "RunPlugin(%s)" % url(action="rename", id=r["id"], title=r["title"])))
    if r["status"] == "done":
        menu.append(("Move to folder", "RunPlugin(%s)" % url(action="folder", id=r["id"], tag=r.get("tag", ""))))
    menu.append(("Delete", "RunPlugin(%s)" % url(action="delete", id=r["id"], title=r["title"])))
    total = r["seconds"] if r["status"] == "done" else 0
    li = item(label, art, plot, playable, resume=0 if r["watched"] else r["positionS"], total=total, menu=menu)
    return (url(action="play", id=r["id"]) if playable else url(action="noop")), li, False


def recordings(view="done", tag="", kind=""):
    try:
        c = get_client()
        data = c.recordings(tag=tag, kind=kind)
    except api.VesperError as e:
        return failed(e)
    rows = data.get("recordings", [])
    if view == "continue":
        rows = [r for r in rows if r["status"] == "done" and not r["watched"] and r["positionS"] > 20]
    elif view == "active":
        rows = sorted(
            (r for r in rows if r["status"] in ("recording", "scheduled", "queued")),
            key=lambda r: (r["status"] != "recording", r["startAt"]),
        )
    else:
        rows = [r for r in rows if r["status"] in ("done", "failed")]
        if not tag:
            for name in data.get("tags", []):
                add(url(action="recordings", view="done", tag=name, kind=kind), item(name), True)
    for r in rows:
        target, li, folder = recording_item(c, r)
        add(target, li, folder)
    if not rows and not tag:
        add(url(action="noop"), item("Nothing here yet"), False)
    finish("episodes")


def play(rid):
    try:
        c = get_client()
        rec = next((r for r in c.recordings().get("recordings", []) if r["id"] == rid), None)
        if not rec:
            raise api.VesperError("That recording is gone.")
        target = c.play_url(rec)
    except api.VesperError as e:
        say(str(e), error=True)
        return xbmcplugin.setResolvedUrl(HANDLE, False, xbmcgui.ListItem())
    offset = 0
    where = rec.get("positionS") or 0
    if rec["status"] == "done" and not rec["watched"] and where > 30 and common.setting("ask_resume") != "false":
        pick = xbmcgui.Dialog().select(rec["title"], ["Resume from " + clock(where), "Start from the beginning"])
        if pick < 0:
            return xbmcplugin.setResolvedUrl(HANDLE, False, xbmcgui.ListItem())
        offset = where if pick == 0 else 0
    li = xbmcgui.ListItem(label=rec["title"], path=target)
    if rec.get("kind") != "download":
        li.setMimeType("application/vnd.apple.mpegurl")
        li.setContentLookup(False)
        if common.setting("use_adaptive") == "true":
            li.setProperty("inputstream", "inputstream.adaptive")
            li.setProperty("inputstream.adaptive.manifest_type", "hls")
    if offset:
        li.setProperty("StartOffset", str(offset))
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def confirm_delete(rid, title):
    if not xbmcgui.Dialog().yesno("Delete", "Delete \"%s\" from the server?" % title, nolabel="Keep it", yeslabel="Delete"):
        return
    act(lambda c: c.delete(rid), "Deleted")


def rename(rid, title):
    text = xbmcgui.Dialog().input("New title", defaultt=title).strip()
    if text and text != title:
        act(lambda c: c.rename(rid, text), "Renamed")


def folder(rid, tag):
    text = xbmcgui.Dialog().input("Folder name", defaultt=tag).strip()
    if text and text != tag:
        act(lambda c: c.set_folder(rid, text), "Moved")


def act(call, done):
    try:
        call(get_client())
        say(done)
    except api.VesperError as e:
        say(str(e), error=True)
    refresh()


# -- schedules ------------------------------------------------------------------------------


def repeats(days, start_date):
    if not days:
        return "once, " + start_date
    if days == 127:
        return "every day"
    if days == 31:
        return "weekdays"
    if days == 96:
        return "weekends"
    return ", ".join(DAYS[i] for i in range(7) if days & (1 << i))


def schedules():
    try:
        c = get_client()
        rows = c.schedules()
        rules = c.rules()
    except api.VesperError as e:
        return failed(e)
    for s in rows:
        paused = not s.get("enabled", True)
        label = "%s  %s" % (s["startTime"], s["title"])
        plot = "%s, %s%s" % (repeats(s["days"], s["startDate"]), s["channelName"], "\nPaused" if paused else "")
        if s.get("nextStart") and not paused:
            plot += "\nNext: " + when(s["nextStart"])
        if paused:
            label = "[COLOR FF9A9AA3]%s (paused)[/COLOR]" % label
        add(url(action="schedule_menu", id=s["id"], paused="1" if paused else "0", title=s["title"]), item(label, plot=plot), False)
    for r in rules:
        paused = not r.get("enabled", True)
        label = "Every episode: %s" % r["title"]
        if paused:
            label = "[COLOR FF9A9AA3]%s (paused)[/COLOR]" % label
        add(url(action="rule_menu", id=r["id"], paused="1" if paused else "0", title=r["title"]), item(label, plot=r.get("channelName", "")), False)
    if not rows and not rules:
        add(url(action="noop"), item("Nothing scheduled. Press the menu button on a programme in Kodi's TV guide and choose Record with Vesper."), False)
    finish("videos")


def schedule_menu(sid, paused, title):
    options = ["Resume" if paused == "1" else "Pause", "Record now", "Edit", "Delete"]
    pick = xbmcgui.Dialog().select(title, options)
    if pick == 0:
        act(lambda c: c.set_schedule_enabled(sid, paused == "1"), "Done")
    elif pick == 1:
        act(lambda c: c.run_schedule(sid), "Recording started")
    elif pick == 2:
        edit_schedule(sid)
    elif pick == 3 and xbmcgui.Dialog().yesno("Delete", "Delete the schedule \"%s\"?" % title):
        act(lambda c: c.delete_schedule(sid), "Deleted")


REPEAT_CHOICES = [("Once", 0), ("Every day", 127), ("Weekdays", 31), ("Weekends", 96)]


def edit_schedule(sid):
    try:
        row = next((s for s in get_client().schedules() if s["id"] == sid), None)
    except api.VesperError as e:
        return say(str(e), error=True)
    if not row:
        return say("That schedule is gone.", error=True)
    dialog = xbmcgui.Dialog()
    pick = dialog.select(
        row["title"],
        ["Title: " + row["title"], "Start time: " + row["startTime"], "Length: %d minutes" % (row["seconds"] // 60), "Repeats: " + repeats(row["days"], row["startDate"])],
    )
    changes = {}
    if pick == 0:
        text = dialog.input("Title", defaultt=row["title"]).strip()
        if text:
            changes["title"] = text
    elif pick == 1:
        text = dialog.input("Start time (HH:MM)", defaultt=row["startTime"]).strip()
        if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", text):
            changes["start_time"] = text
        elif text:
            return say("Use the form 21:30.", error=True)
    elif pick == 2:
        text = dialog.input("Length in minutes", defaultt=str(row["seconds"] // 60)).strip()
        if text.isdigit() and int(text) > 0:
            changes["seconds"] = int(text) * 60
        elif text:
            return say("Type a number of minutes.", error=True)
    elif pick == 3:
        chosen = dialog.select("Repeats", [label for label, _ in REPEAT_CHOICES])
        if chosen >= 0:
            changes["days"] = REPEAT_CHOICES[chosen][1]
    if changes:
        act(lambda c: c.update_schedule(row, **changes), "Saved")


def rule_menu(rid, paused, title):
    pick = xbmcgui.Dialog().select(title, ["Resume" if paused == "1" else "Pause", "Delete"])
    if pick == 0:
        act(lambda c: c.set_rule_enabled(rid, paused == "1"), "Done")
    elif pick == 1 and xbmcgui.Dialog().yesno("Delete", "Stop recording every episode of \"%s\"?" % title):
        act(lambda c: c.delete_rule(rid), "Deleted")


# -- movies and series ----------------------------------------------------------------------

PAGE = 100


def vod_item(entry, kind):
    """One playable movie or episode, with save and favourite in its menu."""
    art = {"icon": entry.get("logo", ""), "thumb": entry.get("logo", "")}
    target = url(action="play_url", url=entry["url"], title=entry["name"])
    menu = [
        ("Download with Vesper", "RunPlugin(%s)" % url(action="dl", url=entry["url"], title=entry["name"], group=entry.get("group", ""))),
        ("Download, choosing the encoder", "RunPlugin(%s)" % url(action="dl", url=entry["url"], title=entry["name"], ask="1")),
        ("Favourite or unfavourite", "RunPlugin(%s)" % url(action="fav", url=entry["url"], title=entry["name"], kind=kind)),
    ]
    return target, item(entry["name"], art, entry.get("group", ""), playable=True, menu=menu), False


def vod_view(kind="movie", group="", offset=0):
    try:
        c = get_client()
        data = c.channels("all", group=group, kind=kind, offset=offset, limit=PAGE if kind == "movie" or not group else 500)
    except api.VesperError as e:
        return failed(e)
    entries = data.get("channels", [])
    if not group:
        groups = sorted(set(g for g in data.get("groups", []) if g))
        for name in groups:
            add(url(action="vod", kind=kind, group=name), item(name), True)
        if not groups:
            add(url(action="noop"), item("Nothing here yet. Connect your IPTV providers first."), False)
        return finish("videos")
    if kind == "series":
        for show in sorted(vod.shows(entries)):
            add(url(action="show", group=group, show=show), item(show), True)
        return finish("tvshows")
    for entry in entries:
        target, li, folder = vod_item(entry, kind)
        add(target, li, folder)
    total = data.get("total", 0)
    if offset + PAGE < total:
        add(url(action="vod", kind=kind, group=group, offset=offset + PAGE), item("Next page (%d more)" % (total - offset - PAGE)), True)
    finish("movies")


def show(group, name, season=None):
    try:
        c = get_client()
        data = c.channels("all", group=group, kind="series", limit=500)
    except api.VesperError as e:
        return failed(e)
    seasons = vod.shows(data.get("channels", [])).get(name, {})
    if season is None and len(seasons) > 1:
        add(url(action="dl_many", group=group, show=name), item("Download every episode"), False)
        for number in sorted(seasons):
            label = "Season %d" % number if number else "Episodes"
            add(url(action="show", group=group, show=name, season=number), item(label, plot="%d episodes" % len(seasons[number])), True)
        return finish("seasons")
    picked = [int(season)] if season is not None else list(seasons)
    for number in sorted(picked):
        for episode, entry in seasons.get(number, []):
            target, li, folder = vod_item(entry, "series")
            add(target, li, folder)
    add(url(action="dl_many", group=group, show=name, season=season if season is not None else ""), item("Download these episodes"), False)
    finish("episodes")


def download_many(group, name, season=""):
    try:
        c = get_client()
        data = c.channels("all", group=group, kind="series", limit=500)
    except api.VesperError as e:
        return say(str(e), error=True)
    seasons = vod.shows(data.get("channels", [])).get(name, {})
    numbers = [int(season)] if str(season).isdigit() else sorted(seasons)
    entries = [entry for n in numbers for _, entry in seasons.get(n, [])]
    downloads.many(c, entries, name + (" season %s" % season if str(season).isdigit() else ""))


def play_url(address, title):
    """Plays a provider's movie or episode, resuming from a point kept by sync."""
    offset = 0
    saved = library.store().get(syncstate.resume_key(address))
    if isinstance(saved, dict) and saved.get("at", 0) > 30 and not saved.get("done") and common.setting("ask_resume") != "false":
        pick = xbmcgui.Dialog().select(title, ["Resume from " + clock(saved["at"]), "Start from the beginning"])
        if pick < 0:
            return xbmcplugin.setResolvedUrl(HANDLE, False, xbmcgui.ListItem())
        offset = saved["at"] if pick == 0 else 0
    li = xbmcgui.ListItem(label=title, path=address)
    if offset:
        li.setProperty("StartOffset", str(offset))
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def download_one(address, title, group="", ask=False):
    try:
        c = get_client()
    except api.VesperError as e:
        return say(str(e), error=True)
    downloads.start(c, title, address, tag=group, ask=ask)


# -- downloads, favourites, add-ons ---------------------------------------------------------


def download_list():
    try:
        c = get_client()
        data = c.recordings(kind="download")
    except api.VesperError as e:
        return failed(e)
    add(url(action="download_address"), item("Download from a web address", plot="Paste a link: a video, a YouTube live, a movie file."), False)
    for r in data.get("recordings", []):
        target, li, folder = recording_item(c, r)
        if r["status"] == "recording":
            total = r.get("totalBytes")
            li.setLabel("[COLOR FFFF5C7A]%s[/COLOR]  %s" % ("%d%%" % (100 * r["bytes"] // total) if total else "...", r["title"]))
        add(target, li, folder)
    finish("videos")


def favorites():
    rows = syncstate.favorites(library.store())
    for r in rows:
        target = url(action="play_url", url=r["url"], title=r["name"])
        menu = [
            ("Download with Vesper", "RunPlugin(%s)" % url(action="dl", url=r["url"], title=r["name"])),
            ("Remove from favourites", "RunPlugin(%s)" % url(action="fav", url=r["url"], title=r["name"], kind=r.get("kind", "movie"))),
        ]
        add(target, item(r["name"], playable=True, menu=menu), False)
    if not rows:
        add(url(action="noop"), item("No favourites yet. Press the menu button on a movie or episode."), False)
    finish("videos")


def toggle_favorite(address, title, kind):
    store = library.store()
    added = syncstate.toggle_favorite(store, {"name": title, "url": address, "kind": kind or "movie"})
    store.save()
    say(("Added to favourites: " if added else "Removed from favourites: ") + title)
    refresh()
    try:
        library.run_sync()
    except Exception:
        pass


def plugin_list():
    have = {addon_id for addon_id, _ in plugins.installed(lambda a: xbmc.getCondVisibility("System.HasAddon(%s)" % a))}
    integrate.load()
    for addon_id, name in plugins.all_plugins():
        label = name if addon_id in have else "[COLOR FF9A9AA3]%s (not installed)[/COLOR]" % name
        add(url(action="plugin_info", id=addon_id, title=name), item(label, plot=addon_id), False)
    finish("videos")


def kodi_favourites():
    """Kodi's own favourites that play one thing, playable here and downloadable."""
    rows = integrate.kodi_favourites()
    for r in rows:
        menu = [
            ("Download with Vesper", "RunPlugin(%s)" % url(action="dl_path", path=r["path"], title=r["name"])),
            ("Add to Vesper favourites", "RunPlugin(%s)" % url(action="fav", url=r["path"], title=r["name"], kind="movie")),
        ]
        add(r["path"], item(r["name"], {"thumb": r["thumb"], "icon": r["thumb"]}, playable=True, menu=menu), False)
    if not rows:
        add(url(action="noop"), item("No Kodi favourites that play a video."), False)
    finish("videos")


def download_path(path, title):
    """Download from a Kodi path (a plugin:// address, a stream); the shared entry point for the
    context menu, Kodi favourites and other add-ons calling `RunPlugin`."""
    integrate.load()
    try:
        address, source = plugins.resolve(path)
        c = get_client()
    except (plugins.Unsupported, api.VesperError) as e:
        return say(str(e), error=True)
    downloads.start(c, title or source, address)


def plugin_info(addon_id, name):
    installed = xbmc.getCondVisibility("System.HasAddon(%s)" % addon_id)
    if installed and xbmcgui.Dialog().yesno(
        name,
        "Open %s, highlight a video and press the menu button (or long press), then choose Download with Vesper. YouTube live streams work too." % name,
        nolabel="OK",
        yeslabel="Open " + name,
    ):
        xbmc.executebuiltin("ActivateWindow(Videos,plugin://%s/,return)" % addon_id)
    elif not installed:
        xbmcgui.Dialog().ok(name, "%s is not installed. Install it from Kodi's add-on browser, then come back." % name)


# -- server and account ---------------------------------------------------------------------


def status():
    try:
        c = get_client()
        st = c.status()
        me = c.me() if c.mode == "full" else None
    except api.VesperError as e:
        return say(str(e), error=True)
    lines = ["Vesper %s, %s mode" % (st.get("version", "?"), st.get("mode", "?"))]
    if st.get("diskFree") is not None:
        disk = "Disk: %s free" % size(st["diskFree"])
        if st.get("diskTotal"):
            disk += " of " + size(st["diskTotal"])
        lines.append(disk)
    if st.get("daysLeft") is not None:
        lines.append("At the recent pace the disk lasts about %d days." % st["daysLeft"])
    lines.append("Recording now: %d, coming up: %d, failed: %d" % (st.get("recording", 0), st.get("scheduled", 0), st.get("failed", 0)))
    nxt = st.get("next")
    lines.append("Next: %s, %s" % (nxt["title"], when(nxt["startAt"])) if nxt else "Next: nothing scheduled")
    if st.get("ffmpeg") is False:
        lines.append("ffmpeg was not found on the server; recording needs it.")
    if st.get("brokenChannels"):
        lines.append("Channels that stopped working: " + ", ".join(b["name"] for b in st["brokenChannels"][:5]))
    if st.get("updateAvailable"):
        lines.append("A newer server is available: " + str(st["updateAvailable"]))
    if me:
        limit = me.get("storage_bytes") or 0
        lines.append("Account: %s (%s). Storage used: %s%s" % (me.get("username"), me.get("role"), size(me.get("storageUsed", 0)), " of " + size(limit) if limit else ""))
        if me.get("max_concurrent"):
            lines.append("You can record %d at a time." % me["max_concurrent"])
    xbmcgui.Dialog().textviewer("Vesper server", "\n".join(lines))


def test_connection():
    try:
        c = common.client()
    except api.VesperError as e:
        return say(str(e), error=True)
    if c.mode == "full":
        say("Connected, signed in as %s." % c.username)
    else:
        say("Connected. This server has no accounts (lite mode).")


def sign_out():
    try:
        common.client(ready=False).sign_out()
    except api.VesperError:
        pass
    say("Signed out.")


def register():
    """Makes an account on a full-mode server that is open to sign-ups or gives out invites."""
    dialog = xbmcgui.Dialog()
    try:
        c = common.client(ready=False)
        info = c.info()
    except api.VesperError as e:
        return say(str(e), error=True)
    if info.get("mode") != "full":
        return say("This server has no accounts to create.")
    invite = ""
    if info.get("registration") != "open":
        invite = dialog.input("Invite code").strip()
        if not invite:
            return
    name = dialog.input("Choose a username").strip()
    password = dialog.input("Choose a password (8 letters or more)", option=xbmcgui.ALPHANUM_HIDE_INPUT)
    if not name or not password:
        return
    try:
        c.register(name, password, invite)
    except api.VesperError as e:
        return say(str(e), error=True)
    common.set_setting("username", name)
    common.set_setting("password", password)
    say("Account created. You are signed in.")
    refresh()


# -- router ---------------------------------------------------------------------------------


def route(query):
    q = dict(urllib.parse.parse_qsl(query.lstrip("?")))
    action = q.get("action", "")
    if action == "":
        root()
    elif action == "recordings":
        recordings(q.get("view", "done"), q.get("tag", ""), q.get("kind", ""))
    elif action == "vod":
        vod_view(q.get("kind", "movie"), q.get("group", ""), int(q.get("offset", 0) or 0))
    elif action == "show":
        show(q["group"], q["show"], q.get("season"))
    elif action == "play_url":
        play_url(q["url"], q.get("title", ""))
    elif action == "dl":
        download_one(q["url"], q.get("title", "Video"), q.get("group", ""), q.get("ask") == "1")
    elif action == "dl_many":
        download_many(q["group"], q["show"], q.get("season", ""))
    elif action == "downloads":
        download_list()
    elif action == "download_address":
        downloads.from_address()
    elif action == "favorites":
        favorites()
    elif action == "fav":
        toggle_favorite(q["url"], q.get("title", ""), q.get("kind", "movie"))
    elif action == "plugins":
        plugin_list()
    elif action == "plugin_info":
        plugin_info(q["id"], q.get("title", ""))
    elif action == "kodi_favourites":
        kodi_favourites()
    elif action in ("dl_path", "api_download"):
        # `api_download` is the documented way for skins and add-ons that do not use Python:
        # RunPlugin(plugin://plugin.video.vesper/?action=api_download&path=<kodi path>&title=<title>)
        download_path(q.get("path") or q.get("url", ""), q.get("title", ""))
    elif action == "sync_now":
        library.run_sync(loud=True)
    elif action == "play":
        play(q["id"])
    elif action == "schedules":
        schedules()
    elif action == "schedule_menu":
        schedule_menu(q["id"], q.get("paused", "0"), q.get("title", ""))
    elif action == "rule_menu":
        rule_menu(q["id"], q.get("paused", "0"), q.get("title", ""))
    elif action == "rename":
        rename(q["id"], q.get("title", ""))
    elif action == "folder":
        folder(q["id"], q.get("tag", ""))
    elif action == "status":
        status()
    elif action == "test":
        test_connection()
    elif action == "signout":
        sign_out()
    elif action == "register":
        register()
    elif action == "stop":
        act(lambda c: c.stop(q["id"]), "Stopped")
    elif action == "keep":
        act(lambda c: c.keep_forever(q["id"]), "Kept forever")
    elif action == "watched":
        on = q.get("value") == "1"
        act(lambda c: c.patch(q["id"], watched=on, position_s=0), "Done")
    elif action == "delete":
        confirm_delete(q["id"], q.get("title", "this recording"))
    elif action == "sync":
        bridge.sync(loud=True)
        refresh()
    elif action == "discover":
        discover()
    elif action == "type_address":
        type_address()
    elif action == "settings":
        xbmc.executebuiltin("Addon.OpenSettings(plugin.video.vesper)")
    # "noop" and anything unknown: nothing to do.
