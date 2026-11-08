import { type Channel, type CloudClient, EVERY_DAY, type Programme } from "@vesper/cloud-client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Same padding the Kodi add-on uses: a minute early, three minutes late. */
export const PAD_BEFORE = 60;
export const PAD_AFTER = 180;
/** How long to wait for the first picture before giving up on a channel. */
const TUNE_TIMEOUT = 45_000;

export type RecordMode = "once" | "daily" | "weekly" | "series";

export const FAVORITES_KEY = "live:favorites";

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const two = (n: number) => String(n).padStart(2, "0");

export const clock = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const dayLabel = (epoch: number) => {
  const d = new Date(epoch * 1000);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
};

export const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");

/**
 * Records a programme the way Kodi's "Record with Vesper" does and returns a sentence to show.
 * `epgId` is the guide's id for the channel (the guide call resolves it).
 */
export async function recordProgramme(
  client: CloudClient,
  channel: Channel,
  programme: Programme,
  mode: RecordMode,
  epgId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const { title, startAt, stopAt } = programme;
  if (stopAt <= now) throw new Error("That programme is over.");
  const airing = startAt <= now;
  const alt = channel.alt?.[0];
  const begin = airing ? now : Math.max(startAt - PAD_BEFORE, now);

  const once = () =>
    client.createRecording({
      title,
      channel_name: channel.name,
      url: channel.url,
      backup_url: alt,
      seconds: stopAt + PAD_AFTER - begin,
      start_at: airing ? undefined : begin,
    });

  if (mode === "once") {
    await once();
    return airing ? `Recording ${title} until it ends.` : `Will record ${title}.`;
  }
  if (mode === "series") {
    if (!epgId) throw new Error("This channel has no guide id, so episodes cannot be matched.");
    await client.createSeriesRule({
      title,
      epg_channel_id: epgId,
      channel_name: channel.name,
      url: channel.url,
      backup_url: alt,
      pad_before: PAD_BEFORE,
      pad_after: PAD_AFTER,
    });
    return `Every episode of "${title}" will be recorded.`;
  }
  const d = new Date(startAt * 1000);
  const result = await client.createSchedule({
    title,
    channel_name: channel.name,
    url: channel.url,
    backup_url: alt,
    tz: timezone(),
    start_time: `${two(d.getHours())}:${two(d.getMinutes())}`,
    start_date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
    seconds: stopAt - startAt,
    days: mode === "daily" ? EVERY_DAY : 1 << ((d.getDay() + 6) % 7),
    pad_before: PAD_BEFORE,
    pad_after: PAD_AFTER,
    follow_guide: Boolean(epgId),
    epg_id: epgId,
  });
  // The one on air right now would otherwise wait for the next repeat.
  if (airing) await once();
  const note = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
  return `${mode === "daily" ? "Every day" : "Every week"}: ${title}.${note}`;
}

/** Finds the playlist channel a guide entry belongs to, by guide id first and then by name. */
export async function channelFor(
  client: CloudClient,
  guideId: string,
  name: string,
): Promise<Channel> {
  const r = await client.channels("all", { q: name, kind: "live", limit: 50 });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found =
    r.channels.find((c) => guideId && c.id === guideId) ??
    r.channels.find((c) => norm(c.name) === norm(name)) ??
    r.channels[0];
  if (!found) throw new Error(`"${name}" is not in any of your playlists.`);
  return found;
}

/**
 * Watching a channel live: starts a hidden session, waits for the first picture and opens the
 * player. Cleans the session up if the page goes away first.
 */
export function useWatchChannel(client: CloudClient) {
  const state = useRef<{ id: string | null; cancelled: boolean }>({ id: null, cancelled: false });
  const [tuning, setTuning] = useState<string | null>(null);

  useEffect(() => {
    const s = state.current;
    s.cancelled = false; // StrictMode mounts, cleans up and mounts again
    return () => {
      s.cancelled = true;
      if (s.id) void client.endWatch(s.id);
    };
  }, [client]);

  const watch = useCallback(
    async (channel: Channel) => {
      const s = state.current;
      setTuning(channel.name);
      try {
        const { id } = await client.watchChannel(channel);
        s.id = id;
        const started = Date.now();
        while (!s.cancelled) {
          const rec = await client.getRecording(id);
          if (rec.status === "recording" && (await client.playlistReady(id))) {
            s.id = null; // the player owns it from here
            window.location.hash = `#/watch/tv/${encodeURIComponent(id)}`;
            return;
          }
          if (rec.status === "failed" || rec.status === "done") {
            throw new Error(rec.error || "The channel did not start.");
          }
          if (Date.now() - started > TUNE_TIMEOUT) {
            throw new Error(rec.error || "The channel took too long to start. Try another one.");
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        if (s.id) await client.endWatch(s.id);
        s.id = null;
        throw e;
      } finally {
        setTuning(null);
      }
    },
    [client],
  );

  return { watch, tuning };
}
