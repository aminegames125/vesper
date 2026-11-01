"""Finds an IPTV provider already set up in Kodi's own Live TV (PVR IPTV Simple Client).

No Kodi imports, so it can be tested on its own: it reads the settings files that add-on keeps.
"""

import calendar
import glob
import os
import re
import time
import xml.etree.ElementTree as ET

ADDON = "pvr.iptvsimple"


def _values(path):
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return {}
    return {s.get("id"): (s.text or "").strip() for s in root.iter("setting") if s.get("id")}


def find(profile_dir):
    """Every remote playlist address saved in IPTV Simple, as `[{"name", "url"}]`.

    `profile_dir` is Kodi's userdata folder. Kodi 21 keeps one `instance-settings-N.xml` per
    playlist; older versions keep a single `settings.xml`.
    """
    folder = os.path.join(profile_dir, "addon_data", ADDON)
    files = sorted(glob.glob(os.path.join(folder, "instance-settings-*.xml"))) + [os.path.join(folder, "settings.xml")]
    found, seen = [], set()
    for path in files:
        values = _values(path)
        link = values.get("m3uUrl", "")
        # m3uPathType 1 is "remote path"; a local file cannot be read by the server.
        if not re.match(r"^https?://", link, re.I) or values.get("m3uPathType", "1") != "1" or link in seen:
            continue
        seen.add(link)
        name = values.get("kodi_addon_instance_name") or "Kodi Live TV"
        found.append({"name": name, "url": link})
    return found


def missing(found, sources):
    """The Kodi providers the server does not have yet."""
    have = {s.get("url", "").strip() for s in sources}
    return [p for p in found if p["url"].strip() not in have]


def norm(name):
    """`BBC One HD` and `bbc-one hd` compare equal."""
    return re.sub(r"[^0-9a-z]+", "", (name or "").lower())


def best_match(channels, name):
    """The server channel that is the one Kodi shows, or None when it is not clear-cut."""
    wanted = norm(name)
    exact = [c for c in channels if norm(c.get("name")) == wanted]
    if exact:
        return exact[0]
    return channels[0] if len(channels) == 1 else None


def _utc(text):
    try:
        return calendar.timegm(time.strptime(text[:19], "%Y-%m-%d %H:%M:%S"))
    except (TypeError, ValueError):
        return None


def programme(details, now):
    """What recording a Kodi guide entry means: `(start, stop, state)` with state `over`, `airing`
    or `later`. Kodi's JSON-RPC gives times in UTC. None when the entry has no usable times."""
    start, stop = _utc(details.get("starttime")), _utc(details.get("endtime"))
    if start is None or stop is None or stop <= start:
        return None
    if stop <= now:
        return start, stop, "over"
    return start, stop, "airing" if start <= now else "later"


# -- repeating recordings ---------------------------------------------------------------------

DAY_BITS = {"daily": 127, "weekdays": 31, "weekends": 96}


def timezone_name(configured="", environ=None, root="/"):
    """The IANA name of this computer's time zone (`Europe/Paris`), or "" when it cannot be told.

    The server repeats a schedule on the wall clock of a named zone, and Python alone only knows
    abbreviations. A zone typed in the settings wins; then TZ, /etc/timezone and /etc/localtime.
    """
    environ = os.environ if environ is None else environ
    for name in (configured.strip(), (environ.get("TZ") or "").lstrip(":")):
        if re.match(r"^[A-Za-z_+\-]+(/[A-Za-z0-9_+\-]+)+$", name or "") or name == "UTC":
            return name
    try:
        with open(os.path.join(root, "etc", "timezone"), encoding="utf-8") as f:
            name = f.read().strip()
        if name:
            return name
    except OSError:
        pass
    try:
        target = os.path.realpath(os.path.join(root, "etc", "localtime")).replace("\\", "/")
        if "/zoneinfo/" in target:
            return target.split("/zoneinfo/", 1)[1]
    except OSError:
        pass
    return ""


def repeat_fields(start, repeat):
    """The wall-clock fields of a repeating schedule for a programme that starts at epoch `start`,
    in this computer's local time: `(start_time, start_date, days_mask)`.

    `repeat` is `once`, `daily` or `weekly` (the same weekday as the programme).
    """
    local = time.localtime(start)
    if repeat == "weekly":
        days = 1 << local.tm_wday
    else:
        days = DAY_BITS.get(repeat, 0)
    return time.strftime("%H:%M", local), time.strftime("%Y-%m-%d", local), days
