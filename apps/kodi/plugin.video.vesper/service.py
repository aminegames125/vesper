"""Runs while Kodi runs. Remembers where you stopped in a Vesper recording, so the next time (here,
in the Vesper app, or on another Kodi) it can resume."""

import threading

import xbmc

from resources.lib import api, common


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


def run():
    monitor = xbmc.Monitor()
    player = Watcher()
    while not monitor.waitForAbort(5):
        player.tick()


run()
