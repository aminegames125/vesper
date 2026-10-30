import { type RefObject, useEffect, useState } from "react";
import { useAuth } from "./playable";
import type { Channel, Programme } from "./types";
import { getShortGuide } from "./xtream";

const TTL_MS = 5 * 60_000;
const MAX_PARALLEL = 4;

const cache = new Map<string, { at: number; list: Programme[] }>();
const inflight = new Map<string, Promise<Programme[]>>();
const waiting: (() => void)[] = [];
let running = 0;

/** Runs guide requests a few at a time so a long channel list never floods the provider. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      running++;
      task()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) start();
    else waiting.push(start);
  });
}

/** Returns the channel's upcoming programmes: null while loading, [] when there is no guide. Only fetches when `enabled`. */
export function useGuide(channel: Channel, enabled: boolean, limit = 6): Programme[] | null {
  const auth = useAuth(channel.providerId);
  const key = `${channel.id}:${limit}`;
  const [list, setList] = useState<Programme[] | null>(() => cache.get(key)?.list ?? null);

  useEffect(() => {
    if (!enabled || !auth || channel.streamId === undefined) {
      if (!auth || channel.streamId === undefined) setList([]);
      return;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setList(hit.list);
      return;
    }
    let cancelled = false;
    let request = inflight.get(key);
    if (!request) {
      const streamId = channel.streamId;
      request = throttled(() => getShortGuide(auth, streamId, limit))
        .then((result) => {
          cache.set(key, { at: Date.now(), list: result });
          return result;
        })
        .catch(() => [] as Programme[])
        .finally(() => inflight.delete(key));
      inflight.set(key, request);
    }
    request.then((result) => !cancelled && setList(result));
    return () => {
      cancelled = true;
    };
  }, [auth, channel.streamId, enabled, key, limit]);

  return list;
}

/** True once the element has scrolled into view, and stays true afterwards. */
export function useSeen(ref: RefObject<Element | null>, margin = "200px"): boolean {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen, margin]);

  return seen;
}
