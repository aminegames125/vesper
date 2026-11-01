"""A resolver plugin. Print {"url": ..., "title": ..., "engine": "direct" | "ytdlp"} to take over an
address, or print nothing to let the next plugin (or the server) handle it."""

import json
import sys

request = json.load(sys.stdin)
if request["hook"] != "resolve":
    sys.exit(0)

url = request["data"]["url"]
for rule in request["config"].get("rules", []):
    if url.startswith(rule["from"]):
        print(json.dumps({"url": rule["to"] + url[len(rule["from"]):], "engine": "direct"}))
        break
