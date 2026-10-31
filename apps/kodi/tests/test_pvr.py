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


if __name__ == "__main__":
    unittest.main()
