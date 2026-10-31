import { CloudClient } from "@vesper/cloud-client";
import { useEffect, useMemo } from "react";
import { isDesktop } from "./fetch-text";
import { useStore } from "./store";

/** Inside the desktop shell, requests use the native HTTP client so plain-http LAN servers just work. */
const nativeFetch: typeof fetch = async (input, init) => {
  if (isDesktop()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input as string, init);
  }
  return fetch(input, init);
};

export const makeClient = (url: string, token: string | null) =>
  new CloudClient({
    baseUrl: url,
    token,
    fetch: nativeFetch,
    // An expired or revoked session: forget it so the app asks to sign in again.
    onUnauthorized: () => {
      const { cloud, setCloud, notify } = useStore.getState();
      if (cloud.token !== token) return;
      setCloud({ token: null, user: null });
      notify("Your session ended. Sign in again to keep syncing.");
    },
  });

/** The signed-in cloud client, or null when no server is connected. */
export function useCloud(): CloudClient | null {
  const url = useStore((s) => s.cloud.url);
  const token = useStore((s) => s.cloud.token);
  const mode = useStore((s) => s.cloud.info?.mode);
  return useMemo(
    () => (url && (mode === "lite" || token) ? makeClient(url, token) : null),
    [url, token, mode],
  );
}

type SyncKey = "favorites" | "history" | "sources";

/** Stamps belong to one server and account, so switching either starts from a clean slate. */
const stampKey = (key: SyncKey) => {
  const { cloud } = useStore.getState();
  return `vesper.sync.${cloud.url}|${cloud.user?.id ?? "lite"}.${key}`;
};
const readStamp = (key: SyncKey) => {
  try {
    return Number(localStorage.getItem(stampKey(key))) || 0;
  } catch {
    return 0;
  }
};
const writeStamp = (key: SyncKey, at: number) => {
  try {
    localStorage.setItem(stampKey(key), String(at));
  } catch {
    /* sync still works, it may just re-pull once */
  }
};

/** Keeps favourites, watch history and sources identical on every device that uses the same account. */
export function useCloudSync() {
  const client = useCloud();
  const options = useStore((s) => s.syncOptions);

  useEffect(() => {
    if (!client) return;
    const keys = (["favorites", "history", "sources"] as const).filter((k) => options[k]);
    if (keys.length === 0) return;

    const local = (key: SyncKey): unknown => {
      const s = useStore.getState();
      return key === "favorites" ? s.favorites : key === "history" ? s.history : s.providers;
    };
    // The last value known to match the server, so applying a pull is never echoed back as a push.
    const synced = new Map<SyncKey, string>();
    // Keys whose first pull succeeded; until then a push could overwrite the server with an empty copy.
    const pulled = new Set<SyncKey>();
    const timers = new Map<SyncKey, ReturnType<typeof setTimeout>>();
    let alive = true;

    const pull = async () => {
      for (const key of keys) {
        try {
          const remote = await client.getSync<unknown>(key);
          if (!alive) return;
          pulled.add(key);
          if (remote.value !== null && remote.updatedAt > readStamp(key)) {
            synced.set(key, JSON.stringify(remote.value));
            useStore.getState().applyRemote(key, remote.value);
            writeStamp(key, remote.updatedAt);
          } else if (!synced.has(key)) {
            synced.set(key, JSON.stringify(local(key)));
            // First connection with nothing on the server yet: upload what this device has.
            if (remote.value === null) await push(key);
          }
        } catch {
          /* offline or signed out: try again on the next tick */
        }
      }
    };

    const push = async (key: SyncKey) => {
      const value = local(key);
      const json = JSON.stringify(value);
      if (synced.get(key) === json) return;
      try {
        const { updatedAt } = await client.putSync(key, value);
        synced.set(key, json);
        writeStamp(key, updatedAt);
      } catch {
        /* retried on the next change */
      }
    };

    const unsubscribe = useStore.subscribe(() => {
      for (const key of keys) {
        if (!pulled.has(key)) continue;
        if (synced.has(key) && synced.get(key) === JSON.stringify(local(key))) continue;
        clearTimeout(timers.get(key));
        timers.set(
          key,
          setTimeout(() => void push(key), 3000),
        );
      }
    });

    void pull();
    const interval = setInterval(() => void pull(), 60_000);
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(interval);
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [client, options]);
}

/** True on Android TV and when TV mode is switched on, so the interface uses remote-friendly focus. */
export const isTvMode = (() => {
  let cached: boolean | undefined;
  return () => {
    if (cached !== undefined) return cached;
    let forced: string | null = null;
    try {
      forced = localStorage.getItem("vesper.tv");
    } catch {
      /* ignore */
    }
    const ua = navigator.userAgent;
    cached =
      forced === "1"
        ? true
        : forced === "0"
          ? false
          : location.search.includes("tv=1") ||
            // The Android build tags its WebView when the system says it is a television.
            ua.includes("VesperTV") ||
            /Android.*(TV|AFT|BRAVIA|Chromecast|SHIELD)|\bTV\b/i.test(ua) ||
            // A big Android screen with no touch hardware is a TV box in practice.
            (/Android/i.test(ua) && navigator.maxTouchPoints === 0 && screen.width >= 960);
    return cached;
  };
})();
