import { type CloudClient, type CloudRecording, formatDuration } from "@vesper/cloud-client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { Badge } from "../ui";

/** A key that only opens media. Empty in lite mode, where nothing is signed. */
export function useMediaToken(client: CloudClient) {
  const [token, setToken] = useState<string | null>(client.token ? null : "");
  useEffect(() => {
    if (!client.token) {
      setToken("");
      return;
    }
    let alive = true;
    const fetchToken = () =>
      client
        .mediaToken()
        .then((r) => alive && setToken(r.token))
        .catch(() => alive && setToken(""));
    void fetchToken();
    // Media keys last a day; renew well before that.
    const timer = setInterval(fetchToken, 6 * 3600_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [client]);
  return token;
}

export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export const isPlayable = (r: CloudRecording) => r.status === "done" || r.status === "recording";

export const resumable = (r: CloudRecording) =>
  r.status === "done" && !r.watched && r.positionS > 20;

/** A poster-shaped card for one recording or download. */
export function MediaCard({
  rec,
  media,
  client,
  onPlay,
  wide = false,
}: {
  rec: CloudRecording;
  media: string | null;
  client: CloudClient;
  onPlay: (id: string) => void;
  wide?: boolean;
}) {
  const playable = isPlayable(rec);
  const progress =
    rec.kind === "recording" && rec.seconds > 0 ? Math.min(1, rec.positionS / rec.seconds) : 0;
  return (
    <motion.button
      layout
      type="button"
      disabled={!playable}
      onClick={() => onPlay(rec.id)}
      className={`group relative block text-left disabled:cursor-default disabled:opacity-60 ${wide ? "w-64 flex-none snap-start sm:w-72" : "w-full"}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-raised ring-1 ring-line transition-colors group-hover:ring-accent">
        {rec.thumb && media !== null ? (
          <img
            src={client.thumbFor(rec.id, media)}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <Icon name={rec.kind === "download" ? "download" : "film"} size={30} />
          </div>
        )}
        <div className="scrim absolute inset-x-0 bottom-0 h-1/3 opacity-60" />
        <div className="absolute left-2 top-2 flex gap-1.5">
          {rec.status === "recording" && rec.kind === "download" && (
            <Badge tone="dusk">saving</Badge>
          )}
          {rec.status === "done" && rec.watched && <Badge>watched</Badge>}
        </div>
        {rec.status === "done" && rec.kind === "recording" && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular">
            {formatDuration(rec.seconds)}
          </span>
        )}
        {progress > 0.02 && !rec.watched && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2.5 truncate text-sm font-semibold">{rec.title}</p>
      <p className="truncate text-xs text-muted">
        {rec.channelName || (rec.kind === "download" ? "Download" : "From Kodi")}
        {rec.status === "failed" ? " · failed" : ""}
        {rec.status === "scheduled" || rec.status === "queued" ? " · waiting" : ""}
      </p>
    </motion.button>
  );
}
