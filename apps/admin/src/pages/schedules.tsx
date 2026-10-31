import { type CloudClient, describeDays, formatDuration } from "@vesper/cloud-client";
import { useState } from "react";
import { useAction, useLoad } from "../hooks";
import { Badge, Button, Card, Empty, when } from "../ui";

export function SchedulesPage({ client }: { client: CloudClient }) {
  const { data: schedules, error, reload } = useLoad(() => client.admin.schedules(), 10000);
  const [message, setMessage] = useState<string | null>(null);
  const run = useAction(reload, setMessage);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Schedules</h1>
      {(error || message) && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error ?? message}
        </p>
      )}
      <Card title={`${schedules?.length ?? 0} schedules`}>
        {schedules && schedules.length === 0 && (
          <Empty>No one has scheduled a recording yet.</Empty>
        )}
        <ul className="divide-y divide-line">
          {schedules?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{s.title}</span>
                  <Badge tone={s.enabled ? "ok" : "muted"}>{s.enabled ? "on" : "paused"}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {s.user} · {s.channelName || "unknown channel"} · {describeDays(s.days)} at{" "}
                  {s.startTime} ({s.tz}) for {formatDuration(s.seconds)} ·{" "}
                  {s.nextStart ? `next ${when(s.nextStart)}` : "nothing coming up"}
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Delete the schedule "${s.title}"?`))
                    void run(() => client.admin.deleteSchedule(s.id));
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
