import { type CloudClient, formatBytes } from "@vesper/cloud-client";
import { useLoad } from "../hooks";
import { Card } from "../ui";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Dashboard({ client }: { client: CloudClient }) {
  const { data: stats, error } = useLoad(() => client.admin.stats(), 5000);
  if (error) return <p className="text-accent">{error}</p>;
  if (!stats) return null;
  const lite = stats.mode === "lite";

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Overview</h1>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat
          label="Recording now"
          value={stats.recordings.recording}
          hint={`${stats.recordings.scheduled} scheduled`}
        />
        <Stat
          label="Saved recordings"
          value={stats.recordings.done}
          hint={`${stats.recordings.failed} failed`}
        />
        <Stat label="Storage used" value={formatBytes(stats.storageBytes)} />
        {lite ? (
          <Stat label="Mode" value="Lite" hint="No accounts" />
        ) : (
          <Stat
            label="Users"
            value={stats.users}
            hint={`${stats.suspended} suspended · ${stats.sessions} signed in`}
          />
        )}
      </div>
      <Card title="Connect your devices">
        <div className="space-y-3 p-5 text-sm leading-relaxed">
          <p>
            In the Vesper app open <b>Settings → Cloud</b> and enter this server's address:
          </p>
          <code className="block rounded-xl bg-raised px-4 py-3 font-mono text-accent select-text">
            {window.location.origin}
          </code>
          <p className="text-muted">
            {lite
              ? "Lite mode has no passwords, so keep this server on a network you trust."
              : "Sign in with an account you create under Users, or let people join with an invite code."}
          </p>
        </div>
      </Card>
    </div>
  );
}
