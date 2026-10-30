import { type CloudClient, formatBytes, formatDuration, formatUntil } from "@vesper/cloud-client";
import { useState } from "react";
import { useAction, useLoad } from "../hooks";
import { Badge, Button, Card, Empty, when } from "../ui";

const TONE = {
  recording: "accent",
  done: "ok",
  failed: "accent",
  scheduled: "muted",
  queued: "muted",
} as const;

export function RecordingsPage({ client }: { client: CloudClient }) {
  const { data: recordings, error, reload } = useLoad(() => client.admin.recordings(), 5000);
  const [message, setMessage] = useState<string | null>(null);
  const run = useAction(reload, setMessage);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Recordings</h1>
      {(error || message) && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error ?? message}
        </p>
      )}
      <Card title={`${recordings?.length ?? 0} recordings`}>
        {recordings && recordings.length === 0 && (
          <Empty>Nothing has been recorded on this server yet.</Empty>
        )}
        <ul className="divide-y divide-line">
          {recordings?.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{r.title}</span>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {r.user} · {r.channelName || "unknown channel"} · {formatDuration(r.seconds)} of{" "}
                  {formatDuration(r.maxSeconds)} · {formatBytes(r.bytes)} ·{" "}
                  {r.status === "scheduled" ? `starts ${when(r.startAt)}` : when(r.createdAt)}
                  {r.keepUntil ? ` · deleted in ${formatUntil(r.keepUntil)}` : ""}
                </p>
                {r.error && <p className="mt-0.5 text-xs text-accent">{r.error}</p>}
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete "${r.title}" from the server?`))
                    void run(() => client.admin.deleteRecording(r.id));
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
