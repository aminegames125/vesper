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
        zone = pvr.timezone_name(common.setting("timezone"))
        options = [("now" if state == "airing" else "once", "Record from now until it ends" if state == "airing" else "Record this programme (%s)" % when(start))]
        if zone:
            options.append(("weekly", "Record every week at this time"))
            options.append(("daily", "Record every day at this time"))
        if match.get("id"):
            options.append(("series", 'Record every episode of "%s"' % title))
        pick = xbmcgui.Dialog().select("Record with Vesper", [label for _, label in options])
        if pick < 0:
            return
        choice = options[pick][0]
        begin = now if state == "airing" else max(start - 60, now)
        try:
            if choice in ("now", "once"):
                c.record(title, match["url"], stop + PAD - begin, channel_name=match["name"], start_at=(begin if state == "later" else None), backup_url=alt)
                return say(("Recording " if choice == "now" else "Will record ") + title)
            if choice == "series":
                c.create_rule(title, match["id"], match["url"], channel_name=match["name"], backup_url=alt)
                return say('Every episode of "%s" will be recorded.' % title)
            time_, date_, days = pvr.repeat_fields(start, choice)
            c.create_schedule(title, match["url"], zone, time_, date_, stop - start, days=days, channel_name=match["name"], backup_url=alt, epg_id=match.get("id", ""))
            if state == "airing":
                c.record(title, match["url"], stop + PAD - now, channel_name=match["name"], backup_url=alt)
        except api.VesperError as e:
            return say(str(e), error=True)
        return say("%s: %s" % ("Every week" if choice == "weekly" else "Every day", title))
    pick = xbmcgui.Dialog().select("Record " + match["name"], [label for label, _ in LENGTHS])
    if pick < 0:
        return
    try:
        c.record(match["name"], match["url"], LENGTHS[pick][1], channel_name=match["name"], start_at=None, backup_url=alt)
    except api.VesperError as e:
        return say(str(e), error=True)
    say("Recording " + match["name"])
