import type { Programme } from "./types";

/** Xtream servers base64-encode guide text; anything that is not valid base64 is returned as is. */
export function decodeEpgText(text: string | undefined): string {
  if (!text) return "";
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

interface RawProgramme {
  id?: string | number;
  title?: string;
  description?: string;
  start?: string;
  start_timestamp?: string | number;
  end_timestamp?: string | number;
  stop_timestamp?: string | number;
  has_archive?: string | number;
}

export function toProgramme(raw: RawProgramme): Programme {
  const start = Number(raw.start_timestamp);
  const end = Number(raw.stop_timestamp ?? raw.end_timestamp);
  return {
    id: `${raw.id ?? start}`,
    title: decodeEpgText(raw.title),
    description: decodeEpgText(raw.description),
    start,
    end,
    startRaw: raw.start ?? "",
    hasArchive: Number(raw.has_archive) === 1,
  };
}

export interface NowNext {
  now?: Programme;
  next?: Programme;
  /** 0..1 progress through the current programme. */
  progress: number;
}

export function nowNext(list: Programme[], at = Date.now() / 1000): NowNext {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const now = sorted.find((p) => p.start <= at && at < p.end);
  const next = sorted.find((p) => p.start > at);
  const progress = now ? (at - now.start) / Math.max(1, now.end - now.start) : 0;
  return { now, next, progress };
}

export const formatClock = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const formatDay = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
