"""Runs the add-on's screens against a stand-in for Kodi, and a live lite-mode server.

    VESPER_URL=http://127.0.0.1:8484 python -I -m unittest discover -s apps/kodi/tests

This checks the add-on's own logic (what it lists, what it plays, what it sends). It cannot tell
how Kodi draws it; that needs a real Kodi.
"""

import os
import sys
import tempfile
import types
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper")
LIVE = os.environ.get("VESPER_URL", "")


class Fake:
    """Records what the add-on asked Kodi to do."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.items, self.resolved, self.notes, self.builtins = [], [], [], []
        self.ended = None
        self.answers = {}
        self.content = None

    def install(self, settings):
        fake = self
        data_dir = tempfile.mkdtemp()

        class ListItem:
            def __init__(self, label="", path=""):
                self.label, self.path, self.props, self.art, self.plot = label, path, {}, {}, ""
                self.menu, self.mime = [], None

            def setArt(self, art):
                self.art = art

            def getVideoInfoTag(self):
                return types.SimpleNamespace(
                    setTitle=lambda t: None,
                    setPlot=lambda p: setattr(self, "plot", p),
                    setDuration=lambda d: None,
                    setResumePoint=lambda a, b: None,
                )

            def setProperty(self, k, v):
                self.props[k] = v

            def addContextMenuItems(self, items):
                self.menu = items

            def setMimeType(self, m):
                self.mime = m

            def setContentLookup(self, flag):
                pass

        class Dialog:
            def notification(self, heading, message, icon=None, time=0):
                fake.notes.append(message)

            def select(self, heading, options):
                return fake.answers.get("select", -1)

            def yesno(self, *a, **k):
                return fake.answers.get("yesno", True)

            def input(self, *a, **k):
                return fake.answers.get("input", "")

        class Addon:
            def getSetting(self, key):
                return settings.get(key, "")

            def setSetting(self, key, value):
                settings[key] = value

            def getAddonInfo(self, key):
                return "plugin.video.vesper"

        xbmc = types.ModuleType("xbmc")
        xbmc.executebuiltin = lambda cmd: fake.builtins.append(cmd)
        xbmcgui = types.ModuleType("xbmcgui")
        xbmcgui.ListItem, xbmcgui.Dialog = ListItem, Dialog
        xbmcgui.NOTIFICATION_ERROR = xbmcgui.NOTIFICATION_INFO = 0
        xbmcplugin = types.ModuleType("xbmcplugin")
        xbmcplugin.addDirectoryItem = lambda h, u, li, isFolder=False: fake.items.append((u, li, isFolder))
        xbmcplugin.setContent = lambda h, c: setattr(fake, "content", c)
        xbmcplugin.endOfDirectory = lambda h, succeeded=True, cacheToDisc=False: setattr(fake, "ended", succeeded)
        xbmcplugin.setResolvedUrl = lambda h, ok, li: fake.resolved.append((ok, li))
        xbmcaddon = types.ModuleType("xbmcaddon")
        xbmcaddon.Addon = Addon
        xbmcvfs = types.ModuleType("xbmcvfs")
        xbmcvfs.translatePath = lambda p: data_dir + os.sep
        for name, module in dict(xbmc=xbmc, xbmcgui=xbmcgui, xbmcplugin=xbmcplugin, xbmcaddon=xbmcaddon, xbmcvfs=xbmcvfs).items():
            sys.modules[name] = module


fake = Fake()
settings = {}
fake.install(settings)
sys.path.insert(0, ROOT)
from resources.lib import api  # noqa: E402
from resources.lib import views  # noqa: E402


def labels():
    return [li.label for _, li, _ in fake.items]


class Setup(unittest.TestCase):
    def setUp(self):
        fake.reset()
        settings.clear()

    def test_with_no_server_it_offers_to_find_one(self):
        views.route("")
        self.assertEqual(labels(), ["Find Vesper on this network", "Type the server address"])
        self.assertTrue(fake.ended)

    def test_a_typed_address_is_saved_tidily(self):
        fake.answers["input"] = "192.168.1.9:8484/"
        views.route("?action=type_address")
        self.assertEqual(settings["server"], "http://192.168.1.9:8484")

    def test_an_unreachable_server_says_so_and_still_draws_a_way_out(self):
        settings["server"] = "http://127.0.0.1:1"
        views.route("")
        self.assertIn("Open settings", labels())
        self.assertTrue(any("Cannot reach" in n for n in fake.notes), fake.notes)


@unittest.skipUnless(LIVE, "set VESPER_URL to a lite-mode server")
class Screens(unittest.TestCase):
    def setUp(self):
        fake.reset()
        settings.clear()
        settings["server"] = LIVE
        self.client = api.Vesper(LIVE)
        self.client.ensure_ready()
        made = self.client.record("Evening news", "http://127.0.0.1:1/x.ts", 30, channel_name="News 1")
        self.rid = made.get("id") or made["recording"]["id"]

    def tearDown(self):
        self.client.delete(self.rid)

    def test_the_home_screen_has_the_main_places(self):
        views.route("")
        self.assertEqual(
            [x for x in labels() if not x.startswith("Continue")],
            ["Recording now and coming up", "Recordings", "Live TV", "Movies", "Series", "Schedules", "Search channels"],
        )

    def test_a_recording_in_progress_is_listed_playable_and_stoppable(self):
        views.route("?action=recordings&view=active")
        rows = [(u, li) for u, li, _ in fake.items if "Evening news" in li.label]
        self.assertEqual(len(rows), 1)
        target, li = rows[0]
        self.assertIn("action=play", target)
        self.assertEqual(li.props.get("IsPlayable"), "true")
        self.assertIn("Stop recording", [m[0] for m in li.menu])
        self.assertIn("Delete", [m[0] for m in li.menu])

    def test_playing_a_recording_hands_kodi_its_playlist(self):
        views.route("?action=play&id=" + self.rid)
        ok, li = fake.resolved[-1]
        self.assertTrue(ok)
        self.assertTrue(li.path.endswith("/recordings/%s/index.m3u8" % self.rid), li.path)
        self.assertEqual(li.mime, "application/vnd.apple.mpegurl")
        self.assertIsNone(api.recording_id_of("") )
        self.assertEqual(api.recording_id_of(li.path), self.rid)

    def test_a_gone_recording_cancels_playback_with_a_message(self):
        views.route("?action=play&id=nothing-here")
        self.assertFalse(fake.resolved[-1][0])
        self.assertTrue(any("gone" in n for n in fake.notes), fake.notes)

    def test_delete_asks_first_and_then_removes(self):
        fake.answers["yesno"] = False
        views.route("?action=delete&id=%s&title=x" % self.rid)
        self.assertTrue([r for r in self.client.recordings()["recordings"] if r["id"] == self.rid])
        fake.answers["yesno"] = True
        views.route("?action=delete&id=%s&title=x" % self.rid)
        self.assertFalse([r for r in self.client.recordings()["recordings"] if r["id"] == self.rid])
        self.assertIn("Container.Refresh", fake.builtins)
        self.client.record("replacement", "http://127.0.0.1:1/x.ts", 30)  # keeps tearDown simple
        self.rid = self.client.recordings()["recordings"][0]["id"]

    def test_record_now_sends_the_chosen_length(self):
        fake.answers["select"] = 1  # one hour
        views.route("?action=record&url=http%3A%2F%2F127.0.0.1%3A1%2Fy.ts&name=Sports")
        made = [r for r in self.client.recordings()["recordings"] if r["title"] == "Sports"]
        self.assertEqual(len(made), 1)
        self.assertEqual(made[0]["maxSeconds"], 3600)
        self.client.delete(made[0]["id"])

    def test_schedules_screen_loads_when_there_are_none(self):
        views.route("?action=schedules")
        self.assertTrue(fake.ended)
        self.assertEqual(len(labels()), 1)


if __name__ == "__main__":
    unittest.main()
