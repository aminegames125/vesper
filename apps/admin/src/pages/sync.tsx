import { type CloudClient, formatBytes } from "@vesper/cloud-client";
import { useState } from "react";
import { useLoad } from "../hooks";
import { Badge, Button, Card, Empty, Notice, PageHeader, ROW, when } from "../ui";

export function SyncPage({ client }: { client: CloudClient }) {
  const { data, error, reload } = useLoad(() => client.admin.sync(), 10_000);
  const [checked, setChecked] = useState<string | null>(null);

  // A round trip of your own: write a key, read it back, remove it.
  const selfTest = async () => {
    setChecked(null);
    try {
      const key = "selftest";
      const stamp = Math.floor(Date.now() / 1000);
      await client.syncPush([{ key, value: { at: stamp }, updatedAt: stamp }]);
      const back = await client.syncPull(stamp - 1);
      const ok = back.items.some((i) => i.key === key);
      await client.syncForget(key);
      setChecked(
        ok ? "Sync works: wrote a value and read it back." : "The value did not come back.",
      );
      await reload();
    } catch (e) {
      setChecked(e instanceof Error ? e.message : "The test failed.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Sync"
        lead="Favourites, preferences and resume points are shared between Kodi, the app and this panel. For each item the newest change wins."
        actions={<Button onClick={() => void selfTest()}>Test sync</Button>}
      />
      <Notice>{error}</Notice>
      {checked && (
        <p className="mb-4 rounded-xl border border-line bg-raised px-4 py-3 text-sm">{checked}</p>
      )}
      <Card title="Per account">
        {data && data.users.length === 0 && <Empty>No accounts yet.</Empty>}
        <ul className="divide-y divide-line">
          {data?.users.map((u) => (
            <li key={u.user} className={ROW}>
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-semibold">{u.user}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {u.lastSync ? `Last synced ${when(u.lastSync)}` : "Never synced"}
                </p>
              </div>
              <Badge tone={u.keys ? "ok" : "muted"}>{u.keys} items</Badge>
              <span className="w-20 text-right text-xs text-muted">{formatBytes(u.bytes)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="What gets synced">
        <ul className="grid gap-3 p-[var(--card-pad)] text-sm sm:grid-cols-3">
          {[
            ["Favourites", "Channels, movies and series a person starred."],
            ["Resume points", "Where playback stopped, even for things Kodi plays itself."],
            ["Preferences", "Player speed, volume and the encoder a person likes."],
          ].map(([name, text]) => (
            <li key={name} className="rounded-xl bg-raised p-4">
              <p className="font-medium">{name}</p>
              <p className="mt-1 text-xs text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
