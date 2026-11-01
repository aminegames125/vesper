import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper", "resources", "lib"))

import pvr  # noqa: E402


def write(profile, name, body):
    folder = os.path.join(profile, "addon_data", "pvr.iptvsimple")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
        f.write(body)


def setting(key, value):
    return '<setting id="%s">%s</setting>' % (key, value)


class IptvSimple(unittest.TestCase):
    def test_remote_playlists_are_found_once_each(self):
        with tempfile.TemporaryDirectory() as profile:
            link = "http://p.example/a.m3u"
            write(profile, "instance-settings-1.xml", "<settings>%s%s%s</settings>" % (setting("kodi_addon_instance_name", "Sky"), setting("m3uPathType", "1"), setting("m3uUrl", link)))
            write(profile, "instance-settings-2.xml", "<settings>%s%s</settings>" % (setting("m3uPathType", "1"), setting("m3uUrl", link)))
            self.assertEqual(pvr.find(profile), [{"name": "Sky", "url": link}])

    def test_a_file_on_this_device_is_skipped_because_the_server_cannot_read_it(self):
        with tempfile.TemporaryDirectory() as profile:
            write(profile, "settings.xml", "<settings>%s%s</settings>" % (setting("m3uPathType", "0"), setting("m3uPath", "/storage/list.m3u")))
            self.assertEqual(pvr.find(profile), [])

    def test_an_older_single_settings_file_is_read(self):
        with tempfile.TemporaryDirectory() as profile:
            write(profile, "settings.xml", "<settings>%s</settings>" % setting("m3uUrl", "https://p.example/b.m3u"))
            self.assertEqual(pvr.find(profile), [{"name": "Kodi Live TV", "url": "https://p.example/b.m3u"}])

    def test_no_iptv_simple_or_a_broken_file_gives_nothing(self):
        with tempfile.TemporaryDirectory() as profile:
            self.assertEqual(pvr.find(profile), [])
            write(profile, "settings.xml", "<not xml")
            self.assertEqual(pvr.find(profile), [])


class Matching(unittest.TestCase):
    def test_names_match_however_they_are_written(self):
        rows = [{"name": "BBC One"}, {"name": "BBC One HD"}]
        self.assertEqual(pvr.best_match(rows, "bbc-one hd")["name"], "BBC One HD")

    def test_one_candidate_is_taken_but_several_are_not_guessed(self):
        self.assertEqual(pvr.best_match([{"name": "Sky News HD"}], "Sky News")["name"], "Sky News HD")
        self.assertIsNone(pvr.best_match([{"name": "A 1"}, {"name": "A 2"}], "A"))

    def test_only_providers_the_server_lacks_are_listed(self):
        found = [{"name": "a", "url": "http://x/1"}, {"name": "b", "url": "http://x/2"}]
        self.assertEqual(pvr.missing(found, [{"url": "http://x/1 "}]), [found[1]])

    def test_a_guide_entry_is_over_airing_or_later(self):
        import time as t

        now = 1_800_000_000
        iso = lambda e: t.strftime("%Y-%m-%d %H:%M:%S", t.gmtime(e))
        entry = lambda a, b: {"starttime": iso(now + a), "endtime": iso(now + b)}
        self.assertEqual(pvr.programme(entry(-600, -60), now)[2], "over")
        self.assertEqual(pvr.programme(entry(-60, 600), now)[2], "airing")
        self.assertEqual(pvr.programme(entry(600, 900), now), (now + 600, now + 900, "later"))
        self.assertIsNone(pvr.programme({"starttime": "", "endtime": ""}, now))


class RepeatingRecordings(unittest.TestCase):
    def test_a_typed_time_zone_wins_then_the_environment(self):
        self.assertEqual(pvr.timezone_name("Europe/Paris", {"TZ": "Asia/Tokyo"}, root="/nonexistent"), "Europe/Paris")
        self.assertEqual(pvr.timezone_name("", {"TZ": ":Asia/Tokyo"}, root="/nonexistent"), "Asia/Tokyo")
        self.assertEqual(pvr.timezone_name("", {"TZ": "UTC"}, root="/nonexistent"), "UTC")
        self.assertEqual(pvr.timezone_name("not a zone", {}, root="/nonexistent"), "")

    def test_the_zone_is_read_from_etc_timezone(self):
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "etc"))
            with open(os.path.join(root, "etc", "timezone"), "w") as f:
                f.write("America/New_York" + chr(10))
            self.assertEqual(pvr.timezone_name("", {}, root=root), "America/New_York")

    def test_a_programme_becomes_wall_clock_fields_in_local_time(self):
        import time as t

        start = int(t.mktime((2030, 3, 6, 21, 30, 0, 0, 0, -1)))  # a Wednesday
        self.assertEqual(pvr.repeat_fields(start, "weekly"), ("21:30", "2030-03-06", 1 << 2))
        self.assertEqual(pvr.repeat_fields(start, "daily"), ("21:30", "2030-03-06", 127))
        self.assertEqual(pvr.repeat_fields(start, "once"), ("21:30", "2030-03-06", 0))


if __name__ == "__main__":
    unittest.main()
