# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: go to the **Security** tab of this repository and choose **Report a vulnerability**. You will get an answer within a few days.

Include what you found, how to reproduce it, and the version you tested (server and Kodi add-on).

## What matters most

The Vesper server is something people may expose to the internet, so these areas get the most scrutiny:

- authentication, sessions, media tokens and invite codes,
- the stream **proxy** and the **recorder**, which fetch addresses on a user's behalf (server-side request forgery),
- access to recordings and sync data between accounts,
- the admin panel and its API,
- the Kodi add-on's handling of credentials and of the playlist addresses it reads from Kodi.

## Supported versions

Only the latest release of the server and the Kodi add-on receives fixes.

## Good to know

- **Lite mode has no authentication by design.** It is for a trusted home network and must not be exposed to the internet. Use full mode behind HTTPS for anything else (see the [server guide](docs/SERVER.md#lite-and-full-mode)).
- Full mode hashes passwords with Argon2id; session tokens are random and stored only as hashes. Failed sign-ins are rate limited.
- Provider logins appear in stream addresses and are stored in the server's database when you record or add playlists. Protect the data folder.
- Full mode refuses private network addresses for the proxy and recorder unless an admin allows them.
- The Kodi add-on keeps the server password in Kodi's add-on settings and a session token in its add-on data folder, both readable by anyone with access to the Kodi profile. Use an account made for Kodi.
- The server speaks plain HTTP; terminate TLS in a reverse proxy. The Kodi add-on verifies HTTPS certificates unless you turn that off in its settings, which you should only do for your own server.
