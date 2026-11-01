"""An event plugin: the output is ignored, so it only has to do its job and exit 0."""

import json
import sys
import urllib.request

request = json.load(sys.stdin)
if request["hook"] != "item.finished":
    sys.exit(0)

item, config = request["data"], request["config"]
topic = config.get("topic")
if not topic:
    sys.exit("Set \"topic\" in this plugin's configuration.")

done = item["status"] == "done"
text = ("Finished: " if done else "Failed: ") + item["title"] + ("" if done else " (%s)" % (item.get("error") or "unknown error"))
server = config.get("server", "https://ntfy.sh").rstrip("/")
urllib.request.urlopen(urllib.request.Request("%s/%s" % (server, topic), data=text.encode(), method="POST"), timeout=10)
