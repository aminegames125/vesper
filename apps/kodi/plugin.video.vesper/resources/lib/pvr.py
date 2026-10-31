"""Finds an IPTV provider already set up in Kodi's own Live TV (PVR IPTV Simple Client).

No Kodi imports, so it can be tested on its own: it reads the settings files that add-on keeps.
"""

import glob
import os
import re
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
