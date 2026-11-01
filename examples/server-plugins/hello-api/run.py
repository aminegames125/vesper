"""A plugin that serves its own endpoint.

The server writes one JSON object to stdin: {"hook", "data", "config"}. For the `http` hook, `data`
holds the method, the path after /x/hello-api/, the query, the JSON body and the signed-in user.
Print one JSON object back: {"status": 200, "body": ...}, or any JSON value for a plain 200.
"""

import json
import sys

request = json.load(sys.stdin)
hook, data, config = request["hook"], request["data"], request["config"]

if hook == "test":
    print(json.dumps({"ok": True}))
elif data["path"] == "ping":
    greeting = config.get("greeting", "pong")
    print(json.dumps({"status": 200, "body": {"reply": greeting, "you": data["user"]["username"]}}))
else:
    print(json.dumps({"status": 404, "body": {"error": "Unknown path: " + data["path"]}}))
