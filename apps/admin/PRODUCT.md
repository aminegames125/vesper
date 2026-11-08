# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Households that run their own IPTV setup. One person (the admin) installs the Vesper server on a machine that stays on and manages playlists, schedules and disk space. Everyone else in the home watches. The web app is used mostly on a **living-room TV browser** (remote or gamepad, viewed from across the room), and also on phones and laptops. Confirmed by the owner.

## Product Purpose
Vesper is a self-hosted recording server for IPTV with a Kodi add-on and a web app. The web app lets anyone watch live channels, browse the TV guide, record now or later, schedule repeating recordings, and play back recordings, with no Kodi needed. Admins also manage users, playlists, downloads, plugins and settings. Success: a person sits down, finds what is on, and watches or records it in a few presses.

## Positioning
Your own TV recorder: records on a box you own, plays back anywhere in the house, and does not bring channels of its own.

## Operating Context
Lite mode (no accounts, home network) and full mode (accounts: admin, user, guest). Recordings are HLS. Watching live works through a hidden self-deleting capture. Streams the browser must play are HLS only (hls.js with video.js).

## Capabilities and Constraints
- Web parity with the Kodi add-on: live TV, guide, record once or repeating (daily, weekly, every episode), schedules and series rules, recordings with folders, resume and watched, status, movies and shows saved to the server.
- Only HLS playback, through hls.js inside video.js.
- Must work with remote-style keyboard focus (arrows, Enter, Back) as well as touch and mouse.

## Brand Commitments
Keep: the name Vesper, the four-scanline V logo mark (top bar in the accent colour), coral accent with violet secondary, Bricolage Grotesque for headings and Geist for text. The owner wants them used with intent, not replaced.

## Evidence on Hand
Logo and brand assets in `brand/`. No testimonials or user counts exist; never invent any.

## Product Principles
1. Ten-foot first: if it is not comfortable from the sofa it is not done.
2. The next action is always one press away: watch, record, resume.
3. Show what matters on this screen, not everything the server knows.
4. Motion explains change (a recording started, a channel tuned); it never decorates.

## Accessibility & Inclusion
Large readable type and strong contrast, visible focus on every control, full keyboard operation, respects reduced motion.
