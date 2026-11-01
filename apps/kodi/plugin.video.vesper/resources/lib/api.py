"""A small client for the Vesper server. No Kodi imports here, so it can be tested on its own."""

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 15
PAD_SECONDS = 180


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


def is_private_host(address):
    """True for an address that only exists on a home network (a private IP, `.local`, one label)."""
    host = re.sub(r"^https?://", "", normalise(address), flags=re.I).split("/")[0]
    host = host.rsplit("@", 1)[-1]
    host = host[1:].split("]")[0] if host.startswith("[") else host.split(":")[0]
    host = host.lower()
    if not host:
        return False
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        a, b = (int(x) for x in host.split(".")[:2])
        return a in (10, 127) or (a == 192 and b == 168) or (a == 172 and 16 <= b <= 31) or (a == 169 and b == 254)
    if ":" in host:
        return host == "::1" or host.startswith(("fe80", "fc", "fd"))
    return host == "localhost" or "." not in host or host.endswith((".local", ".lan", ".home", ".internal", ".home.arpa", ".localhost"))


class Vesper:
    def __init__(self, address, token="", on_token=None, username="", password="", verify=True):
        self.base = normalise(address)
        self.token = token or ""
        self._on_token = on_token
        self._media = ("", 0.0)
        self.mode = None
        self.username = username or ""
        self.password = password or ""
        self.verify = verify
        # `verify=False` is for a home server with its own (self-signed) certificate.
        self._context = None if verify else ssl._create_unverified_context()

    # -- plumbing ---------------------------------------------------------------------------

    def _call(self, method, path, body=None, query=None, auth=True, timeout=TIMEOUT, _retry=True):
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
            with urllib.request.urlopen(request, timeout=timeout, context=self._context) as response:
                raw = response.read()
        except urllib.error.HTTPError as e:
            message = ""
            try:
                text = e.read().decode("utf-8", "replace")
                try:
                    message = json.loads(text).get("error", "")
                except (ValueError, AttributeError):
                    message = text.strip()[:200] if "<" not in text[:50] else ""
            except Exception:
                pass
            if e.code == 401 and auth:
                # The session ran out or was revoked: sign in again with the saved login, once.
                if _retry and self.mode == "full" and self.username and self.password:
                    self.token = ""
                    self._media = ("", 0.0)
                    self.sign_in(self.username, self.password)
                    return self._call(method, path, body, query, auth, timeout, _retry=False)
                raise VesperError("Signed out. Check the username and password in the add-on settings.")
            if e.code == 401:
                raise VesperError("Wrong username or password.")
            if e.code == 429:
                raise VesperError("Too many attempts. Wait a minute and try again.")
            raise VesperError(message or "The server answered %d." % e.code)
        except (urllib.error.URLError, OSError) as e:
            reason = getattr(e, "reason", e)
            if isinstance(reason, ssl.SSLCertVerificationError):
                raise VesperError(
                    'The certificate of %s is not trusted. If it is your own server, turn off "Check the HTTPS certificate" in the settings.'
                    % self.base
                )
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

    def _remember(self, session):
        self.token = session.get("token", "")
        self._media = ("", 0.0)
        if self._on_token:
            self._on_token(self.token)

    def sign_in(self, username, password):
        session = self._call("POST", "/auth/login", {"username": username, "password": password}, auth=False)
        self._remember(session)
        return session

    def register(self, username, password, invite=""):
        body = {"username": username, "password": password}
        if invite:
            body["invite"] = invite
        session = self._call("POST", "/auth/register", body, auth=False)
        self._remember(session)
        return session

    def sign_out(self):
        if self.token:
            try:
                self._call("POST", "/auth/logout", {}, _retry=False)
            except VesperError:
                pass
        self._remember({})

    def ensure_ready(self, username="", password=""):
        """Works out whether this server needs a sign-in, and signs in if it does."""
        username, password = username or self.username, password or self.password
        self.username, self.password = username, password
        info = self.info()
        if info.get("mode") != "full":
            return info
        if info.get("needsSetup"):
            raise VesperError("This server has no administrator yet. Open %s/admin/ in a browser to create one." % self.base)
        if self.token:
            try:
                self._call("GET", "/auth/me", _retry=False)
                return info
            except VesperError as e:
                if "reach" in str(e) or "certificate" in str(e):
                    raise
                self.token = ""
        if not username or not password:
            raise VesperError("This server needs a username and password. Enter them in the add-on settings.")
        self.sign_in(username, password)
        return info

    def me(self):
        return self._call("GET", "/auth/me")

    # -- reading ----------------------------------------------------------------------------

    def recordings(self, tag="", q=""):
        return self._call("GET", "/recordings", query={"tag": tag, "q": q})

    def sources(self):
        return self._call("GET", "/sources").get("sources", [])

    def add_source(self, name, kind, url, username="", password=""):
        """Saves a provider on the server. The server downloads the list once to check it, which
        can take a while for a big provider."""
        body = {"name": name, "kind": kind, "url": url, "username": username, "password": password}
        return self._call("POST", "/sources", body, timeout=90)

    def remove_source(self, source_id):
        return self._call("DELETE", "/sources/" + source_id)

    def channels(self, source="all", group="", kind="", q="", offset=0, limit=200):
        return self._call(
            "GET",
            "/channels",
            query={"source": source, "group": group, "kind": kind, "q": q, "offset": offset, "limit": limit},
        )

    def schedules(self):
        data = self._call("GET", "/schedules")
        return data.get("schedules", data) if isinstance(data, dict) else data

    def rules(self):
        data = self._call("GET", "/series-rules")
        return data.get("rules", []) if isinstance(data, dict) else data

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

    def rename(self, recording_id, title):
        return self.patch(recording_id, title=title)

    def set_folder(self, recording_id, tag):
        return self.patch(recording_id, tag=tag)

    def keep_forever(self, recording_id):
        return self.patch(recording_id, keep_hours=0)

    def set_schedule_enabled(self, schedule_id, enabled):
        return self._call("PATCH", "/schedules/" + schedule_id, {"enabled": bool(enabled)})

    def create_schedule(self, title, url, tz, start_time, start_date, seconds, days=0, channel_name="", backup_url=None, epg_id=""):
        """A recording at a wall-clock time in `tz`: once (`days=0`, on `start_date`) or repeating
        (`days` is a mask, Monday is bit 0). With a guide id, it keeps going until the programme ends."""
        body = {
            "title": title,
            "channel_name": channel_name,
            "url": url,
            "tz": tz,
            "start_time": start_time,
            "start_date": start_date,
            "seconds": int(seconds),
            "days": int(days),
            "pad_before": 60,
            "pad_after": PAD_SECONDS,
            "epg_id": epg_id or "",
            "follow_guide": bool(epg_id),
        }
        if backup_url:
            body["backup_url"] = backup_url
        return self._call("POST", "/schedules", body)

    def update_schedule(self, schedule, **changes):
        """Saves changes to a schedule. `schedule` is a row from `schedules()`; the server wants the
        whole thing back, so the unchanged parts are sent as they were."""
        body = {
            "title": schedule["title"],
            "channel_name": schedule.get("channelName", ""),
            "url": schedule["url"],
            "tz": schedule["tz"],
            "start_time": schedule["startTime"],
            "seconds": schedule["seconds"],
            "days": schedule["days"],
            "start_date": schedule["startDate"],
            "end_date": schedule.get("endDate"),
            "pad_before": schedule.get("padBefore", 0),
            "pad_after": schedule.get("padAfter", 0),
            "keep_hours": schedule.get("keepHours"),
            "keep_last": schedule.get("keepLast"),
            "enabled": schedule.get("enabled", True),
            "backup_url": schedule.get("backupUrl"),
            "quality": schedule.get("quality", "best"),
            "webhook_url": schedule.get("webhookUrl"),
            "tag": schedule.get("tag", ""),
            "epg_id": schedule.get("epgId", ""),
            "follow_guide": schedule.get("followGuide", False),
        }
        body.update(changes)
        return self._call("PUT", "/schedules/" + schedule["id"], body)

    def run_schedule(self, schedule_id):
        return self._call("POST", "/schedules/%s/run" % schedule_id, {})

    def delete_schedule(self, schedule_id):
        return self._call("DELETE", "/schedules/" + schedule_id)

    def create_rule(self, title, epg_channel_id, url, channel_name="", backup_url=None):
        """Record every programme whose title contains `title` on that guide channel."""
        body = {
            "title": title,
            "epg_channel_id": epg_channel_id,
            "url": url,
            "channel_name": channel_name,
            "pad_before": 60,
            "pad_after": PAD_SECONDS,
        }
        if backup_url:
            body["backup_url"] = backup_url
        return self._call("POST", "/series-rules", body)

    def set_rule_enabled(self, rule_id, enabled):
        return self._call("PATCH", "/series-rules/" + rule_id, {"enabled": bool(enabled)})

    def delete_rule(self, rule_id):
        return self._call("DELETE", "/series-rules/" + rule_id)

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

    def for_kodi(self, url):
        """Adds what Kodi's own player needs to open an address of this server. With the certificate
        check off, Kodi is told too (`|verifypeer=false`)."""
        if not self.verify and url.startswith("https://"):
            return url + "|verifypeer=false"
        return url

    def thumb_url(self, recording_id):
        token = self.media_token()
        query = "?token=" + urllib.parse.quote(token) if token else ""
        return self.for_kodi("%s/api/v1/recordings/%s/thumb.jpg%s" % (self.base, recording_id, query))

    def play_url(self, recording):
        """Where Kodi can play a recording: the playlist of a capture, or the file of a download."""
        rid = recording["id"]
        leaf = "download" if recording.get("kind") == "download" else "index.m3u8"
        token = self.media_token()
        query = "?token=" + urllib.parse.quote(token) if token else ""
        return self.for_kodi("%s/api/v1/recordings/%s/%s%s" % (self.base, rid, leaf, query))


RECORDING_URL = re.compile(r"/api/v1/recordings/([0-9A-Za-z_-]+)/(?:index\.m3u8|download)")


def recording_id_of(url):
    """The recording a playing address belongs to, or None when Kodi is playing something else."""
    found = RECORDING_URL.search(url or "")
    return found.group(1) if found else None
