import { type CloudClient, formatBytes, formatUntil } from "@vesper/cloud-client";
import { useState } from "react";
import { useAction, useLoad } from "../hooks";
import { Badge, Button, Card, Empty, Notice, PageHeader, ROW, when } from "../ui";

const LABEL = {
  recording: "in progress",
  done: "saved",
  failed: "failed",
  scheduled: "waiting",
  queued: "waiting",
} as const;

/** Everything the server holds, across all accounts. The web only reviews and removes. */
export function LibraryPage({ client }: { client: CloudClient }) {
  const { data: items, error, reload } = useLoad(() => client.admin.recordings(), 5000);
  const [message, setMessage] = useState<string | null>(null);
  const run = useAction(reload, setMessage);

  return (
    <div>
      <PageHeader
        title="Library"
        lead="What the server holds for every account. Items arrive from Kodi and from downloads; here you can review and remove them."
      />
      <Notice>{error ?? message}</Notice>
      <Card title={`${items?.length ?? 0} items`}>
        {items && items.length === 0 && <Empty>The library is empty.</Empty>}
        <ul className="divide-y divide-line">
          {items?.map((r) => (
            <li key={r.id} className={ROW}>
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{r.title}</span>
                  <Badge
                    tone={r.status === "failed" ? "accent" : r.status === "done" ? "ok" : "muted"}
                  >
                    {LABEL[r.status]}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {r.user} · {r.channelName || "download"} · {formatBytes(r.bytes)} ·{" "}
                  {when(r.createdAt)}
                  {r.keepUntil ? ` · removed in ${formatUntil(r.keepUntil)}` : ""}
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
