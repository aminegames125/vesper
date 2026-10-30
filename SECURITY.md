# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: go to the **Security** tab of this repository and choose **Report a vulnerability**. You will get an answer within a few days.

Include what you found, how to reproduce it, and the version you tested.

## What matters most

Vesper Cloud is a server people may expose to the internet, so these areas get the most scrutiny:

- authentication, sessions and invite codes,
- the stream **proxy** and the **recorder**, which fetch addresses on a user's behalf (server-side request forgery),
- access to recordings and sync data between accounts,
- the admin panel and its API.

## Supported versions

Only the latest release receives fixes.

## Good to know

- **Lite mode has no authentication by design.** It is for a trusted network and must not be exposed to the internet.
- Passwords use Argon2id; session tokens are random and stored only as hashes.
- Provider logins appear in stream addresses and are stored in the server's database when you record or sync sources. Protect the data folder.
- Full mode refuses private network addresses for the proxy and recorder unless an admin allows them.
