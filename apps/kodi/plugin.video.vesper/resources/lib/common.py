"""Shared by the menus and the background service: the add-on's settings and a ready client."""

import json
import os

import xbmcaddon
import xbmcvfs

from . import api

ADDON = xbmcaddon.Addon()


def setting(key):
    return xbmcaddon.Addon().getSetting(key)


def set_setting(key, value):
    xbmcaddon.Addon().setSetting(key, value)


def _token_file():
    folder = xbmcvfs.translatePath("special://profile/addon_data/%s/" % ADDON.getAddonInfo("id"))
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "session.json")


def _read_token(server):
    try:
        with open(_token_file(), encoding="utf-8") as f:
            saved = json.load(f)
        return saved.get("token", "") if saved.get("server") == server else ""
    except (OSError, ValueError):
        return ""


def _write_token(server, token):
    try:
        with open(_token_file(), "w", encoding="utf-8") as f:
            json.dump({"server": server, "token": token}, f)
    except OSError:
        pass


def client():
    """A client for the saved server, signed in when the server needs it. Raises VesperError."""
    server = api.normalise(setting("server"))
    c = api.Vesper(server, _read_token(server), on_token=lambda token: _write_token(server, token))
    c.ensure_ready(setting("username"), setting("password"))
    return c
