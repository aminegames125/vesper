import hashlib
import os
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import make_repo  # noqa: E402


class Repository(unittest.TestCase):
    def test_the_catalogue_lists_both_add_ons_and_matches_its_checksum(self):
        with tempfile.TemporaryDirectory() as out:
            make_repo.build(out, "1.2.3")
            catalogue = open(os.path.join(out, "addons.xml"), encoding="utf-8").read()
            ids = {a.get("id"): a.get("version") for a in ET.fromstring(catalogue).findall("addon")}
            self.assertEqual(ids, {"plugin.video.vesper": "1.2.3", "repository.vesper": "1.0.0"})
            self.assertEqual(open(os.path.join(out, "addons.xml.md5")).read(), hashlib.md5(catalogue.encode()).hexdigest())
            for addon, version in ids.items():
                path = os.path.join(out, addon, "%s-%s.zip" % (addon, version))
                names = zipfile.ZipFile(path).namelist()
                self.assertIn(addon + "/addon.xml", names)
            self.assertTrue(os.path.exists(os.path.join(out, "plugin.video.vesper", "icon.png")))

    def test_the_repository_points_at_the_same_place_the_catalogue_is_served(self):
        manifest = open(os.path.join(make_repo.REPO_SOURCE, "addon.xml"), encoding="utf-8").read()
        for tag in ("info", "checksum", "datadir"):
            self.assertIn("https://amineos.dev/vesper/kodi/", ET.fromstring(manifest).find(".//" + tag).text)

    def test_a_bad_version_is_refused(self):
        with tempfile.TemporaryDirectory() as out, self.assertRaises(SystemExit):
            make_repo.build(out, "v1")


if __name__ == "__main__":
    unittest.main()
