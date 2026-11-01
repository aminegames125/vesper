# Extending Vesper

Vesper has two places to build on, and they match its two halves: the **server** takes plugins, and
the **Kodi add-on** takes extensions. Working examples are in [`examples/`](../examples).

## Server plugins

A plugin is a folder in `<data dir>/plugins/<id>/` with a `plugin.json` and anything it needs to run,
in any language. The admin panel's **Plugins** page lists them, switches them on and off, edits their
configuration and has a test button. Plugins start **off**. A plugin is code you chose to run, with the
server's own permissions, so only enable ones you trust.

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "description": "What it does.",
  "author": "You",
  "hooks": ["item.finished"],
  "command": ["python3", "./run.py"],
  "timeout": 15
}
```

- `id`: lowercase letters, digits, `.`, `-`, `_`. It must match the folder name.
- `command`: the program and its arguments, run from the plugin's folder. A file in the folder wins
  over something of the same name on the `PATH`. It may not point outside the folder.
- `timeout`: seconds a single run may take. Default 15, at most 120. Output is capped at 1 MiB, and
  at most four plugin processes run at once.

### How a plugin is run

For each hook the server starts `command`, writes **one JSON object to standard input**, and reads
what the plugin prints on standard output:

```json
{ "hook": "resolve", "data": { "url": "https://…" }, "config": { "whatever": "the admin set" } }
```

`config` is the JSON the admin saved for the plugin. These environment variables are set:
`VESPER_PLUGIN_ID`, `VESPER_DATA_DIR` and `VESPER_API` (the server's own address, for plugins that
call the REST API with a token they were given in their configuration). A non-zero exit, a timeout or
unreadable output is written to the Activity log as `plugin.error` and otherwise ignored.

### Hooks

| Hook | When | `data` | What to print |
| --- | --- | --- | --- |
| `download.created` | A download was accepted | `{id, title, url, engine, encoder, user}` | nothing (ignored) |
| `item.finished` | A recording or download ended | `{id, title, status, seconds, bytes, error}` | nothing (ignored) |
| `resolve` | Before a download starts | `{url}` | `{"url": "https://…", "title"?, "engine"?: "direct"\|"ytdlp"}` to take over the address, or nothing to pass |
| `http` | A request to `/api/v1/x/<id>/<path>` | `{method, path, query, body, user: {id, username, role}}` | `{"status": 200, "body": …}`, or any JSON for a plain 200 |

- **`resolve`** is how a plugin teaches the server a new site. Plugins are asked in order; the first
  to answer wins. The new address is checked like any other (no private network addresses unless the
  admin allowed them).
- **`http`** lets a plugin add API endpoints. Callers must be signed in; the user is passed in. The
  body, if any, must be JSON and at most 1 MiB.
- Every plugin is also run once with the hook `test` when the admin presses **Test run**. Exit 0 to
  pass.

### Admin API

`GET /api/v1/admin/plugins`, `PUT /api/v1/admin/plugins/<id>` (`{"enabled"?, "config"?}`) and
`POST /api/v1/admin/plugins/<id>/test`. `GET /api/v1/capabilities` lists the enabled plugins.

## Kodi extensions

### 1. Without code: `vesper-extension.json`

Ship this file next to your add-on's `addon.xml`. Vesper finds it by itself.

```json
{
  "vesper": 1,
  "name": "My add-on",
  "resolvers": [
    { "addon": "plugin.video.my", "name": "My Site",
      "rules": [{ "param": "video_id", "template": "https://my.site/watch/{}" }] }
  ],
  "menu": [{ "label": "My picks", "path": "plugin://plugin.video.my/?action=picks" }]
}
```

- **`resolvers`** teach **Download with Vesper** how to turn your add-on's `plugin://` paths into
  web addresses the server (or yt-dlp) can download. The first rule whose `param` is in the path
  wins; `{}` becomes its value. An add-on can only describe **itself**, and built-in rules for known
  add-ons cannot be overridden.
- **`menu`** puts entries on Vesper's home screen.
- Broken files are ignored and written to Kodi's log.

Add-ons Vesper already understands (YouTube, Twitch, Vimeo, Dailymotion and more) are listed under
**Add-ons Vesper can save from**. Any other `plugin://` path is tried with the common address
parameters (`url`, `video_url`, `page_url`, …).

### 2. With Python: the `vesper` module

```xml
<requires>
  <import addon="plugin.video.vesper" version="0.28.0"/>
</requires>
```

```python
import vesper
vesper.download("A video", "https://example.org/watch/1", encoder="h264", quality="1080")
vesper.download_path("Clip", "plugin://plugin.video.youtube/play/?video_id=abc")
```

`vesper.API_VERSION` is `1`. The module has `configured()`, `client()`, `capabilities()`,
`resolve(path)`, `download(...)`, `download_path(...)`, `record(...)`, `register_resolver(...)`,
`favorites()`, `add_favorite(...)`, `sync()` and `announce(...)`. Calls that talk to the server raise
`vesper.VesperError` with a message you can show; `resolve` raises `vesper.Unsupported`. Read the
docstrings in `resources/lib/public/vesper/__init__.py`.

### 3. Without Python: `RunPlugin`

Skins and scripts can start a download from any Kodi path:

```
RunPlugin(plugin://plugin.video.vesper/?action=api_download&path=<kodi path>&title=<title>)
```

### 4. Listening: events

Vesper announces what happens with `JSONRPC.NotifyAll` (sender `plugin.video.vesper`). In Python,
override `xbmc.Monitor.onNotification`; the method is `Other.<event>`:

| Event | Data |
| --- | --- |
| `item_started`, `item_finished`, `item_failed` | `{id, title, kind, status, error}` |
| `download_started` | `{title, url, live}` |

### Stability

`vesper-extension.json` has `"vesper": 1` and the Python module has `API_VERSION = 1`. A change that
could break an existing extension raises the number, and Vesper rejects files for a version it does
not understand instead of guessing.
