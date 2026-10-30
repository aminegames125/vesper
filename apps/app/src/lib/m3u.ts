import type { Channel } from "./types";

const ATTR = /([\w-]+)="([^"]*)"/g;
const DEFAULT_GROUP = "Ungrouped";

/** Parses an extended M3U playlist into channels. Tolerates CRLF, BOMs and missing attributes. */
export function parseM3U(text: string, providerId = ""): Channel[] {
  const channels: Channel[] = [];
  let pending: Omit<Channel, "url" | "id"> | null = null;

  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",", line.lastIndexOf('"') + 1);
      const attrs: Record<string, string> = {};
      for (const [, key, value] of line.matchAll(ATTR)) {
        if (key) attrs[key.toLowerCase()] = value ?? "";
      }
      const title = comma === -1 ? "" : line.slice(comma + 1).trim();
      pending = {
        providerId,
        name: title || attrs["tvg-name"] || "Untitled",
        group: attrs["group-title"]?.trim() || DEFAULT_GROUP,
        logo: attrs["tvg-logo"] || undefined,
        tvgId: attrs["tvg-id"] || undefined,
      };
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pending) {
      channels.push({
        ...pending,
        url: line,
        id: `${providerId}:${channels.length}:${hash(line)}`,
      });
      pending = null;
    }
  }
  return channels;
}

/** Groups items by their `group`, largest group first. */
export function groupBy<T extends { group: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.group);
    if (list) list.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

function hash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
