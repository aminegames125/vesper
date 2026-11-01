import type { SVGProps } from "react";

/** A small line-icon set, drawn on a 24px grid so every glyph shares one stroke weight. */
const PATHS = {
  overview: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 20a8 8 0 0 1 16 0",
  invite: "M4 7h16v10H4V7Zm0 0 8 6 8-6",
  film: "M4 5h16v14H4V5Zm4 0v14m8-14v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  sync: "M20 8a8 8 0 0 0-14-2L4 8m0-4v4h4M4 16a8 8 0 0 0 14 2l2-2m0 4v-4h-4",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.5-2.3 1a7.6 7.6 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.3-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.5 2.3-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z",
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z",
  library: "M5 4v16M10 4v16m4-14 5 1.5-4 13.5-5-1.5",
  calendar: "M5 6h14v14H5V6Zm0 5h14M9 4v4m6-4v4",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  pause: "M8 5v14M16 5v14",
  back10: "M11 5 7 9l4 4M7 9h6a6 6 0 1 1-6 6",
  fwd10: "M13 5l4 4-4 4M17 9h-6a6 6 0 1 0 6 6",
  volume: "M4 10v4h4l5 4V6L8 10H4Zm13-1a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12",
  mute: "M4 10v4h4l5 4V6L8 10H4Zm12 0 5 5m0-5-5 5",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5",
  exitFull: "M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5",
  pip: "M3 5h18v14H3V5Zm9 6h7v5h-7v-5Z",
  bookmark: "M7 4h10v16l-5-4-5 4V4Z",
  close: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  signout: "M10 4H5v16h5m4-12 4 4-4 4m4-4H9",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 5 5 9-10",
  copy: "M9 9h10v11H9V9Zm-4 6V4h10",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
  chip: "M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m12 0h3M3 15h3m12 0h3M7 6h10v12H7V6Zm3 3h4v6h-4V9Z",
  rec: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-4a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  speed: "M4 18a8 8 0 1 1 16 0M12 18l4-6",
  trash: "M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13",
  live: "M5.6 18.4a9 9 0 0 1 0-12.8m12.8 0a9 9 0 0 1 0 12.8M9 15a4 4 0 0 1 0-6m6 0a4 4 0 0 1 0 6M12 12h.01",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
