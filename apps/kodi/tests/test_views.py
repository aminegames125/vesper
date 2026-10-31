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
        self.typed = []
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
                if fake.typed:
                    return fake.typed.pop(0)
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
        xbmcgui.NOTIFICATION_ERROR = xbmcgui.NOTIFICATION_INFO = xbmcgui.ALPHANUM_HIDE_INPUT = 0

        class DialogProgress:
            def create(self, *a):
                pass

            def close(self):
                pass

        xbmcgui.DialogProgress = DialogProgress
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


class StubClient:
    """Stands in for the server so the provider screens run without one."""

    def __init__(self, sources=()):
        self.saved, self.removed = list(sources), []

    def recordings(self, **_):
        return {"recordings": []}

    def sources(self):
        return self.saved

    def add_source(self, name, kind, url, username="", password=""):
        self.saved.append({"id": "s%d" % len(self.saved), "name": name, "kind": kind, "url": url, "username": username})

    def remove_source(self, sid):
        self.removed.append(sid)


class Providers(unittest.TestCase):
    def setUp(self):
        fake.reset()
        settings.clear()
        settings["server"] = "http://127.0.0.1:8484"
        self.stub = StubClient()
        real = views.common.client
        self.addCleanup(setattr, views.common, "client", real)
        views.common.client = lambda: self.stub

    def test_with_no_provider_the_home_screen_leads_with_adding_one(self):
        views.route("")
        self.assertEqual(labels()[0], "Add your IPTV provider")
        self.assertNotIn("IPTV providers", labels())

    def test_a_playlist_link_is_saved_on_the_server(self):
        fake.answers["select"] = 0
        fake.typed = ["http://iptv.example/list.m3u", "Home TV"]
        views.route("?action=add_provider")
        self.assertEqual(self.stub.saved[0]["kind"], "m3u")
        self.assertEqual(self.stub.saved[0]["url"], "http://iptv.example/list.m3u")
        self.assertEqual(self.stub.saved[0]["name"], "Home TV")

    def test_an_xtream_login_needs_all_three_parts(self):
        fake.answers["select"] = 1
        fake.typed = ["http://host:8080", "me", "", ]
        views.route("?action=add_provider")
        self.assertEqual(self.stub.saved, [])
        fake.typed = ["http://host:8080", "me", "secret", "Cable"]
        views.route("?action=add_provider")
        self.assertEqual((self.stub.saved[0]["kind"], self.stub.saved[0]["username"]), ("xtream", "me"))

    def test_nothing_is_saved_when_the_dialog_is_cancelled(self):
        fake.answers["select"] = -1
        views.route("?action=add_provider")
        self.assertEqual(self.stub.saved, [])

    def test_the_provider_in_kodi_live_tv_is_offered_and_used(self):
        folder = os.path.join(views.xbmcvfs.translatePath(""), "addon_data", "pvr.iptvsimple")
        os.makedirs(folder)
        with open(os.path.join(folder, "instance-settings-1.xml"), "w", encoding="utf-8") as f:
            f.write(
                '<settings version="2"><setting id="kodi_addon_instance_name">Sky</setting>'
                '<setting id="m3uPathType">1</setting><setting id="m3uUrl">http://p.example/get.php?u=1</setting></settings>'
            )
        fake.answers["select"] = 2
        views.route("?action=add_provider")
        self.assertEqual((self.stub.saved[0]["name"], self.stub.saved[0]["url"]), ("Sky", "http://p.example/get.php?u=1"))

    def test_providers_are_listed_and_can_be_removed(self):
        self.stub.saved = [{"id": "s0", "name": "Home TV", "kind": "m3u", "url": "x", "username": ""}]
        views.route("")
        self.assertIn("IPTV providers", labels())
        fake.reset()
        views.route("?action=providers")
        self.assertEqual(labels(), ["Add a provider", "Home TV"])
        views.route("?action=provider_menu&id=s0&name=Home+TV")
        self.assertEqual(self.stub.removed, ["s0"])


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
