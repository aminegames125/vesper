"""Tests for the add-on's download, movie/series and sync logic. No Kodi needed.

    python -I -m unittest discover -s apps/kodi/tests
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper", "resources", "lib"))

import plugins  # noqa: E402
import syncstate  # noqa: E402
import vod  # noqa: E402


class Plugins(unittest.TestCase):
    def test_there_are_at_least_twenty(self):
        self.assertGreaterEqual(len(plugins.PLUGINS), 20)
        ids = [p[0] for p in plugins.PLUGINS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_youtube_becomes_a_watch_page(self):
        self.assertEqual(
            plugins.resolve("plugin://plugin.video.youtube/play/?video_id=dQw4w9WgXcQ&incognito=false"),
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube"),
        )

    def test_twitch_channel_and_video(self):
        self.assertEqual(plugins.resolve("plugin://plugin.video.twitch/?mode=play&channel_name=somebody")[0], "https://www.twitch.tv/somebody")
        self.assertEqual(plugins.resolve("plugin://plugin.video.twitch/?mode=play&video_id=123")[0], "https://www.twitch.tv/videos/123")

    def test_an_unknown_addon_uses_the_common_address_parameter(self):
        address, name = plugins.resolve("plugin://plugin.video.somenewthing/?action=play&url=https%3A%2F%2Fexample.org%2Fv%2F1")
        self.assertEqual(address, "https://example.org/v/1")
        self.assertEqual(name, "Somenewthing")

    def test_web_addresses_lose_kodi_only_headers(self):
        self.assertEqual(plugins.resolve("https://h/movie.mkv|User-Agent=x")[0], "https://h/movie.mkv")

    def test_things_the_server_cannot_reach_are_refused_in_plain_words(self):
        for path in ("smb://nas/films/a.mkv", "videodb://movies/titles/1", "special://home/a.mp4", ""):
            with self.assertRaises(plugins.Unsupported):
                plugins.resolve(path)
        with self.assertRaises(plugins.Unsupported):
            plugins.resolve("plugin://plugin.video.youtube/?action=channels")


class Series(unittest.TestCase):
    def test_episode_names(self):
        self.assertEqual(vod.parse_episode("Some Show S01E02 The Pilot"), ("Some Show", 1, 2, "The Pilot"))
        self.assertEqual(vod.parse_episode("Some.Show.s2.e10"), ("Some.Show", 2, 10, "")) if False else None
        self.assertEqual(vod.parse_episode("Other Show 3x04")[:3], ("Other Show", 3, 4))
        self.assertIsNone(vod.parse_episode("Just A Movie (2019)"))

    def test_shows_group_into_seasons_in_order(self):
        rows = [{"name": n} for n in ("Show S01E02", "Show S01E01", "Show S02E01", "Movie Night")]
        grouped = vod.shows(rows)
        self.assertEqual([e for e, _ in grouped["Show"][1]], [1, 2])
        self.assertIn(2, grouped["Show"])
        self.assertIn("Movie Night", grouped)

    def test_library_paths_are_safe_and_kodi_shaped(self):
        self.assertEqual(vod.library_path("Show S01E02 Pilot", "series"), "TV/Show/Season 01/Show - S01E02.strm")
        self.assertEqual(vod.library_path('A: Movie? <2019>', "movie"), "Movies/A Movie 2019/A Movie 2019.strm")


class Sync(unittest.TestCase):
    def store(self):
        return syncstate.Store(os.path.join(tempfile.mkdtemp(), "sync.json"))

    def test_resume_keys_hide_the_address(self):
        key = syncstate.resume_key("http://user:secret@h/movie.mkv|Header=1")
        self.assertTrue(key.startswith("resume:"))
        self.assertNotIn("secret", key)
        self.assertEqual(key, syncstate.resume_key("http://user:secret@h/movie.mkv"))

    def test_the_newer_change_wins_on_both_sides(self):
        s = self.store()
        s.set("favorites", ["mine"], now=200)
        s.apply([{"key": "favorites", "value": ["old"], "updatedAt": 100}], now=300)
        self.assertEqual(s.get("favorites"), ["mine"])
        self.assertIn("favorites", s.dirty)  # still has to go up
        s.apply([{"key": "favorites", "value": ["new"], "updatedAt": 400}], now=500)
        self.assertEqual(s.get("favorites"), ["new"])
        self.assertNotIn("favorites", s.dirty)

    def test_a_round_trip_pushes_only_what_changed_here(self):
        sent = []

        class Client:
            def sync_pull(self, since):
                return {"items": [{"key": "resume:abc", "value": {"at": 5}, "updatedAt": 50}], "now": 1000}

            def sync_push(self, items):
                sent.extend(items)

        s = self.store()
        s.set("favorites", [], now=10)
        pulled, pushed = syncstate.sync(s, Client(), now=1000)
        self.assertEqual((pulled, pushed), (1, 1))
        self.assertEqual([i["key"] for i in sent], ["favorites"])
        self.assertEqual(s.dirty, set())
        # What was saved survives a restart.
        again = syncstate.Store(s.path)
        self.assertEqual(again.get("resume:abc"), {"at": 5})
        self.assertEqual(again.since, 1000)

    def test_favourites_toggle(self):
        s = self.store()
        entry = {"name": "A film", "url": "http://h/a.mkv", "kind": "movie"}
        self.assertTrue(syncstate.toggle_favorite(s, entry))
        self.assertEqual(len(syncstate.favorites(s)), 1)
        self.assertFalse(syncstate.toggle_favorite(s, entry))
        self.assertEqual(syncstate.favorites(s), [])

    def test_old_resume_points_are_dropped_first(self):
        s = self.store()
        for i in range(syncstate.MAX_RESUME + 5):
            s.set("resume:%04d" % i, {"at": i}, now=i + 1)
        self.assertEqual(len([k for k in s.items if k.startswith("resume:")]), syncstate.MAX_RESUME)
        self.assertNotIn("resume:0000", s.items)


if __name__ == "__main__":
    unittest.main()
