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
        self.labels, self.visible, self.rpc = {}, set(), {}
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
            def __init__(self, addon_id=None):
                pass

            def getSetting(self, key):
                return settings.get(key, "")

            def setSetting(self, key, value):
                settings[key] = value

            def getAddonInfo(self, key):
                return "plugin.video.vesper"

        xbmc = types.ModuleType("xbmc")
        xbmc.executebuiltin = lambda cmd: fake.builtins.append(cmd)
        xbmc.log = lambda *a: None
        xbmc.LOGWARNING = 2
        xbmc.getInfoLabel = lambda key: fake.labels.get(key, '')
        xbmc.getCondVisibility = lambda cond: cond in fake.visible
        xbmc.executeJSONRPC = lambda request: __import__('json').dumps(fake.rpc)
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
    """Stands in for the server so the Kodi-side behaviour runs without one."""

    mode = "lite"
    username = ""

    def __init__(self, sources=(), channels=()):
        self.saved, self.found, self.recorded = list(sources), list(channels), []
        self.calls, self.rows, self.rule_rows = [], [], []

    def __getattr__(self, name):
        # Anything else the add-on asks of the server is just written down.
        def call(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return {}

        return call

    def schedules(self):
        return self.rows

    def rules(self):
        return self.rule_rows

    def status(self):
        return {
            "version": "9.9.9",
            "mode": "full",
            "diskFree": 5 * 1024**3,
            "diskTotal": 10 * 1024**3,
            "recording": 1,
            "scheduled": 2,
            "failed": 0,
            "next": {"title": "Late film", "startAt": 2000000000},
        }

    def me(self):
        return {"username": "amine", "role": "user", "storageUsed": 1024**3, "storage_bytes": 5 * 1024**3, "max_concurrent": 2}

    def recordings(self, **_):
        return {"recordings": []}

    def sources(self):
        return self.saved

    def add_source(self, name, kind, url, username="", password=""):
        self.saved.append({"id": "s%d" % len(self.saved), "name": name, "kind": kind, "url": url})

    def channels(self, source="all", q="", **_):
        return {"channels": [c for c in self.found if q.lower() in c["name"].lower()]}

    def record(self, title, url, seconds, **extra):
        self.recorded.append(dict(title=title, url=url, seconds=seconds, **extra))


def write_iptv_simple(url="http://p.example/get.php?u=1", name="Sky"):
    folder = os.path.join(views.bridge.xbmcvfs.translatePath(""), "addon_data", "pvr.iptvsimple")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "instance-settings-1.xml"), "w", encoding="utf-8") as f:
        f.write(
            '<settings version="2"><setting id="kodi_addon_instance_name">%s</setting>'
            '<setting id="m3uPathType">1</setting><setting id="m3uUrl">%s</setting></settings>' % (name, url)
        )


class OnTopOfKodi(unittest.TestCase):
    def setUp(self):
        fake.reset()
        settings.clear()
        settings["server"] = "http://127.0.0.1:8484"
        self.stub = StubClient(channels=[{"name": "BBC One HD", "url": "http://p.example/bbc1.m3u8", "alt": ["http://b.example/bbc1"]}])
        real = views.common.client
        self.addCleanup(setattr, views.common, "client", real)
        views.common.client = lambda: self.stub

    def test_the_home_screen_lists_the_main_places(self):
        self.stub.saved = [{"id": "s0", "name": "x", "kind": "m3u", "url": "u"}]
        views.route("")
        self.assertEqual(labels(), [
                "Continue watching",
                "Recording now and coming up",
                "Recordings",
                "Movies",
                "Series",
                "Downloads",
                "Favourites",
                "Kodi favourites",
                "Schedules",
                "Add-ons Vesper can save from",
                "Download from a web address",
                "Sync now",
                "Server",
            ])

    def test_sign_in_asks_for_the_login_and_keeps_it(self):
        fake.typed = ["192.168.1.9:8484", "alice", "secret"]
        views.route("?action=sign_in")
        self.assertEqual((settings["username"], settings["password"]), ("alice", "secret"))
        self.assertEqual(settings["server"], "http://192.168.1.9:8484")

    def test_a_wrong_login_does_not_replace_a_working_one(self):
        settings["username"], settings["password"] = "old", "oldpass"
        fake.typed = ["192.168.1.9:8484", "new", "wrong"]

        def refuse():
            raise views.api.VesperError("Wrong username or password.")

        views.common.client = refuse
        views.route("?action=sign_in")
        self.assertEqual((settings["username"], settings["password"]), ("old", "oldpass"))

    def test_a_server_that_wants_a_login_puts_sign_in_on_the_home_screen(self):
        def refuse():
            raise views.api.VesperError("This server needs a username and password. Open Vesper and choose Sign in.")

        views.common.client = refuse
        views.route("")
        self.assertEqual(labels()[0], "Sign in")

    def test_with_no_provider_it_offers_to_read_them_from_kodi(self):
        views.route("")
        self.assertEqual(labels()[-1], "Connect my IPTV providers")

    def test_providers_set_up_in_kodi_are_connected_once(self):
        write_iptv_simple()
        self.assertEqual(views.bridge.sync(), 1)
        self.assertEqual((self.stub.saved[0]["name"], self.stub.saved[0]["url"]), ("Sky", "http://p.example/get.php?u=1"))
        self.assertEqual(views.bridge.sync(), 0)
        self.assertEqual(len(self.stub.saved), 1)

    def test_the_sync_button_runs_the_same_thing_and_refreshes(self):
        write_iptv_simple()
        views.route("?action=sync")
        self.assertEqual(len(self.stub.saved), 1)
        self.assertIn("Container.Refresh", fake.builtins)

    def test_a_channel_in_kodis_list_is_recorded_for_the_chosen_length(self):
        fake.labels.update({"ListItem.ChannelName": "BBC One HD", "ListItem.DBID": "12"})
        fake.answers["select"] = 1  # one hour
        views.bridge.record_from_kodi()
        (r,) = self.stub.recorded
        self.assertEqual((r["title"], r["url"], r["seconds"], r["backup_url"]), ("BBC One HD", "http://p.example/bbc1.m3u8", 3600, "http://b.example/bbc1"))
        self.assertIsNone(r["start_at"])

    def test_a_programme_in_the_guide_is_scheduled_with_padding(self):
        import time as t

        start = int(t.time()) + 7200
        iso = lambda e: t.strftime("%Y-%m-%d %H:%M:%S", t.gmtime(e))
        fake.labels.update({"ListItem.ChannelName": "bbc one hd", "ListItem.Title": "Evening News", "ListItem.DBID": "99"})
        fake.visible.add("Window.IsActive(tvguide)")
        fake.rpc = {"result": {"broadcastdetails": {"title": "Evening News", "starttime": iso(start), "endtime": iso(start + 1800)}}}
        fake.answers["select"] = 0  # record this programme
        views.bridge.record_from_kodi()
        (r,) = self.stub.recorded
        self.assertEqual(r["title"], "Evening News")
        self.assertAlmostEqual(r["start_at"], start - 60, delta=2)
        self.assertEqual(r["seconds"], 1800 + 180 + 60)

    def test_a_programme_that_is_over_is_refused(self):
        fake.labels.update({"ListItem.ChannelName": "BBC One HD", "ListItem.DBID": "99"})
        fake.visible.add("Window.IsActive(tvguide)")
        fake.rpc = {"result": {"broadcastdetails": {"starttime": "2000-01-01 10:00:00", "endtime": "2000-01-01 11:00:00"}}}
        views.bridge.record_from_kodi()
        self.assertEqual(self.stub.recorded, [])
        self.assertTrue(any("over" in n for n in fake.notes), fake.notes)

    def test_a_channel_vesper_does_not_have_says_how_to_add_it(self):
        fake.labels["ListItem.ChannelName"] = "Mystery TV"
        views.bridge.record_from_kodi()
        self.assertEqual(self.stub.recorded, [])
        self.assertTrue(any("PVR IPTV Simple" in n for n in fake.notes), fake.notes)


class RepeatAndManage(unittest.TestCase):
    """Repeating recordings, series, editing, renaming and the server screen."""

    SCHEDULE = {"id": "s1", "title": "News", "startTime": "21:30", "seconds": 1800, "days": 0, "startDate": "2030-01-01"}

    def setUp(self):
        fake.reset()
        settings.clear()
        settings["server"] = "http://127.0.0.1:8484"
        self.stub = StubClient(channels=[{"name": "BBC One HD", "url": "http://p.example/bbc1.m3u8", "id": "bbc1.uk"}])
        real = views.common.client
        self.addCleanup(setattr, views.common, "client", real)
        views.common.client = lambda ready=True: self.stub

    def guide_entry(self, zone="Europe/Paris"):
        import time as t

        start = int(t.time()) + 7200
        iso = lambda e: t.strftime("%Y-%m-%d %H:%M:%S", t.gmtime(e))
        settings["timezone"] = zone
        fake.labels.update({"ListItem.ChannelName": "BBC One HD", "ListItem.Title": "Evening News", "ListItem.DBID": "99"})
        fake.visible.add("Window.IsActive(tvguide)")
        fake.rpc = {"result": {"broadcastdetails": {"title": "Evening News", "starttime": iso(start), "endtime": iso(start + 1800)}}}

    def test_a_programme_can_repeat_every_week(self):
        self.guide_entry()
        fake.answers["select"] = 1  # every week
        views.bridge.record_from_kodi()
        name, args, kw = self.stub.calls[-1]
        self.assertEqual(name, "create_schedule")
        self.assertEqual((args[0], args[2], args[5]), ("Evening News", "Europe/Paris", 1800))
        self.assertEqual(kw["epg_id"], "bbc1.uk")
        self.assertIn(kw["days"], [1 << i for i in range(7)])

    def test_a_programme_can_repeat_every_day(self):
        self.guide_entry()
        fake.answers["select"] = 2
        views.bridge.record_from_kodi()
        self.assertEqual(self.stub.calls[-1][2]["days"], 127)

    def test_a_programme_can_be_recorded_every_time_it_is_on(self):
        self.guide_entry()
        fake.answers["select"] = 3
        views.bridge.record_from_kodi()
        name, args, _ = self.stub.calls[-1]
        self.assertEqual((name, args[:2]), ("create_rule", ("Evening News", "bbc1.uk")))

    def test_a_channel_without_a_guide_id_cannot_be_a_series(self):
        import xbmcgui

        self.guide_entry()
        del self.stub.found[0]["id"]
        shown = []
        original = xbmcgui.Dialog.select
        xbmcgui.Dialog.select = lambda self_, heading, options: (shown.extend(options), -1)[1]
        self.addCleanup(setattr, xbmcgui.Dialog, "select", original)
        views.bridge.record_from_kodi()
        self.assertEqual(len(shown), 3)
        self.assertFalse([x for x in shown if "every episode" in x.lower()])

    def test_a_schedule_can_be_edited(self):
        self.stub.rows = [self.SCHEDULE]
        fake.answers["select"] = 1  # the start time
        fake.typed = ["07:15"]
        views.edit_schedule("s1")
        name, args, kw = self.stub.calls[-1]
        self.assertEqual((name, kw), ("update_schedule", {"start_time": "07:15"}))
        self.assertEqual(args[0], self.SCHEDULE)

    def test_a_bad_start_time_is_refused(self):
        self.stub.rows = [self.SCHEDULE]
        fake.answers["select"] = 1
        fake.typed = ["25:99"]
        views.edit_schedule("s1")
        self.assertFalse([c for c in self.stub.calls if c[0] == "update_schedule"])
        self.assertTrue(any("21:30" in n for n in fake.notes), fake.notes)

    def test_schedules_and_series_are_listed_and_managed(self):
        self.stub.rows = [dict(self.SCHEDULE, days=31, channelName="BBC", enabled=False)]
        self.stub.rule_rows = [{"id": "r1", "title": "Doctor Who", "channelName": "BBC", "enabled": True}]
        views.route("?action=schedules")
        self.assertEqual(labels(), ["[COLOR FF9A9AA3]21:30  News (paused)[/COLOR]", "Every episode: Doctor Who"])
        fake.answers["select"] = 0
        views.route("?action=rule_menu&id=r1&paused=0&title=Doctor+Who")
        self.assertEqual(self.stub.calls[-1][:2], ("set_rule_enabled", ("r1", False)))
        fake.answers["select"] = 1
        views.route("?action=rule_menu&id=r1&paused=0&title=Doctor+Who")
        self.assertEqual(self.stub.calls[-1][:2], ("delete_rule", ("r1",)))

    def test_a_recording_can_be_renamed_and_filed(self):
        fake.typed = ["Better title"]
        views.route("?action=rename&id=a1&title=Old")
        self.assertEqual(self.stub.calls[-1][:2], ("rename", ("a1", "Better title")))
        fake.typed = ["Sport"]
        views.route("?action=folder&id=a1&tag=")
        self.assertEqual(self.stub.calls[-1][:2], ("set_folder", ("a1", "Sport")))
        fake.typed = [""]  # cancelled: nothing changes
        before = len(self.stub.calls)
        views.route("?action=rename&id=a1&title=Old")
        self.assertEqual(len(self.stub.calls), before)

    def test_the_server_screen_shows_disk_next_recording_and_the_account(self):
        import xbmcgui

        shown = []
        xbmcgui.Dialog.textviewer = lambda self_, heading, text: shown.append(text)
        self.stub.mode = "full"
        views.route("?action=status")
        self.assertIn("5.0 GB free of 10.0 GB", shown[0])
        self.assertIn("Late film", shown[0])
        self.assertIn("Account: amine", shown[0])
        self.assertIn("2 at a time", shown[0])

    def test_an_address_on_the_internet_without_https_is_questioned(self):
        settings.pop("server")
        fake.answers["input"] = "tv.example.com:8484"
        fake.answers["yesno"] = False
        views.type_address()
        self.assertNotIn("server", settings)
        fake.answers["input"] = "https://tv.example.com"
        views.type_address()
        self.assertEqual(settings["server"], "https://tv.example.com")

    def test_a_finished_recording_has_its_menu_and_a_thumbnail_with_the_media_key(self):
        row = {"id": "a1", "title": "T", "status": "done", "watched": False, "positionS": 0, "seconds": 60, "bytes": 1, "keepUntil": None, "thumb": True}
        self.stub.thumb_url = lambda rid: "http://h/thumb?token=k"
        _, li, _ = views.recording_item(self.stub, row)
        self.assertEqual([m[0] for m in li.menu], ["Keep forever", "Mark as watched", "Rename", "Move to folder", "Delete"])
        self.assertEqual(li.art["thumb"], "http://h/thumb?token=k")


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
            [x for x in labels() if not x.startswith(("Continue", "Connect"))],
            [
                "Recording now and coming up",
                "Recordings",
                "Movies",
                "Series",
                "Downloads",
                "Favourites",
                "Kodi favourites",
                "Schedules",
                "Add-ons Vesper can save from",
                "Download from a web address",
                "Sync now",
                "Server",
            ],
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

    def test_schedules_screen_loads_when_there_are_none(self):
        views.route("?action=schedules")
        self.assertTrue(fake.ended)
        self.assertEqual(len(labels()), 1)


if __name__ == "__main__":
    unittest.main()
