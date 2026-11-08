---
version: 1
slug: "src-app-tsx"
primary_target: "src/app.tsx"
related_targets: []
---

# Surface brief: Vesper web app (Operate)

Scope: the whole web app (shell, Live TV, guide, schedules, library, activity, dashboard, player). Visitor mode: Operate. Audience: a household on a living-room TV browser first, phones and laptops second; one admin, many viewers. Tasks: watch, record, schedule, resume, check health.

## Direction contract

THESIS: A TV channel graphics package for a home recorder. The one idea: a single "lower-third" plate (accent bar plus title and meta) is the focus state of every row and card and the info bar of the player, so the remote's position is never ambiguous. Refuses the grey-card dashboard, the hero-metric tile row and the stock web player.
OWN-WORLD: The logo's own near-black ground (#0D0D0F), warm cream (#F4F1EA) for text and the second voice, flat plates that step tonally (no borders under shadows, no glass, no gradient text). Coral #FF5C7A is the on-air colour: primary action, live, focus plate. Cream is the second voice: scheduled. Four fixed signals carry state by colour and shape: recording (coral dot), scheduled (cream ring), clash (amber triangle), failed (struck line). Bricolage Grotesque condensed for headings and channel names, Atkinson Hyperlegible Next for text, tabular numerals, running times right-aligned. Ten-foot scale: 20px base, 24px+ for row titles, 56px targets.
STORY: Someone on the sofa finds what is on, presses OK to watch or record, and always sees where focus is.
FIRST VIEWPORT: Left rail with large labels and a clock, a corner channel bug. Main area: a now-playing lower-third plate across the top (resume, or live), then Live now, Coming up as a timetable with right-aligned times, then Recent plates at a fixed 16:9 ratio. Primary action at the left of the plate.
FORM: Assigned direction, candidate 3 of the grounded list; seed:d74268ea94f7b601. Raises: whole-cell focus movement (grid-snapped spatial navigation), fixed-ratio plates, right-aligned running times.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
