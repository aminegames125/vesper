import type { CloudClient } from "@vesper/cloud-client";
import { useLoad } from "../hooks";
import { Card, Empty, when } from "../ui";

export function AuditPage({ client }: { client: CloudClient }) {
  const { data: entries, error } = useLoad(() => client.admin.audit(200), 10_000);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Activity</h1>
      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}
      <Card title="Latest events">
        {entries && entries.length === 0 && <Empty>Nothing has happened yet.</Empty>}
        <ul className="divide-y divide-line font-mono text-xs">
          {entries?.map((e, i) => (
            <li key={i} className="flex gap-4 px-5 py-2.5">
              <span className="w-40 flex-none text-muted">{when(e.at)}</span>
              <span className="w-32 flex-none truncate">{e.actor}</span>
              <span className="w-44 flex-none text-accent">{e.action}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{e.detail}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
