"""Shared by the menus and the background service: the add-on's settings and a ready client."""

import json
import os

import xbmcaddon
import xbmcvfs

from . import api

# Named explicitly: other add-ons import this code through the public `vesper` module, and a bare
# `Addon()` would then mean *their* settings and folders.
ADDON = xbmcaddon.Addon("plugin.video.vesper")


def setting(key):
    return xbmcaddon.Addon("plugin.video.vesper").getSetting(key)


def set_setting(key, value):
    xbmcaddon.Addon("plugin.video.vesper").setSetting(key, value)


def flag(key, default=True):
    """A yes/no setting. Kodi stores it as the text `true` or `false`; unset means the default."""
    value = setting(key)
    return default if value == "" else value == "true"


def _token_file():
    folder = xbmcvfs.translatePath("special://profile/addon_data/%s/" % ADDON.getAddonInfo("id"))
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "session.json")


def _read_token(server, user):
    """The saved session, but only for the same server and the same account."""
    try:
        with open(_token_file(), encoding="utf-8") as f:
            saved = json.load(f)
        return saved.get("token", "") if saved.get("server") == server and saved.get("user", "") == user else ""
    except (OSError, ValueError):
        return ""


def _write_token(server, user, token):
    path = _token_file()
    try:
        if not token:
            os.remove(path)
            return
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"server": server, "user": user, "token": token}, f)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except OSError:
        pass


def client(ready=True):
    """A client for the saved server, signed in when the server needs it. Raises VesperError."""
    server = api.normalise(setting("server"))
    user = setting("username").strip()
    c = api.Vesper(
        server,
        _read_token(server, user),
        on_token=lambda token: _write_token(server, user, token),
        username=user,
        password=setting("password"),
        verify=flag("verify_tls", True),
    )
    if ready:
        c.ensure_ready()
    return c
