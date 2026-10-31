"""Tests for the parts of the add-on that do not need Kodi.

    python -I -m unittest discover -s apps/kodi/tests

Set VESPER_URL (a server in lite mode, for example http://127.0.0.1:8484) to also run the checks
against a live server. Set VESPER_DISCOVERY=1 to test finding that server on the network.
"""

import os
import socket
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper", "resources", "lib"))

import api  # noqa: E402
import discovery  # noqa: E402

LIVE = os.environ.get("VESPER_URL", "")


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


if __name__ == "__main__":
    unittest.main()
