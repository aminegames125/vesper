import type { CloudClient, ServerSettings } from "@vesper/cloud-client";
import { type FormEvent, useEffect, useState } from "react";
import { useLoad } from "../hooks";
import { Button, Card, Field, Select } from "../ui";

export function SettingsPage({ client, lite }: { client: CloudClient; lite: boolean }) {
  const { data, error } = useLoad(() => client.admin.settings());
  const [form, setForm] = useState<ServerSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (error) return <p className="text-accent">{error}</p>;
  if (!form) return null;

  const set = (key: keyof ServerSettings, value: string) => {
    setSaved(false);
    setForm({ ...form, [key]: value });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await client.admin.updateSettings(form);
      setSaved(true);
      setFailure(null);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Could not save.");
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>

      {!lite && (
        <Card title="Joining">
          <div className="flex flex-col gap-4 p-5">
            <Select
              label="Who can create an account"
              value={form.registration}
              onChange={(e) => set("registration", e.target.value)}
            >
              <option value="closed">Nobody: only I add users</option>
              <option value="invite">People with an invite code</option>
              <option value="open">Anyone who can reach the server</option>
            </Select>
            <Field
              label="Stay signed in for (days)"
              type="number"
              min={1}
              value={form.session_days}
              onChange={(e) => set("session_days", e.target.value)}
            />
          </div>
        </Card>
      )}

      <Card title="Notifications">
        <div className="p-5">
          <Field
            label="Webhook address"
            value={form.webhook_url ?? ""}
            onChange={(e) => set("webhook_url", e.target.value)}
            hint="Vesper posts here when a recording finishes or fails. Works with Discord, ntfy and Slack-style hooks. Leave empty to turn off."
          />
        </div>
      </Card>

      <Card title="Defaults for new accounts">
        <div className="grid grid-cols-2 gap-4 p-5">
          <Field
            label="Recordings at once"
            type="number"
            min={0}
            value={form.default_max_concurrent}
            onChange={(e) => set("default_max_concurrent", e.target.value)}
            hint="0 = no limit"
          />
          <Field
            label="Longest recording (hours)"
            type="number"
            min={0}
            value={form.default_max_hours}
            onChange={(e) => set("default_max_hours", e.target.value)}
          />
          <Field
            label="Storage (GB)"
            type="number"
            min={0}
            value={form.default_storage_gb}
            onChange={(e) => set("default_storage_gb", e.target.value)}
          />
          <Field
            label="Keep recordings (hours)"
            type="number"
            min={0}
            value={form.default_keep_hours}
            onChange={(e) => set("default_keep_hours", e.target.value)}
            hint="Empty or 0 = until deleted. Short values keep storage small."
          />
        </div>
      </Card>

      {!lite && (
        <Card title="Network">
          <label className="flex items-start gap-3 p-5 text-sm">
            <input
              type="checkbox"
              checked={form.allow_private === "true"}
              onChange={(e) => set("allow_private", String(e.target.checked))}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span>
              <b className="block">Allow private network addresses</b>
              <span className="text-muted">
                Lets the proxy and recorder reach hosts on your own network. Leave this off on a
                public server: it stops people using the server to probe the network it runs in.
              </span>
            </span>
          </label>
        </Card>
      )}

      {failure && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {failure}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary">
          Save settings
        </Button>
        {saved && <span className="text-sm text-muted">Saved.</span>}
      </div>
    </form>
  );
}
