"""Runs while Kodi runs. Remembers where you stopped in a Vesper recording, so the next time (here,
in the Vesper app, or on another Kodi) it can resume."""

import threading
import time

import xbmc

from resources.lib import api, bridge, common, discovery, notify


class Watcher(xbmc.Player):
    def __init__(self):
        super().__init__()
        self.rid = None
        self.at = 0.0
        self.total = 0.0

    def onAVStarted(self):
        try:
            self.rid = api.recording_id_of(self.getPlayingFile())
        except RuntimeError:
            self.rid = None
        self.at = self.total = 0.0

    def tick(self):
        if self.rid and self.isPlayingVideo():
            try:
                self.at, self.total = self.getTime(), self.getTotalTime()
            except RuntimeError:
                pass

    def onPlayBackStopped(self):
        self.save(ended=False)

    def onPlayBackEnded(self):
        self.save(ended=True)

    def save(self, ended):
        rid, at, total = self.rid, self.at, self.total
        self.rid = None
        if not rid:
            return
        # Within the last half minute counts as watched; so does reaching the end.
        done = ended or (total > 60 and at >= total - 30)
        fields = {"watched": True, "position_s": 0} if done else {"position_s": int(at)}
        if not done and at < 20:
            return

        def send():
            try:
                common.client().patch(rid, **fields)
            except api.VesperError:
                pass

        threading.Thread(target=send, daemon=True).start()


def find_server():
    """First start: use the one Vesper server on the network, so there is nothing to set up."""
    if api.normalise(common.setting("server")):
        return
    found = discovery.discover(3.5)
    if len(found) == 1:
        common.set_setting("server", found[0]["address"])
        if found[0].get("mode") == "full" and not common.setting("username"):
            bridge.say("Found %s. It has accounts: enter your username and password in the add-on settings." % found[0]["name"])
        else:
            bridge.say("Found %s. Press the menu button on a channel to record." % found[0]["name"])


SYNC_EVERY = 6 * 3600
POLL_EVERY = 30  # seconds between looks at the recordings, for notifications
DISK_EVERY = 3600


class Notifier:
    """Tells the person when a recording starts, finishes or fails, and when the disk is nearly full."""

    def __init__(self):
        self.seen = None
        self.disk_checked = 0.0
        self.disk_warned = False
        self.client = None
        self.key = None

    def _client(self):
        key = (common.setting("server"), common.setting("username"), common.setting("password"))
        if self.client is None or key != self.key:
            self.client, self.key, self.seen = common.client(), key, None
        return self.client

    def poll(self, now):
        if not common.flag("notify", True) or not api.normalise(common.setting("server")):
            return
        try:
            c = self._client()
            rows = c.recordings().get("recordings", [])
            messages, self.seen = notify.changes(self.seen, rows)
            for text, bad in messages:
                bridge.say(text, error=bad)
            if now - self.disk_checked >= DISK_EVERY:
                self.disk_checked = now
                warning = notify.low_disk(c.status())
                if warning and not self.disk_warned:
                    bridge.say(warning, error=True)
                self.disk_warned = bool(warning)
        except api.VesperError:
            self.client = None  # try again from scratch next time (server asleep, new password...)


def run():
    monitor = xbmc.Monitor()
    player = Watcher()
    notifier = Notifier()
    if not monitor.waitForAbort(20):  # let Kodi finish starting and loading Live TV
        find_server()
        bridge.sync()
    waited = polled = 0
    while not monitor.waitForAbort(5):
        player.tick()
        waited += 5
        polled += 5
        if polled >= POLL_EVERY:
            polled = 0
            notifier.poll(time.time())
        if waited >= SYNC_EVERY:
            waited = 0
            bridge.sync()


run()
