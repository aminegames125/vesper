export interface Release {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

export const CURRENT_VERSION = "0.1.0";

export const RELEASES: Release[] = [
  {
    version: "0.1.0",
    date: "2026-10-30",
    title: "Vesper begins",
    notes: [
      "New name and a redesigned app: Home, Live, Guide timeline, Favourites.",
      "Xtream Codes and M3U sources, side by side.",
      "Live TV, programme guide, catch-up, movies and series.",
      "Recording from live TV, catch-up and the guide, built in (no ffmpeg needed).",
      "Built on Tauri instead of Electron, so it installs small and starts fast.",
    ],
  },
];

export const TIPS = [
  "Add an Xtream login or an M3U link under Sources to get started.",
  "Press F in the player for fullscreen and M to mute.",
  "Heart a channel to find it again under Favourites.",
  "Catch-up lists channels whose provider keeps past programmes.",
  "Press the record button in the player, or schedule a programme from the Guide.",
];
