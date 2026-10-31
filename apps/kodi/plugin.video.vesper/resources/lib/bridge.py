"""Vesper on top of Kodi's own Live TV: connects the providers Kodi already has, and records from
Kodi's channel list and TV guide."""

import json
import time

import xbmc
import xbmcgui
import xbmcvfs

from . import api, common, pvr

LENGTHS = [("30 minutes", 1800), ("1 hour", 3600), ("2 hours", 7200), ("Until I stop it", 0)]
PAD = 180


def say(message, error=False):
    icon = xbmcgui.NOTIFICATION_ERROR if error else xbmcgui.NOTIFICATION_INFO
    xbmcgui.Dialog().notification("Vesper", message, icon, 5000)


def when(epoch):
    return time.strftime("%a %d %b, %H:%M", time.localtime(epoch))


# -- the providers Kodi already has -----------------------------------------------------------


def sync(loud=False):
    """Hands every playlist set up in Kodi's Live TV to the server. Quiet when there is nothing new."""
    found = pvr.find(xbmcvfs.translatePath("special://profile/"))
    try:
        c = common.client()
        todo = pvr.missing(found, c.sources())
        added = 0
        for p in todo:
            try:
                c.add_source(p["name"], "m3u", p["url"])
                added += 1
            except api.VesperError as e:
                say("%s: %s" % (p["name"], e), error=True)
    except api.VesperError as e:
        if loud:
            say(str(e), error=True)
        return 0
    if added:
        say("Connected %d IPTV provider%s from Kodi's Live TV." % (added, "" if added == 1 else "s"))
    elif loud:
        say("Nothing new. Set up a playlist in Live TV (PVR IPTV Simple Client) and it is picked up here." if not found else "Your Kodi providers are already connected.")
    return added


# -- recording from Kodi's channel list and guide ---------------------------------------------


def _label(name):
    return xbmc.getInfoLabel(name)


def _broadcast(dbid):
    """The guide entry under the cursor, or None (the channel list has no broadcast)."""
    if not dbid.isdigit() or not (xbmc.getCondVisibility("Window.IsActive(tvguide)") or xbmc.getCondVisibility("Window.IsActive(tvsearch)")):
        return None
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "PVR.GetBroadcastDetails",
        "params": {"broadcastid": int(dbid), "properties": ["title", "starttime", "endtime"]},
    }
    try:
        return json.loads(xbmc.executeJSONRPC(json.dumps(request))).get("result", {}).get("broadcastdetails")
    except ValueError:
        return None


def record_from_kodi():
    """Runs from the context menu of a channel or a programme in Kodi's Live TV."""
    channel = _label("ListItem.ChannelName") or _label("ListItem.Label")
    title = _label("ListItem.Title") or _label("ListItem.EpgEventTitle") or channel
    details = _broadcast(_label("ListItem.DBID"))
    when_ = pvr.programme(details, time.time()) if details else None
    if not channel:
        return say("Pick a channel or a programme first.", error=True)
    try:
        c = common.client()
        rows = c.channels("all", q=channel).get("channels", [])
    except api.VesperError as e:
        return say(str(e), error=True)
    match = pvr.best_match(rows, channel)
    if not match and rows:
        pick = xbmcgui.Dialog().select("Which one is \"%s\"?" % channel, [r["name"] for r in rows])
        match = rows[pick] if pick >= 0 else None
        if not match:
            return
    if not match:
        return say("\"%s\" is not in a provider Vesper knows. Add the provider to Kodi's Live TV (PVR IPTV Simple Client)." % channel, error=True)
    alt = (match.get("alt") or [""])[0] or None
    now = int(time.time())
    if when_ and when_[2] == "over":
        return say("That programme is over.", error=True)
    if when_:
        start, stop, state = when_
        if state == "airing":
            ask, begin = "Record \"%s\" from now until it ends?" % title, now
        else:
            ask, begin = "Record \"%s\" on %s, %s?" % (title, match["name"], when(start)), max(start - 60, now)
        if not xbmcgui.Dialog().yesno("Record with Vesper", ask):
            return
        seconds, start_at = stop + PAD - begin, (begin if state == "later" else None)
        title_ = title
    else:
        pick = xbmcgui.Dialog().select("Record " + match["name"], [label for label, _ in LENGTHS])
        if pick < 0:
            return
        seconds, start_at, title_ = LENGTHS[pick][1], None, match["name"]
    try:
        c.record(title_, match["url"], seconds, channel_name=match["name"], start_at=start_at, backup_url=alt)
    except api.VesperError as e:
        return say(str(e), error=True)
    say(("Will record " if start_at else "Recording ") + title_)
