import type { CloudClient, ServerPlugin } from "@vesper/cloud-client";
import { useEffect, useState } from "react";
import { useLoad } from "../hooks";
import { Badge, Button, Card, Empty, Notice, PageHeader, Toggle } from "../ui";

const HOOK_HELP: Record<string, string> = {
  "download.created": "told when a download starts",
  "item.finished": "told when an item finishes or fails",
  resolve: "teaches the server new addresses",
  http: "serves /api/v1/x/<id>/…",
};

export function PluginsPage({ client }: { client: CloudClient }) {
  const { data, error, reload } = useLoad(() => client.admin.plugins(), 15_000);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Plugins"
        lead="Programs that extend this server. A plugin is a folder with a plugin.json; each one is off until you switch it on, and runs with the server's own permissions, so only enable code you trust."
      />
      <Notice>{error ?? message}</Notice>
      {data && (
        <p className="mb-5 text-sm text-muted">
          Install a plugin by copying its folder into{" "}
          <code className="selectable rounded bg-raised px-1.5 py-0.5 font-mono text-xs">
            {data.dir}
          </code>
          . It appears here within seconds.
        </p>
      )}
      {data && data.plugins.length === 0 && (
        <Card>
          <Empty>
            No plugins installed. The examples folder of the project has three to start from.
          </Empty>
        </Card>
      )}
      {data?.plugins.map((p) => (
        <PluginCard key={p.id} plugin={p} client={client} onChange={reload} onError={setMessage} />
      ))}
      {data && data.skipped.length > 0 && (
        <Card title="Skipped folders">
          <ul className="divide-y divide-line text-sm">
            {data.skipped.map((s) => (
              <li key={s.folder} className="flex gap-4 px-[var(--card-pad)] py-3">
                <span className="w-40 flex-none truncate font-mono text-xs">{s.folder}</span>
                <span className="text-accent">{s.error}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PluginCard({
  plugin,
  client,
  onChange,
  onError,
}: {
  plugin: ServerPlugin;
  client: CloudClient;
  onChange: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const pretty = JSON.stringify(plugin.config, null, 2);
  const [text, setText] = useState(pretty);
  const [bad, setBad] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // A change made elsewhere (or the saved version coming back) replaces what is typed.
  useEffect(() => setText(pretty), [pretty]);

  const act = async (work: () => Promise<unknown>) => {
    onError(null);
    try {
      await work();
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not work.");
    }
  };

  const saveConfig = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return setBad("That is not valid JSON.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return setBad("The configuration must be a JSON object.");
    }
    setBad(null);
    void act(() =>
      client.admin.updatePlugin(plugin.id, { config: parsed as Record<string, unknown> }),
    );
  };

  return (
    <Card
      title={`${plugin.name} ${plugin.version ? `v${plugin.version}` : ""}`.trim()}
      actions={
        <Button
          onClick={() =>
            void act(async () => {
              const r = await client.admin.testPlugin(plugin.id);
              setResult(
                r.ok
                  ? `Started fine. It printed: ${r.output?.trim() || "(nothing)"}`
                  : `Failed: ${r.error}`,
              );
            })
          }
        >
          Test run
        </Button>
      }
    >
      <div className="space-y-4 p-[var(--card-pad)]">
        <Toggle
          checked={plugin.enabled}
          onChange={(on) => void act(() => client.admin.updatePlugin(plugin.id, { enabled: on }))}
          label={plugin.enabled ? "Enabled" : "Off"}
          hint={plugin.description || undefined}
        />
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {plugin.author && <span>by {plugin.author}</span>}
          <span className="font-mono">{plugin.id}</span>
          {plugin.hooks.map((h) => (
            <Badge key={h} tone="dusk">
              {h}
            </Badge>
          ))}
        </p>
        <ul className="text-xs text-muted">
          {plugin.hooks.map((h) => (
            <li key={h}>
              <b className="font-medium text-paper">{h}</b>: {HOOK_HELP[h] ?? ""}
            </li>
          ))}
        </ul>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Configuration (JSON)</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={Math.min(12, Math.max(3, text.split("\n").length))}
            className="w-full rounded-lg border border-line bg-sunken px-3.5 py-2.5 font-mono text-xs focus:border-accent focus:outline-none"
          />
          {bad && <span className="mt-1 block text-xs text-accent">{bad}</span>}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={saveConfig} disabled={text === pretty}>
            Save configuration
          </Button>
          {result && <span className="text-xs text-muted">{result}</span>}
        </div>
      </div>
    </Card>
  );
}
