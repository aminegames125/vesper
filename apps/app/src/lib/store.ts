import type { CloudUser, ServerInfo } from "@vesper/cloud-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadLibrary } from "./library";
import type { ThemeMode } from "./themes";
import type { Channel, Movie, Playable, Provider, Recording, Scheduled, Show } from "./types";
import { CURRENT_VERSION } from "./whats-new";

export type View =
  | "home"
  | "live"
  | "guide"
  | "movies"
  | "series"
  | "catchup"
  | "favorites"
  | "recordings"
  | "search"
  | "sources"
  | "settings";

export interface HistoryEntry {
  item: Playable;
  position: number;
  duration: number;
  at: number;
}

/** Connection to a Vesper Cloud server. */
export interface CloudState {
  url: string;
  token: string | null;
  user: CloudUser | null;
  info: ServerInfo | null;
}

export interface SyncOptions {
  favorites: boolean;
  history: boolean;
  sources: boolean;
}

interface State {
  // persisted
  cloud: CloudState;
  syncOptions: SyncOptions;
  providers: Provider[];
  favorites: string[];
  recents: string[];
  /** Watched movies and episodes, newest first, with where the viewer stopped. */
  history: HistoryEntry[];
  recordings: Recording[];
  scheduled: Scheduled[];
  theme: ThemeMode;
  seenVersion: string | null;
  tipsDismissed: boolean;
  onboarded: boolean;
  recordMinutes: number;
  /** Home rows the viewer switched off in Settings. */
  hiddenRows: string[];

  // session
  channels: Channel[];
  movies: Movie[];
  shows: Show[];
  status: "idle" | "loading";
  errors: string[];
  view: View;
  query: string;
  group: string;
  playing: Playable | null;
  /** Channels the player can zap through with up/down. */
  zap: Channel[];
  detail: { kind: "movie" | "show"; id: string } | null;
  toast: string | null;

  setView: (view: View) => void;
  setQuery: (query: string) => void;
  setGroup: (group: string) => void;
  play: (item: Playable | null, zap?: Channel[]) => void;
  saveProgress: (item: Playable, position: number, duration: number) => void;
  openDetail: (kind: "movie" | "show", id: string) => void;
  closeDetail: () => void;
  toggleFavorite: (id: string) => void;
  addProvider: (provider: Provider) => Promise<void>;
  removeProvider: (id: string) => void;
  refresh: () => Promise<void>;
  setCloud: (patch: Partial<CloudState>) => void;
  disconnectCloud: () => void;
  setSyncOptions: (patch: Partial<SyncOptions>) => void;
  applyRemote: (key: "favorites" | "history" | "sources", value: unknown) => void;
  setTheme: (theme: ThemeMode) => void;
  setRecordMinutes: (minutes: number) => void;
  toggleRow: (id: string) => void;
  markVersionSeen: () => void;
  dismissTips: () => void;
  finishOnboarding: () => void;
  addRecording: (recording: Recording) => void;
  updateRecording: (id: string, patch: Partial<Recording>) => void;
  removeRecording: (id: string) => void;
  addScheduled: (entry: Scheduled) => void;
  removeScheduled: (id: string) => void;
  notify: (message: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      cloud: { url: "", token: null, user: null, info: null },
      syncOptions: { favorites: true, history: true, sources: false },
      providers: [],
      favorites: [],
      recents: [],
      history: [],
      recordings: [],
      scheduled: [],
      theme: "dark",
      seenVersion: null,
      tipsDismissed: false,
      onboarded: false,
      recordMinutes: 60,
      hiddenRows: [],

      channels: [],
      movies: [],
      shows: [],
      status: "idle",
      errors: [],
      view: "home",
      query: "",
      group: "",
      playing: null,
      zap: [],
      detail: null,
      toast: null,

      setView: (view) => set({ view, query: "", group: "", detail: null }),
      setQuery: (query) => set({ query }),
      setGroup: (group) => set({ group }),
      play: (item, zap) =>
        set(({ recents, zap: current }) => ({
          playing: item,
          zap: item ? (zap ?? (item.channel ? current : [])) : current,
          ...(item?.channel
            ? {
                recents: [
                  item.channel.id,
                  ...recents.filter((id) => id !== item.channel?.id),
                ].slice(0, 20),
              }
            : {}),
        })),
      saveProgress: (item, position, duration) =>
        set(({ history }) => {
          if (item.live || duration <= 0) return {};
          // Finished titles drop out of Continue Watching.
          const finished = position / duration > 0.95;
          const rest = history.filter((h) => h.item.id !== item.id);
          return {
            history: finished
              ? rest
              : [{ item, position, duration, at: Date.now() }, ...rest].slice(0, 40),
          };
        }),
      openDetail: (kind, id) => set({ detail: { kind, id } }),
      closeDetail: () => set({ detail: null }),
      toggleFavorite: (id) =>
        set(({ favorites }) => ({
          favorites: favorites.includes(id)
            ? favorites.filter((f) => f !== id)
            : [...favorites, id],
        })),

      addProvider: async (provider) => {
        set(({ providers }) => ({ providers: [...providers, provider] }));
        await get().refresh();
      },
      removeProvider: (id) => {
        set(({ providers }) => ({ providers: providers.filter((p) => p.id !== id) }));
        void get().refresh();
      },

      refresh: async () => {
        const { providers } = get();
        if (providers.length === 0) {
          set({ channels: [], movies: [], shows: [], status: "idle", errors: [] });
          return;
        }
        set({ status: "loading", errors: [] });
        const library = await loadLibrary(providers);
        set({ ...library, status: "idle" });
      },

      setCloud: (patch) => set(({ cloud }) => ({ cloud: { ...cloud, ...patch } })),
      disconnectCloud: () => set({ cloud: { url: "", token: null, user: null, info: null } }),
      setSyncOptions: (patch) =>
        set(({ syncOptions }) => ({ syncOptions: { ...syncOptions, ...patch } })),
      applyRemote: (key, value) => {
        if (key === "favorites" && Array.isArray(value)) set({ favorites: value as string[] });
        else if (key === "history" && Array.isArray(value))
          set({ history: value as HistoryEntry[] });
        else if (key === "sources" && Array.isArray(value)) {
          set({ providers: value as Provider[] });
          void get().refresh();
        }
      },
      setTheme: (theme) => set({ theme }),
      setRecordMinutes: (recordMinutes) => set({ recordMinutes }),
      toggleRow: (id) =>
        set((s) => ({
          hiddenRows: s.hiddenRows.includes(id)
            ? s.hiddenRows.filter((r) => r !== id)
            : [...s.hiddenRows, id],
        })),
      markVersionSeen: () => set({ seenVersion: CURRENT_VERSION }),
      dismissTips: () => set({ tipsDismissed: true }),
      finishOnboarding: () => set({ onboarded: true }),

      addRecording: (recording) =>
        set(({ recordings }) => ({ recordings: [recording, ...recordings] })),
      updateRecording: (id, patch) =>
        set(({ recordings }) => ({
          recordings: recordings.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      removeRecording: (id) =>
        set(({ recordings }) => ({ recordings: recordings.filter((r) => r.id !== id) })),
      addScheduled: (entry) =>
        set(({ scheduled }) => ({
          scheduled: [...scheduled.filter((s) => s.id !== entry.id), entry].sort(
            (a, b) => a.start - b.start,
          ),
        })),
      removeScheduled: (id) =>
        set(({ scheduled }) => ({ scheduled: scheduled.filter((s) => s.id !== id) })),

      notify: (message) => {
        clearTimeout(toastTimer);
        set({ toast: message });
        toastTimer = setTimeout(() => set({ toast: null }), 3500);
      },
    }),
    {
      name: "vesper",
      version: 5,
      // Earlier versions stored a different shape; start clean rather than guess.
      migrate: (persisted, version) => (version >= 4 ? (persisted as never) : ({} as never)),
      partialize: ({
        cloud,
        syncOptions,
        providers,
        favorites,
        recents,
        history,
        recordings,
        scheduled,
        theme,
        seenVersion,
        tipsDismissed,
        onboarded,
        recordMinutes,
        hiddenRows,
      }) => ({
        cloud,
        syncOptions,
        providers,
        favorites,
        recents,
        history,
        recordings,
        scheduled,
        theme,
        seenVersion,
        tipsDismissed,
        onboarded,
        recordMinutes,
        hiddenRows,
      }),
    },
  ),
);
