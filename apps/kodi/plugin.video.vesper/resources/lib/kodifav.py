"""Reads Kodi's own favourites (`favourites.xml`) so they can be brought into Vesper.

No Kodi imports, so it can be tested on its own.
"""

import re
import xml.etree.ElementTree as ET

PLAY = re.compile(r'^PlayMedia\(\s*"?(.*?)"?\s*(?:,[^)]*)?\)$', re.S)


def parse(text):
    """`[{"name", "path", "thumb"}]` for each favourite that plays one thing. Favourites that open
    a window or a folder are skipped, since there is nothing to save or play."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    found = []
    for node in root.iter("favourite"):
        action = (node.text or "").strip()
        match = PLAY.match(action)
        if not match or not match.group(1):
            continue
        found.append({"name": node.get("name", "").strip() or match.group(1), "path": match.group(1), "thumb": node.get("thumb", "")})
    return found
