"""A small client for the Vesper server. No Kodi imports here, so it can be tested on its own."""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 15


class VesperError(Exception):
    """Something the person can read: wrong password, server not reachable, and so on."""


def normalise(address):
    """Turns `192.168.1.5:8484` or `http://nas.local:8484/` into `http://host:port`."""
    address = (address or "").strip().rstrip("/")
    if not address:
        return ""
    if not re.match(r"^https?://", address, re.I):
        address = "http://" + address
    return re.sub(r"/api/v1$", "", address)


class Vesper:
    def __init__(self, address, token="", on_token=None):
        self.base = normalise(address)
        self.token = token or ""
        self._on_token = on_token
        self._media = ("", 0.0)
        self.mode = None

    # -- plumbing ---------------------------------------------------------------------------

    def _call(self, method, path, body=None, query=None, auth=True):
        if not self.base:
            raise VesperError("Set the server address in the add-on settings.")
        url = self.base + "/api/v1" + path
        if query:
            clean = {k: v for k, v in query.items() if v not in (None, "")}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        if auth and self.token:
            request.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                raw = response.read()
        except urllib.error.HTTPError as e:
            message = ""
            try:
                message = json.loads(e.read().decode("utf-8", "replace")).get("error", "")
            except Exception:
                pass
            if e.code == 401:
                raise VesperError(message or "Sign in again: check the username and password in the settings.")
            raise VesperError(message or "The server answered %d." % e.code)
        except (urllib.error.URLError, OSError) as e:
            reason = getattr(e, "reason", e)
            raise VesperError("Cannot reach %s (%s)." % (self.base, reason))
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            raise VesperError("That address is not a Vesper server.")

    # -- account ----------------------------------------------------------------------------

    def info(self):
        info = self._call("GET", "/info", auth=False)
        self.mode = info.get("mode")
        return info

    def sign_in(self, username, password):
        session = self._call("POST", "/auth/login", {"username": username, "password": password}, auth=False)
        self.token = session.get("token", "")
        if self._on_token:
            self._on_token(self.token)
        return session

    def ensure_ready(self, username="", password=""):
        """Works out whether this server needs a sign-in, and signs in if it does."""
        info = self.info()
        if info.get("mode") != "full":
            return info
        if self.token:
            try:
                self._call("GET", "/auth/me")
                return info
            except VesperError:
                self.token = ""
        if not username or not password:
            raise VesperError("This server needs a username and password. Enter them in the add-on settings.")
        self.sign_in(username, password)
        return info

    # -- reading ----------------------------------------------------------------------------

    def recordings(self, tag="", q=""):
        return self._call("GET", "/recordings", query={"tag": tag, "q": q})

    def sources(self):
        return self._call("GET", "/sources").get("sources", [])

    def channels(self, source="all", group="", kind="", q="", offset=0, limit=200):
        return self._call(
            "GET",
            "/channels",
            query={"source": source, "group": group, "kind": kind, "q": q, "offset": offset, "limit": limit},
        )

    def schedules(self):
        data = self._call("GET", "/schedules")
        return data.get("schedules", data) if isinstance(data, dict) else data

    def guide(self, epg_id="", name=""):
        return self._call("GET", "/guide", query={"epg_id": epg_id, "name": name}).get("programmes", [])

    def status(self):
        return self._call("GET", "/status")

    # -- changing ---------------------------------------------------------------------------

    def record(self, title, url, seconds, channel_name="", start_at=None, backup_url=None):
        body = {"title": title, "channel_name": channel_name, "url": url, "seconds": int(seconds)}
        if start_at:
            body["start_at"] = int(start_at)
        if backup_url:
            body["backup_url"] = backup_url
        return self._call("POST", "/recordings", body)

    def download(self, title, url):
        return self._call("POST", "/downloads", {"title": title, "url": url})

    def stop(self, recording_id):
        return self._call("POST", "/recordings/%s/stop" % recording_id, {})

    def delete(self, recording_id):
        return self._call("DELETE", "/recordings/" + recording_id)

    def patch(self, recording_id, **fields):
        return self._call("PATCH", "/recordings/" + recording_id, fields)

    def keep_forever(self, recording_id):
        return self.patch(recording_id, keep_hours=0)

    def set_schedule_enabled(self, schedule_id, enabled):
        return self._call("PATCH", "/schedules/" + schedule_id, {"enabled": bool(enabled)})

    def run_schedule(self, schedule_id):
        return self._call("POST", "/schedules/%s/run" % schedule_id, {})

    def delete_schedule(self, schedule_id):
        return self._call("DELETE", "/schedules/" + schedule_id)

    # -- playing ----------------------------------------------------------------------------

    def media_token(self):
        """A key that only opens media, for the player. In lite mode there is nothing to sign."""
        if self.mode == "lite" or not self.token:
            return ""
        token, made = self._media
        if token and time.time() - made < 20 * 3600:
            return token
        token = self._call("POST", "/auth/media-token", {}).get("token", "")
        self._media = (token, time.time())
        return token

    def play_url(self, recording):
        """Where Kodi can play a recording: the playlist of a capture, or the file of a download."""
        rid = recording["id"]
        leaf = "download" if recording.get("kind") == "download" else "index.m3u8"
        url = "%s/api/v1/recordings/%s/%s" % (self.base, rid, leaf)
        token = self.media_token()
        return url + ("?token=" + urllib.parse.quote(token) if token else "")


RECORDING_URL = re.compile(r"/api/v1/recordings/([0-9A-Za-z_-]+)/(?:index\.m3u8|download)")


def recording_id_of(url):
    """The recording a playing address belongs to, or None when Kodi is playing something else."""
    found = RECORDING_URL.search(url or "")
    return found.group(1) if found else None
