import {
  type CloudRecording,
  formatBytes,
  formatDuration,
  formatUntil,
} from "@vesper/cloud-client";
import { useCallback, useEffect, useState } from "react";
import { CircleStopIcon, DownloadIcon, IconButton, PlayIcon, TrashIcon } from "../components/icons";
import { Button, Notice, Spinner } from "../components/ui";
import { useCloud } from "../lib/cloud";
import { formatClock, formatDay } from "../lib/epg";
import { useStore } from "../lib/store";

const KEEP_CHOICES = [
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "1 day" },
  { hours: 168, label: "1 week" },
  { hours: 0, label: "Forever" },
];

const LABEL: Record<CloudRecording["status"], string> = {
  queued: "Starting…",
  scheduled: "Scheduled",
  recording: "Recording…",
  done: "Saved",
  failed: "Failed",
};

/** The recordings that live on the cloud server: playable and downloadable from any device. */
export function CloudRecordings() {
  const client = useCloud();
  const play = useStore((s) => s.play);
  const notify = useStore((s) => s.notify);
  const [items, setItems] = useState<CloudRecording[] | null>(null);
  const [usage, setUsage] = useState({ used: 0, limit: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.listRecordings();
      setItems(data.recordings);
      setUsage({ used: data.storageUsed, limit: data.storageLimit });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cloud recordings.");
    }
  }, [client]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  if (!client) {
    return (
      <Notice title="Connect a server to record in the cloud">
        Open Settings, then Cloud, and enter your Vesper Cloud address.
      </Notice>
    );
  }
  if (error && !items) return <Notice title="Cloud unavailable">{error}</Notice>;
  if (!items) return <Spinner />;

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "That did not work.");
    }
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {formatBytes(usage.used)} used{usage.limit ? ` of ${formatBytes(usage.limit)}` : ""}. Short
        retention keeps storage small: recordings marked with a time are deleted automatically.
      </p>
      {items.length === 0 ? (
        <Notice title="Nothing recorded in the cloud yet">
          Press record in the player and choose Cloud, or schedule a programme from the Guide. The
          server records even when this device is off.
        </Notice>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
            >
              <span
                className={`size-2.5 flex-none rounded-full ${r.status === "recording" ? "animate-pulse bg-accent" : r.status === "failed" ? "bg-line" : "bg-muted"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {r.channelName || "Cloud"} · {formatDuration(r.seconds)} of{" "}
                  {formatDuration(r.maxSeconds)} · {formatBytes(r.bytes)}
                  {r.status === "scheduled"
                    ? ` · starts ${formatDay(r.startAt)} ${formatClock(r.startAt)}`
                    : ""}
                  {r.keepUntil ? ` · deleted in ${formatUntil(r.keepUntil)}` : ""}
                </p>
                {r.error && <p className="truncate text-xs text-accent">{r.error}</p>}
              </div>
              <span
                className={`text-xs font-medium ${r.status === "failed" ? "text-accent" : "text-muted"}`}
              >
                {LABEL[r.status]}
              </span>
              {(r.status === "recording" || r.status === "done") && r.bytes > 0 && (
                <Button
                  variant="primary"
                  icon={PlayIcon}
                  onClick={() =>
                    play({
                      id: `cloud:${r.id}`,
                      title: r.title,
                      subtitle: r.channelName || "Cloud recording",
                      url: client.playlistUrl(r.id),
                      live: false,
                    })
                  }
                >
                  {r.status === "recording" ? "Watch now" : "Play"}
                </Button>
              )}
              {r.status === "done" && (
                <>
                  <select
                    aria-label={`Keep ${r.title} for`}
                    value=""
                    onChange={(e) =>
                      e.target.value !== "" &&
                      void act(() => client.keepRecording(r.id, Number(e.target.value)))
                    }
                    className="rounded-full border border-line bg-panel px-2 py-1.5 text-sm"
                  >
                    <option value="">Keep…</option>
                    {KEEP_CHOICES.map((k) => (
                      <option key={k.hours} value={k.hours}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <a
                    href={client.downloadUrl(r.id)}
                    download
                    className="fade inline-flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-sm font-medium hover:bg-line"
                  >
                    <DownloadIcon size={16} color="currentColor" /> Download
                  </a>
                </>
              )}
              {(r.status === "recording" || r.status === "scheduled") && (
                <Button
                  variant="ghost"
                  icon={CircleStopIcon}
                  onClick={() => void act(() => client.stopRecording(r.id))}
                >
                  {r.status === "scheduled" ? "Cancel" : "Stop"}
                </Button>
              )}
              <IconButton
                icon={TrashIcon}
                label={`Delete ${r.title}`}
                disabled={r.status === "recording"}
                onClick={() => void act(() => client.deleteRecording(r.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
