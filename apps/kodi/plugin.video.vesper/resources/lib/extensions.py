"""Lets other Kodi add-ons extend Vesper without any code.

An add-on opts in by shipping a `vesper-extension.json` next to its `addon.xml`:

    {
      "vesper": 1,
      "name": "My Add-on",
      "resolvers": [
        {"addon": "plugin.video.my", "name": "My Site",
         "rules": [{"param": "video_id", "template": "https://my.site/watch/{}"}]}
      ],
      "menu": [{"label": "My picks", "path": "plugin://plugin.video.my/?action=picks"}]
    }

- `resolvers` teach "Download with Vesper" how to turn that add-on's `plugin://` paths into web
  addresses a server can download. `{}` in a template is replaced by the parameter's value.
- `menu` adds entries to Vesper's home screen, under "More from other add-ons".

The parsing and checking here has no Kodi imports, so it can be tested on its own. `scan` is the
part that looks through Kodi's add-on folders.
"""

import json

SUPPORTED = 1
MAX_RESOLVERS = 20
MAX_RULES = 20
MAX_MENU = 20


class Rejected(Exception):
    """Why an extension file cannot be used."""


def _text(value, field, limit=80):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise Rejected("%s must be a short, non-empty string" % field)
    return value.strip()


def parse(addon_id, text):
    """Checks one `vesper-extension.json` and returns `{"name", "resolvers", "menu"}`.
    Resolvers are `(addon id, name, [(param, template)])`, the shape `plugins.register` takes."""
    try:
        data = json.loads(text)
    except ValueError as e:
        raise Rejected("not valid JSON: %s" % e)
    if not isinstance(data, dict):
        raise Rejected("must be a JSON object")
    if data.get("vesper") != SUPPORTED:
        raise Rejected('"vesper" must be %d (this version of Vesper understands %d)' % (SUPPORTED, SUPPORTED))
    name = _text(data.get("name", addon_id), "name")

    resolvers = []
    for entry in (data.get("resolvers") or [])[:MAX_RESOLVERS]:
        if not isinstance(entry, dict):
            raise Rejected("each resolver must be an object")
        target = _text(entry.get("addon", ""), "resolver addon", 120)
        # An add-on may only describe itself, so it cannot change how another add-on is read.
        if target != addon_id:
            raise Rejected('a resolver may only be for the add-on that ships it ("%s")' % addon_id)
        rules = []
        for rule in (entry.get("rules") or [])[:MAX_RULES]:
            param = _text(rule.get("param", ""), "rule param", 40)
            template = _text(rule.get("template", ""), "rule template", 300)
            if not template.lower().startswith(("http://", "https://")) or template.count("{}") != 1:
                raise Rejected("a template must be a web address with exactly one {}")
            rules.append((param, template))
        resolvers.append((target, _text(entry.get("name", target), "resolver name"), rules))

    menu = []
    for item in (data.get("menu") or [])[:MAX_MENU]:
        label = _text(item.get("label", ""), "menu label")
        path = _text(item.get("path", ""), "menu path", 400)
        if not path.startswith("plugin://"):
            raise Rejected("a menu path must be a plugin:// address")
        menu.append({"label": label, "path": path})
    return {"name": name, "resolvers": resolvers, "menu": menu}


def scan(addon_ids, read):
    """Reads the extension file of each add-on. `read(addon_id)` returns its text or None.
    Returns `(extensions, problems)`; a broken file is reported, never fatal."""
    found, problems = {}, []
    for addon_id in addon_ids:
        text = read(addon_id)
        if text is None:
            continue
        try:
            found[addon_id] = parse(addon_id, text)
        except Rejected as why:
            problems.append((addon_id, str(why)))
    return found, problems
