import { useState } from "react";
import { CircleStopIcon, FolderOpenIcon, IconButton, TrashIcon } from "../components/icons";
import { Button, Notice, PageHeader, Segmented } from "../components/ui";
import { useCloud } from "../lib/cloud";
import { formatClock, formatDay } from "../lib/epg";
import {
  canRecord,
  deleteRecordingFile,
  openRecordingsFolder,
  revealRecording,
  stopRecording,
} from "../lib/recorder";
import { useStore } from "../lib/store";
import { CloudRecordings } from "./cloud-recordings";

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
const megabytes = (bytes = 0) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;

function LocalRecordings() {
  const recordings = useStore((s) => s.recordings);
  const scheduled = useStore((s) => s.scheduled);
  const removeRecording = useStore((s) => s.removeRecording);
  const removeScheduled = useStore((s) => s.removeScheduled);
  const notify = useStore((s) => s.notify);

  const open = (action: Promise<unknown>) =>
    action.catch((e) => notify(e instanceof Error ? e.message : String(e)));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Recordings"
        count={recordings.length}
        actions={
          <Button icon={FolderOpenIcon} onClick={() => void open(openRecordingsFolder())}>
            Open folder
          </Button>
        }
      />
      <p className="mb-6 text-sm text-muted">
        Saved as .ts files in Videos\Vesper. Open them in VLC, mpv or any player that understands
        transport streams.
      </p>

      {scheduled.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Scheduled</h2>
          <p className="mb-3 text-xs text-muted">
            Scheduled recordings start only while Vesper is open.
          </p>
          <ul className="flex flex-col gap-2">
            {scheduled.map((s) => (
              <li key={s.id} className="surface flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="truncate text-xs text-muted">
                    {s.channel.name} · {formatDay(s.start)} {formatClock(s.start)} –{" "}
                    {formatClock(s.end)}
                  </p>
                </div>
                <IconButton
                  icon={TrashIcon}
                  label={`Cancel ${s.title}`}
                  onClick={() => removeScheduled(s.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recordings.length === 0 ? (
        <Notice title="Nothing recorded yet">
          Press the record button in the player, or schedule a programme from the Guide.
        </Notice>
      ) : (
        <ul className="flex flex-col gap-2">
          {recordings.map((r) => (
            <li key={r.id} className="surface flex items-center gap-4 px-5 py-3">
              <span
                className={`size-2.5 flex-none rounded-full ${r.status === "recording" ? "animate-pulse bg-accent" : r.status === "done" ? "bg-muted" : "bg-line"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  {r.channelName} · {minutes(r.seconds)} · {new Date(r.startedAt).toLocaleString()}
                  {r.bytes ? ` · ${megabytes(r.bytes)}` : ""}
                </p>
                {r.status === "failed" && r.error && (
                  <p className="truncate text-xs text-accent">{r.error}</p>
                )}
              </div>
              <span
                className={`text-xs font-medium ${r.status === "failed" ? "text-accent" : "text-muted"}`}
              >
                {r.status === "recording" ? "Recording…" : r.status === "done" ? "Saved" : "Failed"}
              </span>
              {r.status === "recording" && (
                <Button
                  variant="ghost"
                  icon={CircleStopIcon}
                  onClick={() => void open(stopRecording(r.id))}
                >
                  Stop
                </Button>
              )}
              {r.status === "done" && r.path && (
                <Button
                  variant="ghost"
                  icon={FolderOpenIcon}
                  onClick={() => void open(revealRecording(r.path as string))}
                >
                  Show file
                </Button>
              )}
              <IconButton
                icon={TrashIcon}
                label={`Delete ${r.title}`}
                disabled={r.status === "recording"}
                onClick={() => {
                  if (r.path && r.status !== "failed") void deleteRecordingFile(r.path);
                  removeRecording(r.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Recordings on this device and in the cloud, side by side. */
export function Recordings() {
  const device = canRecord();
  const cloud = useCloud();
  const [tab, setTab] = useState<"device" | "cloud">(device ? "device" : "cloud");

  if (!device && !cloud) {
    return (
      <Notice title="Recording needs the app or a cloud server">
        The browser cannot save files. Use the desktop or mobile app, or connect a Vesper Cloud
        server in Settings.
      </Notice>
    );
  }

  return (
    <div>
      {device && (
        <div className="mb-6">
          <Segmented
            label="Where"
            value={tab}
            onChange={setTab}
            options={[
              { value: "device", label: "This device" },
              { value: "cloud", label: "Cloud" },
            ]}
          />
        </div>
      )}
      {tab === "device" && device ? (
        <LocalRecordings />
      ) : (
        <div className="max-w-4xl">
          <PageHeader title="Cloud recordings" />
          <CloudRecordings />
        </div>
      )}
    </div>
  );
}
