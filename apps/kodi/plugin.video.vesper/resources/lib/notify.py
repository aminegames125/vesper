"""Decides what to tell the person about their recordings. No Kodi imports, so it can be tested."""


def changes(previous, rows):
    """Compares the last known status of each recording with the current list.

    `previous` is `{id: status}` (empty on the first look, when nothing is announced) and `rows` the
    server's recordings. Returns `(messages, current)`, where `current` replaces `previous`.
    """
    current = {r["id"]: r["status"] for r in rows}
    if previous is None:
        return [], current
    messages = []
    for r in rows:
        before, now = previous.get(r["id"]), r["status"]
        if before == now:
            continue
        title = r["title"]
        if now == "recording":
            messages.append(("Recording started: " + title, False))
        elif now == "done" and before in ("recording", "queued", "scheduled"):
            messages.append(("Finished recording: " + title, False))
        elif now == "failed" and before != "failed":
            messages.append(("Recording failed: %s (%s)" % (title, r.get("error") or "unknown error"), True))
    return messages, current


def low_disk(status, floor=2 * 1024**3):
    """A warning when the server's disk is nearly full, else None."""
    free = status.get("diskFree")
    if free is not None and free < floor:
        return "Only %.1f GB left on the Vesper server." % (free / 1024**3)
    return None
