import type { CloudClient } from "@vesper/cloud-client";
import { useLoad } from "../hooks";
import { Badge, Card, Empty, Notice, PageHeader, when } from "../ui";

export function AuditPage({ client }: { client: CloudClient }) {
  const { data: entries, error } = useLoad(() => client.admin.audit(200), 10_000);
  return (
    <div>
      <PageHeader title="Activity" lead="Everything that changed on this server, newest first." />
      <Notice>{error}</Notice>
      <Card title="Latest events">
        {entries && entries.length === 0 && <Empty>Nothing has happened yet.</Empty>}
        <ul className="divide-y divide-line text-sm">
          {entries?.map((e) => (
            <li
              key={`${e.at}-${e.actor}-${e.action}-${e.detail}`}
              className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-[var(--card-pad)] py-3 md:grid-cols-[10rem_8rem_12rem_1fr]"
            >
              <span className="order-2 text-sm text-muted md:order-none md:text-sm">
                {when(e.at)}
              </span>
              <span className="order-1 truncate font-medium md:order-none">{e.actor}</span>
              <span className="order-3 md:order-none">
                <Badge tone="dusk">{e.action}</Badge>
              </span>
              <span className="order-4 col-span-2 min-w-0 truncate font-mono text-sm text-muted md:order-none md:col-span-1">
                {e.detail}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
