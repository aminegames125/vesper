"""A Kodi service that reacts to Vesper and saves things through its public API.

Add `<import addon="plugin.video.vesper" version="0.28.0"/>` to your addon.xml, then run this as an
`xbmc.service`.
"""

import json

import vesper
import xbmc


class Listener(xbmc.Monitor):
    def onNotification(self, sender, method, data):
        if sender != "plugin.video.vesper":
            return
        info = json.loads(data) if data else {}
        if method == "Other.item_finished":
            xbmc.log("Vesper finished: %s" % info.get("title"), xbmc.LOGINFO)
            # Anything finished can be turned into a favourite, or trigger your own add-on.
            vesper.add_favorite(info["title"], "plugin://plugin.video.vesper/?action=play&id=" + info["id"], "movie")


if __name__ == "__main__":
    monitor = Listener()
    # `vesper.download` and friends can be called from anywhere in your add-on:
    #   vesper.download("A video", "https://example.org/watch/1", encoder="h264", quality="1080")
    while not monitor.abortRequested():
        monitor.waitForAbort(60)
