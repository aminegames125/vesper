export type Group = "record" | "guide" | "watch" | "run";

export const GROUPS: { id: Group | "all"; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "record", label: "Record" },
  { id: "guide", label: "Guide" },
  { id: "watch", label: "Watch" },
  { id: "run", label: "Run it" },
];

export const FEATURES: { id: string; group: Group; title: string; text: string }[] = [
  {
    id: "schedules",
    group: "record",
    title: "Schedules with repeats and padding",
    text: "A channel, a time and a length. Repeat it, and pad the start and end so nothing is clipped.",
  },
  {
    id: "now",
    group: "record",
    title: "Record now",
    text: "Something good just started? Start recording it right away.",
  },
  {
    id: "backup",
    group: "record",
    title: "Backup URL and retry",
    text: "Give a channel a backup URL. If the stream drops, Vesper retries instead of giving up.",
  },
  {
    id: "health",
    group: "record",
    title: "Channel health checks",
    text: "See which channels are working before a recording depends on them.",
  },
  {
    id: "xmltv",
    group: "guide",
    title: "TV guide (XMLTV)",
    text: "Browse the guide and pick a programme instead of typing times.",
  },
  {
    id: "series",
    group: "guide",
    title: "Series rules",
    text: "Make a rule once and every episode gets recorded.",
  },
  {
    id: "long",
    group: "guide",
    title: "Follows the guide",
    text: "When a show runs long, the recording follows the guide and keeps going.",
  },
  {
    id: "downloads",
    group: "guide",
    title: "Movie and series downloads",
    text: "Download movies and series. They are saved on the server, not on your phone.",
  },
  {
    id: "android",
    group: "watch",
    title: "Android app",
    text: "Watch live channels or your recordings, with a picture quality that suits your connection.",
  },
  {
    id: "cast",
    group: "watch",
    title: "Chromecast",
    text: "Cast a channel straight from the phone. The TV gets the link directly.",
  },
  {
    id: "tv",
    group: "watch",
    title: "Android TV home screen",
    text: "A real TV home screen you drive with the D-pad on your remote.",
  },
  {
    id: "bookmarks",
    group: "watch",
    title: "Bookmarks, continue watching, shared links",
    text: "Pick up where you left off, keep what you like, send a link to someone.",
  },
  {
    id: "admin",
    group: "run",
    title: "Admin web panel",
    text: "Users, invites, an audit log and storage, in the browser.",
  },
  {
    id: "private",
    group: "run",
    title: "Yours to host",
    text: "You host it yourself. Your provider logins stay on your machine.",
  },
  {
    id: "lite",
    group: "run",
    title: "Lite mode",
    text: "A lighter mode with cross-site protection.",
  },
  {
    id: "binary",
    group: "run",
    title: "One binary, one database",
    text: "A single Rust binary with SQLite. Windows, Linux, Docker or a NAS.",
  },
];

export const SHOTS = {
  home: {
    src: "shots/home-dark.png",
    alt: "Vesper home screen in the dark theme, with demo channels",
  },
  guide: { src: "shots/guide.png", alt: "Vesper TV guide grid with demo programmes" },
  live: { src: "shots/live.png", alt: "Vesper live TV view with demo channels" },
  movies: { src: "shots/movies.png", alt: "Vesper movies library with demo titles" },
  admin: { src: "shots/admin-overview.png", alt: "Vesper admin panel overview" },
} as const;

export const LINKS = {
  readme: "https://github.com/aminegames125/vesper#readme",
  releases: "https://github.com/aminegames125/vesper/releases",
  docs: "https://github.com/aminegames125/vesper/tree/main/docs",
  repo: "https://github.com/aminegames125/vesper",
};
