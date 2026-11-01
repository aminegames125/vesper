import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "plugin.video.vesper", "resources", "lib"))

import notify  # noqa: E402


def row(rid, status, title="News", error=None):
    return {"id": rid, "status": status, "title": title, "error": error}


class Notifications(unittest.TestCase):
    def test_the_first_look_announces_nothing(self):
        messages, current = notify.changes(None, [row("a", "recording")])
        self.assertEqual(messages, [])
        self.assertEqual(current, {"a": "recording"})

    def test_starting_finishing_and_failing_are_announced_once(self):
        _, seen = notify.changes(None, [row("a", "scheduled"), row("b", "recording", "Film"), row("c", "scheduled", "Late")])
        messages, seen = notify.changes(seen, [row("a", "recording"), row("b", "done", "Film"), row("c", "failed", "Late", "no signal")])
        self.assertEqual(
            messages,
            [("Recording started: News", False), ("Finished recording: Film", False), ("Recording failed: Late (no signal)", True)],
        )
        self.assertEqual(notify.changes(seen, [row("a", "recording"), row("b", "done", "Film"), row("c", "failed", "Late")])[0], [])

    def test_a_recording_that_was_already_done_is_not_news(self):
        _, seen = notify.changes(None, [])
        self.assertEqual(notify.changes(seen, [row("x", "done")])[0], [])

    def test_a_nearly_full_disk_warns(self):
        self.assertIn("0.5 GB", notify.low_disk({"diskFree": 512 * 1024**2}))
        self.assertIsNone(notify.low_disk({"diskFree": 50 * 1024**3}))
        self.assertIsNone(notify.low_disk({}))


if __name__ == "__main__":
    unittest.main()
