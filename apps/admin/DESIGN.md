# Design: Vesper web app

A broadcast graphics package for a home TV recorder, built for a living-room TV browser first (see PRODUCT.md). Colours come only from the logo (`brand/vesper-mark.svg`, `brand/design-kit.svg`).

## Colour
- Ground `#0D0D0F` (the mark's own ground), plates `#151518`, raised `#1E1E22`, lines `#2A2A30`.
- Cream `#F4F1EA` is the text colour and the second voice (scheduled, "not live"). Muted text is the brand grey `#9A9AA3`.
- Coral `#FF5C7A` is the on-air colour: primary action, live, focus plate, progress. Text on coral is `#1A0A0F`.
- Functional only: mint (ok) and amber (warning). Light theme exists for laptops (`#FBF9F8` ground, coral `#D81B60`).
- State is colour plus shape: recording = coral dot, scheduled = cream, clash = amber, failed = struck/red text.

## Type
- Headings and channel names: Bricolage Grotesque run condensed (`font-stretch: 78%`, weight 700, class `display`).
- Text: Atkinson Hyperlegible Next (built for legibility at distance). Tabular numerals for every time, duration and size; running times sit right-aligned.
- One rem for the whole app, `clamp(16px, 11px + 0.5vw, 26px)`, so a TV across the room reads like a laptop. Scale: 0.85 / 0.95 / 1.05 / 1.25 / 1.5 / 2 / 3 rem.

## Shape and depth
- One container: the plate (`.surface`), separated from the ground by tone alone; hairline in the light theme only. No glass, no gradient text, no stacked cards.
- Radius 12px on plates, 8px on controls. Targets are at least 48px tall.

## Signature: the lower-third
- `.plate` fills with coral from the left on hover/focus (a channel graphic wiping in) and its text flips to the on-accent ink. Wherever the remote is, exactly one plate is lit; focus also draws a 4px coral frame.
- The player's info plate (coral bar, title, LIVE) and Home's now-playing plate use the same wipe.
- Arrow keys move focus spatially (`spatial.ts`); Backspace goes back.

## Motion
- 120-220ms for state; the wipe is 220ms (480ms for the two big plates). Exponential ease-out. Respects `prefers-reduced-motion`.

## Components
- `ui.tsx`: Button, IconButton, Field, Select, Toggle, Segmented, Modal, Badge, Progress, Skeleton. `kit.tsx`: Stat (an un-boxed fact), EmptyState, ActionMenu, Confirm, toasts.
- Player: video.js skinned in `watch/player.css`, HLS through hls.js only.
