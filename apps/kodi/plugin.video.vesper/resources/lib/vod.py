"""Movies and series from a provider's playlist, and where their files go in a Kodi library.

Providers list a series as one entry per episode ("Show S01E02"). This groups them back into shows
and seasons. No Kodi imports, so it can be tested on its own.
"""

import re

# "Show Name S01E02", "Show Name 1x02", "Show.Name.S01.E02" and a trailing title are all accepted.
EPISODE = re.compile(r"^(?P<show>.*?)[\s._-]*(?:S(?P<s1>\d{1,2})[\s._-]*E(?P<e1>\d{1,3})|(?P<s2>\d{1,2})x(?P<e2>\d{1,3}))\b[\s._-]*(?P<title>.*)$", re.I)

UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def parse_episode(name):
    """`(show, season, episode, title)` or None when the name does not look like an episode."""
    found = EPISODE.match((name or "").strip())
    if not found or not found.group("show").strip():
        return None
    season = int(found.group("s1") or found.group("s2"))
    episode = int(found.group("e1") or found.group("e2"))
    return found.group("show").strip(" ._-"), season, episode, found.group("title").strip(" ._-")


def shows(channels):
    """Groups episode entries by show: `{show: {season: [(episode, entry)]}}`, entries sorted.
    Entries that do not look like episodes go under their own name as season 0."""
    out = {}
    for entry in channels:
        parsed = parse_episode(entry.get("name", ""))
        show, season, episode = (parsed[0], parsed[1], parsed[2]) if parsed else (entry.get("name", "Unknown"), 0, 0)
        out.setdefault(show, {}).setdefault(season, []).append((episode, entry))
    for seasons in out.values():
        for rows in seasons.values():
            rows.sort(key=lambda pair: (pair[0], pair[1].get("name", "")))
    return out


def safe(text):
    """A file or folder name every filesystem accepts."""
    cleaned = UNSAFE.sub(" ", text or "").strip(" .")
    return re.sub(r"\s+", " ", cleaned)[:80] or "Untitled"


def library_path(title, kind="movie"):
    """Where a finished item's `.strm` goes inside the export folder, in the layout Kodi's scanners
    expect: `Movies/<Title>/<Title>.strm` and `TV/<Show>/Season NN/<Show> - SNNENN.strm`."""
    parsed = parse_episode(title)
    if parsed and kind != "movie":
        show, season, episode, _ = parsed
        show = safe(show)
        return "TV/%s/Season %02d/%s - S%02dE%02d.strm" % (show, season, show, season, episode)
    name = safe(title)
    return "Movies/%s/%s.strm" % (name, name)
