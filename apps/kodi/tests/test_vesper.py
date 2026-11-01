"""Tests for the parts of the add-on that do not need Kodi.

    python -I -m unittest discover -s apps/kodi/tests

Set VESPER_URL (a server in lite mode, for example http://127.0.0.1:8484) to also run the checks
against a live server. Set VESPER_DISCOVERY=1 to test finding that server on the network.
"""

import json
import os
import socket
import struct
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper", "resources", "lib"))

import api  # noqa: E402
import discovery  # noqa: E402

LIVE = os.environ.get("VESPER_URL", "")
FULL = os.environ.get("VESPER_FULL_URL", "")
FULL_USER = os.environ.get("VESPER_FULL_USER", "admin")
FULL_PASSWORD = os.environ.get("VESPER_FULL_PASSWORD", "")


class Addresses(unittest.TestCase):
    def test_a_bare_address_becomes_a_url(self):
        self.assertEqual(api.normalise("192.168.1.5:8484"), "http://192.168.1.5:8484")
        self.assertEqual(api.normalise("https://nas.local/"), "https://nas.local")
        self.assertEqual(api.normalise("http://h:1/api/v1"), "http://h:1")
        self.assertEqual(api.normalise("  "), "")

    def test_the_playing_address_names_its_recording(self):
        self.assertEqual(api.recording_id_of("http://h:1/api/v1/recordings/ab-12/index.m3u8?token=t"), "ab-12")
        self.assertEqual(api.recording_id_of("http://h:1/api/v1/recordings/xyz/download"), "xyz")
        self.assertIsNone(api.recording_id_of("http://provider/live/u/p/1.ts"))
        self.assertIsNone(api.recording_id_of(""))

    def test_a_playback_address_carries_the_media_key_only_when_there_is_one(self):
        client = api.Vesper("http://h:1")
        client.mode = "lite"
        self.assertEqual(client.play_url({"id": "a", "kind": "recording"}), "http://h:1/api/v1/recordings/a/index.m3u8")
        self.assertEqual(client.play_url({"id": "a", "kind": "download"}), "http://h:1/api/v1/recordings/a/download")
        client.mode = "full"
        client.token = "session"
        client._media = ("media key", 9e12)
        self.assertEqual(
            client.play_url({"id": "a", "kind": "recording"}),
            "http://h:1/api/v1/recordings/a/index.m3u8?token=media%20key",
        )

    def test_an_unreachable_server_gives_a_readable_message(self):
        with self.assertRaises(api.VesperError) as caught:
            api.Vesper("http://127.0.0.1:1").info()
        self.assertIn("Cannot reach", str(caught.exception))
        with self.assertRaises(api.VesperError):
            api.Vesper("").info()

    def test_only_home_network_addresses_count_as_private(self):
        for home in ("192.168.1.5:8484", "http://10.0.0.2", "172.20.1.1", "nas", "box.local:8484", "localhost", "http://[::1]:8484"):
            self.assertTrue(api.is_private_host(home), home)
        for remote in ("vesper.example.com", "https://tv.example.org", "8.8.8.8", "172.32.0.1"):
            self.assertFalse(api.is_private_host(remote), remote)

    def test_a_server_with_its_own_certificate_is_told_to_kodi_too(self):
        strict = api.Vesper("https://nas", verify=True)
        loose = api.Vesper("https://nas", verify=False)
        self.assertEqual(strict.for_kodi("https://nas/x"), "https://nas/x")
        self.assertEqual(loose.for_kodi("https://nas/x"), "https://nas/x|verifypeer=false")
        self.assertEqual(api.Vesper("http://nas", verify=False).for_kodi("http://nas/x"), "http://nas/x")


class FakeFull(BaseHTTPRequestHandler):
    """A stand-in for a full-mode server: logins, sessions that can expire, and a few errors."""

    valid = set()
    logins = 0
    unconfigured = False

    def log_message(self, *a):
        pass

    def send(self, code, body, kind="application/json"):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        auth = self.headers.get("Authorization", "")
        if self.path == "/api/v1/info":
            return self.send(200, {"mode": "full", "needsSetup": FakeFull.unconfigured})
        if self.path == "/api/v1/denied":
            return self.send(403, b"Vesper in lite mode only answers on your home network.", "text/plain")
        if auth.replace("Bearer ", "") not in FakeFull.valid:
            return self.send(401, {"error": "Sign in."})
        if self.path == "/api/v1/recordings":
            return self.send(200, {"recordings": []})
        self.send(200, {"username": "amine"})

    def do_POST(self):
        size = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(size) or b"{}")
        if self.path == "/api/v1/auth/login":
            if body["password"] != "right":
                return self.send(401, {"error": "Wrong"})
            FakeFull.logins += 1
            token = "session-%d" % FakeFull.logins
            FakeFull.valid.add(token)
            return self.send(200, {"token": token})
        if self.path == "/api/v1/auth/media-token":
            if self.headers.get("Authorization", "").replace("Bearer ", "") not in FakeFull.valid:
                return self.send(401, {"error": "Sign in."})
            return self.send(200, {"token": "media-%d" % FakeFull.logins})
        self.send(404, {})


class FullMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = HTTPServer(("127.0.0.1", 0), FakeFull)
        cls.url = "http://127.0.0.1:%d" % cls.http.server_port
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()

    def setUp(self):
        FakeFull.valid, FakeFull.logins, FakeFull.unconfigured = set(), 0, False
        self.saved = []

    def client(self, token="", user="amine", password="right"):
        return api.Vesper(self.url, token, on_token=self.saved.append, username=user, password=password)

    def test_it_signs_in_and_remembers_the_session(self):
        c = self.client()
        c.ensure_ready()
        self.assertEqual(self.saved, ["session-1"])
        self.assertEqual(c.recordings(), {"recordings": []})

    def test_a_saved_session_is_reused_without_signing_in_again(self):
        FakeFull.valid.add("old")
        c = self.client("old")
        c.ensure_ready()
        self.assertEqual((FakeFull.logins, self.saved), (0, []))

    def test_an_expired_session_signs_in_again_by_itself(self):
        c = self.client("expired")
        c.ensure_ready()
        self.assertEqual(c.token, "session-1")
        FakeFull.valid.clear()  # the server forgets every session mid-use
        self.assertEqual(c.recordings(), {"recordings": []})
        self.assertEqual(c.token, "session-2")
        self.assertEqual(self.saved, ["session-1", "session-2"])

    def test_a_wrong_password_is_said_plainly(self):
        with self.assertRaises(api.VesperError) as caught:
            self.client(password="nope").ensure_ready()
        self.assertEqual(str(caught.exception), "Wrong username or password.")

    def test_no_login_saved_asks_for_one(self):
        with self.assertRaises(api.VesperError) as caught:
            self.client(user="", password="").ensure_ready()
        self.assertIn("username and password", str(caught.exception))

    def test_a_server_nobody_set_up_says_where_to_do_it(self):
        FakeFull.unconfigured = True
        with self.assertRaises(api.VesperError) as caught:
            self.client().ensure_ready()
        self.assertIn("/admin/", str(caught.exception))

    def test_playback_uses_a_media_key_not_the_session(self):
        c = self.client()
        c.ensure_ready()
        url = c.play_url({"id": "r1", "kind": "recording"})
        self.assertTrue(url.endswith("/recordings/r1/index.m3u8?token=media-1"), url)
        self.assertNotIn("session-1", url)
        self.assertEqual(c.thumb_url("r1").split("?")[1], "token=media-1")

    def test_a_plain_text_refusal_is_shown_as_it_is(self):
        with self.assertRaises(api.VesperError) as caught:
            self.client()._call("GET", "/denied", auth=False)
        self.assertIn("only answers on your home network", str(caught.exception))


def reply(instance, host, port, ip, mode="lite"):
    """A made-up mDNS answer, with name compression like the real thing."""

    def name(text):
        return b"".join(bytes([len(p)]) + p.encode() for p in text.split(".")) + b"\x00"

    service = discovery.SERVICE
    inst = instance + "." + service
    txt = bytes([len("mode=" + mode)]) + ("mode=" + mode).encode()
    body = struct.pack(">HHHHHH", 0, 0x8400, 0, 4, 0, 0)
    body += name(service) + struct.pack(">HHIH", 12, 1, 120, len(name(inst))) + name(inst)
    srv = struct.pack(">HHH", 0, 0, port) + name(host)
    body += name(inst) + struct.pack(">HHIH", 33, 1, 120, len(srv)) + srv
    body += name(inst) + struct.pack(">HHIH", 16, 1, 120, len(txt)) + txt
    body += name(host) + struct.pack(">HHIH", 1, 1, 120, 4) + socket.inet_aton(ip)
    return body


class Discovery(unittest.TestCase):
    def test_the_question_asks_for_vesper_services(self):
        query = discovery.build_query()
        self.assertEqual(struct.unpack(">H", query[4:6])[0], 1)
        self.assertIn(b"\x07_vesper\x04_tcp\x05local\x00", query)

    def test_an_answer_becomes_a_server(self):
        found = discovery.servers_in(discovery.parse(reply("Vesper on NAS", "nas.local", 8484, "192.168.1.20", "full")))
        self.assertEqual(found, [{"name": "Vesper on NAS", "address": "http://192.168.1.20:8484", "mode": "full"}])

    def test_noise_is_ignored(self):
        self.assertEqual(discovery.parse(b"\x00\x01"), [])
        self.assertEqual(discovery.servers_in(discovery.parse(b"\x00" * 12 + b"\xff" * 40)), [])

    @unittest.skipUnless(os.environ.get("VESPER_DISCOVERY") and LIVE, "needs a running server on this network")
    def test_the_live_server_is_found(self):
        port = int(LIVE.rsplit(":", 1)[1])
        servers = discovery.discover(4)
        self.assertTrue([s for s in servers if s["address"].endswith(":%d" % port)], servers)


@unittest.skipUnless(LIVE, "set VESPER_URL to a lite-mode server")
class LiveServer(unittest.TestCase):
    def setUp(self):
        self.client = api.Vesper(LIVE)
        self.assertEqual(self.client.ensure_ready().get("mode"), "lite")

    def test_a_recording_can_be_made_listed_played_kept_and_removed(self):
        made = self.client.record("Kodi test", "http://127.0.0.1:1/none.ts", 30, channel_name="Test")
        rid = made.get("id") or made.get("recording", {}).get("id")
        self.assertTrue(rid, made)
        try:
            listed = [r for r in self.client.recordings()["recordings"] if r["id"] == rid]
            self.assertEqual(len(listed), 1)
            self.assertTrue(self.client.play_url(listed[0]).endswith("/recordings/%s/index.m3u8" % rid))
            self.client.keep_forever(rid)
            self.client.patch(rid, position_s=42, watched=True)
            after = [r for r in self.client.recordings()["recordings"] if r["id"] == rid][0]
            self.assertEqual(after["positionS"], 42)
            self.assertTrue(after["watched"])
            self.assertIsNone(after["keepUntil"])
        finally:
            self.client.delete(rid)
        self.assertFalse([r for r in self.client.recordings()["recordings"] if r["id"] == rid])

    def test_the_other_lists_load(self):
        self.assertIsInstance(self.client.sources(), list)
        try:
            self.assertIn("channels", self.client.channels("all"))
        except api.VesperError as e:
            self.assertIn("playlist", str(e))  # a fresh server has none
        self.assertIsInstance(self.client.schedules(), list)
        self.assertIsInstance(self.client.guide(name="nothing"), list)


@unittest.skipUnless(FULL and FULL_PASSWORD, "set VESPER_FULL_URL and VESPER_FULL_PASSWORD to a full-mode server")
class LiveFullServer(unittest.TestCase):
    def setUp(self):
        self.saved = []
        self.client = api.Vesper(FULL, on_token=self.saved.append, username=FULL_USER, password=FULL_PASSWORD)
        self.assertEqual(self.client.ensure_ready().get("mode"), "full")

    def get(self, url, header=None):
        request = urllib.request.Request(url.split("|")[0], headers={"Authorization": "Bearer " + header} if header else {})
        try:
            with urllib.request.urlopen(request, timeout=10) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code

    def test_without_a_login_the_server_refuses_and_a_wrong_password_is_said_plainly(self):
        with self.assertRaises(api.VesperError) as caught:
            api.Vesper(FULL).recordings()
        self.assertIn("Signed out", str(caught.exception))
        with self.assertRaises(api.VesperError) as caught:
            api.Vesper(FULL, username=FULL_USER, password="definitely wrong").ensure_ready()
        self.assertEqual(str(caught.exception), "Wrong username or password.")

    def test_a_revoked_session_signs_in_again_by_itself(self):
        self.client.token = "no-such-session"
        self.assertIn("recordings", self.client.recordings())
        self.assertNotEqual(self.client.token, "no-such-session")
        self.assertEqual(self.saved[-1], self.client.token)

    def test_the_account_and_the_status_load(self):
        self.assertEqual(self.client.me()["username"], FULL_USER)
        self.assertIn("diskFree", self.client.status())

    def test_the_playback_key_opens_media_but_not_the_api_and_not_a_header(self):
        made = self.client.record("Full mode test", "http://127.0.0.1:1/none.ts", 30, channel_name="T")
        rid = made.get("id") or made.get("recording", {}).get("id")
        try:
            rec = [r for r in self.client.recordings()["recordings"] if r["id"] == rid][0]
            url = self.client.play_url(rec)
            key = url.split("token=")[1]
            self.assertNotEqual(key, self.client.token)
            base = "%s/api/v1/recordings/%s" % (self.client.base, rid)
            self.assertEqual(self.get(base + "/index.m3u8"), 401)  # no key, no playlist
            self.assertNotEqual(self.get(url), 401)  # the key is accepted (404: nothing recorded yet)
            self.assertEqual(self.get(self.client.base + "/api/v1/recordings?token=" + key), 401)  # not for the API
            self.assertEqual(self.get(self.client.base + "/api/v1/recordings", header=key), 401)  # nor as a header
        finally:
            self.client.delete(rid)

    def test_a_schedule_can_be_made_edited_paused_and_removed(self):
        made = self.client.create_schedule("Kodi sched", "http://127.0.0.1:1/x.ts", "UTC", "03:00", "2030-01-01", 1800, days=31, channel_name="T")
        sid = made["id"]
        try:
            row = [s for s in self.client.schedules() if s["id"] == sid][0]
            self.assertEqual((row["startTime"], row["days"]), ("03:00", 31))
            self.client.update_schedule(row, start_time="04:30", seconds=3600)
            row = [s for s in self.client.schedules() if s["id"] == sid][0]
            self.assertEqual((row["startTime"], row["seconds"], row["days"]), ("04:30", 3600, 31))
            self.client.set_schedule_enabled(sid, False)
            self.assertFalse([s for s in self.client.schedules() if s["id"] == sid][0]["enabled"])
        finally:
            self.client.delete_schedule(sid)
        self.assertFalse([s for s in self.client.schedules() if s["id"] == sid])

    def test_a_series_rule_can_be_made_paused_and_removed(self):
        made = self.client.create_rule("Kodi series", "some.channel", "http://127.0.0.1:1/x.ts", channel_name="T")
        rid = made["id"]
        try:
            self.assertTrue([r for r in self.client.rules() if r["id"] == rid])
            self.client.set_rule_enabled(rid, False)
            self.assertFalse([r for r in self.client.rules() if r["id"] == rid][0]["enabled"])
        finally:
            self.client.delete_rule(rid)

    def test_a_recording_can_be_renamed_and_filed(self):
        made = self.client.record("Before", "http://127.0.0.1:1/none.ts", 30)
        rid = made.get("id") or made.get("recording", {}).get("id")
        try:
            self.client.rename(rid, "After")
            self.client.set_folder(rid, "Sport")
            row = [r for r in self.client.recordings()["recordings"] if r["id"] == rid][0]
            self.assertEqual((row["title"], row["tag"]), ("After", "Sport"))
        finally:
            self.client.delete(rid)

    def test_signing_out_ends_the_session(self):
        old = self.client.token
        self.client.sign_out()
        self.assertEqual(self.client.token, "")
        self.assertEqual(self.saved[-1], "")
        self.assertEqual(self.get(self.client.base + "/api/v1/auth/me", header=old), 401)


if __name__ == "__main__":
    unittest.main()
