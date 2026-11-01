"""What the add-on keeps in step with the server: favourites and resume points.

The server stores small keyed values; each key keeps the time it last changed, and the newest wins.
This is the bookkeeping on this side. No Kodi imports, so it can be tested on its own.
"""

import hashlib
import json
import os
import time

FAVORITES = "favorites"
RESUME = "resume:"
MAX_RESUME = 300  # resume points kept; the oldest are dropped first


def resume_key(address):
    """A short, stable key for a video address (the address itself may hold a password)."""
    return RESUME + hashlib.sha1(address.split("|", 1)[0].encode("utf-8")).hexdigest()[:24]


class Store:
    """Values on disk, with the keys that still have to be sent to the server."""

    def __init__(self, path):
        self.path = path
        self.items = {}  # key -> {"value": ..., "updatedAt": int}
        self.dirty = set()
        self.since = 0
        self._load()

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            self.items = data.get("items", {})
            self.dirty = set(data.get("dirty", []))
            self.since = int(data.get("since", 0))
        except (OSError, ValueError):
            pass

    def save(self):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump({"items": self.items, "dirty": sorted(self.dirty), "since": self.since}, f)
        except OSError:
            pass

    def get(self, key, default=None):
        item = self.items.get(key)
        return default if item is None or item["value"] is None else item["value"]

    def set(self, key, value, now=None):
        self.items[key] = {"value": value, "updatedAt": int(now if now is not None else time.time())}
        self.dirty.add(key)
        self._trim()

    def _trim(self):
        resume = [k for k in self.items if k.startswith(RESUME)]
        for key in sorted(resume, key=lambda k: self.items[k]["updatedAt"])[: max(0, len(resume) - MAX_RESUME)]:
            del self.items[key]
            self.dirty.discard(key)

    def outgoing(self):
        return [{"key": k, "value": self.items[k]["value"], "updatedAt": self.items[k]["updatedAt"]} for k in sorted(self.dirty) if k in self.items]

    def apply(self, remote, now):
        """Takes what the server sent. A local change that is newer stays and goes up instead.
        Returns how many keys changed here."""
        changed = 0
        for item in remote:
            key, stamp = item["key"], int(item["updatedAt"])
            mine = self.items.get(key)
            if mine and mine["updatedAt"] > stamp:
                self.dirty.add(key)
                continue
            if mine and mine["updatedAt"] == stamp and mine["value"] == item["value"]:
                continue
            self.items[key] = {"value": item["value"], "updatedAt": stamp}
            self.dirty.discard(key)
            changed += 1
        self.since = int(now)
        return changed

    def sent(self, keys):
        self.dirty.difference_update(keys)


def sync(store, client, now=None):
    """One round: pull what changed, then push what changed here. Returns `(pulled, pushed)`.
    The caller catches VesperError."""
    now = int(now if now is not None else time.time())
    # Look a little before the last sync so a clock that is slightly behind never loses a change.
    pulled = client.sync_pull(max(0, store.since - 60))
    changed = store.apply(pulled.get("items", []), pulled.get("now", now))
    out = store.outgoing()
    if out:
        client.sync_push(out)
        store.sent([item["key"] for item in out])
    store.save()
    return changed, len(out)


def favorites(store):
    value = store.get(FAVORITES, [])
    return value if isinstance(value, list) else []


def toggle_favorite(store, entry):
    """Adds the entry (`{"name", "url", "kind"}`) or removes it if it is there. True if now a favourite."""
    rows = [r for r in favorites(store) if isinstance(r, dict)]
    kept = [r for r in rows if r.get("url") != entry["url"]]
    added = len(kept) == len(rows)
    if added:
        kept.append({"name": entry["name"], "url": entry["url"], "kind": entry.get("kind", "movie")})
    store.set(FAVORITES, kept)
    return added
