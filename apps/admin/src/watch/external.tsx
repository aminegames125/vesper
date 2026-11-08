import type { CloudRecording } from "@vesper/cloud-client";
import { useState } from "react";
import { Icon } from "../icons";
import { Button, Modal } from "../ui";

export interface ExternalSource {
  /** Short name of the choice, e.g. "Through Vesper". */
  label: string;
  /** What choosing it means, in a sentence. */
  hint: string;
  /** A full address (http or https) a media player can open. */
  url: string;
}

const phone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

/** Only an address on this very computer would not work from another device. */
const localOnly = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
};

/**
 * How long a player address should last: a day, or for a recording that has not aired yet until a
 * day after it is over (at most the server's 30 days).
 */
export function linkHours(rec: CloudRecording) {
  if (rec.status !== "scheduled" && rec.status !== "queued") return 24;
  const over = rec.startAt + Math.max(rec.maxSeconds, 0);
  return Math.min(720, Math.max(24, Math.ceil((over - Date.now() / 1000) / 3600) + 24));
}

/** What choosing the address means, in words that fit where the recording is in its life. */
export function linkHint(rec: CloudRecording) {
  if (rec.status === "scheduled" || rec.status === "queued")
    return "Open it now. Until the recording starts, the player shows the Vesper waiting screen; the picture appears by itself when it does. The link works until a day after it ends.";
  if (rec.status === "recording")
    return "Streams from this server while it records. It keeps running as long as the other player stays connected. The link works for 24 hours.";
  return "Plays from your library over the network. The link works for 24 hours.";
}

/** An absolute address, since a player outside the browser cannot resolve a relative one. */
export const absolute = (url: string) => new URL(url, window.location.href).href;

function download(name: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "audio/x-mpegurl" }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

/**
 * Hands a stream to a player outside the browser (VLC, mpv, Kodi, the phone's video app). Those
 * decode nearly anything, so this is also the way out when a channel uses a codec the browser lacks.
 */
export function ExternalPlayer({
  title,
  sources,
  onClose,
}: {
  title: string;
  sources: ExternalSource[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const source = sources[Math.min(index, sources.length - 1)];
  if (!source) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address is selectable on screen as a fallback */
    }
  };
  const safeName = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "stream";

  return (
    <Modal title="External player" onClose={onClose} wide>
      <p className="text-lg text-muted">
        Play <span className="font-semibold text-paper">{title}</span> in VLC, mpv, Kodi or your
        phone's video app.
      </p>

      {sources.length > 1 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {sources.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              className="plate rounded-lg bg-raised px-4 py-3 text-left aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-accent"
            >
              <span className="block text-lg font-semibold">{s.label}</span>
              <span className="text-base text-muted">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
      {sources.length === 1 && <p className="mt-2 text-base text-muted">{source.hint}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <code className="selectable min-w-0 flex-1 basis-64 truncate rounded-lg bg-raised px-5 py-3.5 font-mono text-base">
          {source.url}
        </code>
        <Button icon={copied ? "check" : "copy"} onClick={() => void copy()}>
          {copied ? "Copied" : "Copy address"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="primary"
          icon="download"
          onClick={() =>
            download(`${safeName}.m3u`, `#EXTM3U\n#EXTINF:-1,${title}\n${source.url}\n`)
          }
        >
          Download playlist (.m3u)
        </Button>
        {phone() && (
          <a
            href={`vlc://${source.url}`}
            className="plate inline-flex h-[var(--btn-h)] items-center gap-2 rounded-lg bg-raised px-5 text-lg font-semibold"
          >
            <Icon name="play" size={20} />
            Open in VLC
          </a>
        )}
      </div>

      <ul className="mt-6 space-y-2 text-base text-muted">
        <li>
          <span className="font-semibold text-paper">VLC:</span> Media, Open Network Stream, paste
          the address. Or open the downloaded .m3u file with VLC.
        </li>
        <li>
          <span className="font-semibold text-paper">mpv:</span> run{" "}
          <code className="font-mono">mpv "address"</code>.
        </li>
        <li>
          <span className="font-semibold text-paper">Kodi:</span> Videos, Files, Add videos, paste
          the address, or play the .m3u file.
        </li>
      </ul>
      {localOnly(source.url) && (
        <p className="mt-4 rounded-lg bg-sunken px-4 py-3 text-base">
          This address only works on this computer. To use another device, open Vesper there with
          the server's network address instead of localhost.
        </p>
      )}
    </Modal>
  );
}
