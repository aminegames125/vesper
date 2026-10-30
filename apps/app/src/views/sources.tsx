import { type FormEvent, useState } from "react";
import { IconButton, RefreshCwIcon, TrashIcon } from "../components/icons";
import { Button, Chip, Field, Notice, PageHeader } from "../components/ui";
import { fetchText } from "../lib/fetch-text";
import { parseM3U } from "../lib/m3u";
import { useStore } from "../lib/store";
import type { AccountInfo, Provider } from "../lib/types";
import { getAccount, normalizeHost } from "../lib/xtream";
import { DEMO_URL } from "./no-sources";

export function Sources() {
  const providers = useStore((s) => s.providers);
  const status = useStore((s) => s.status);
  const errors = useStore((s) => s.errors);
  const refresh = useStore((s) => s.refresh);
  const removeProvider = useStore((s) => s.removeProvider);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Sources"
        count={providers.length}
        actions={
          <Button
            icon={RefreshCwIcon}
            onClick={() => void refresh()}
            disabled={status === "loading" || providers.length === 0}
          >
            {status === "loading" ? "Refreshing…" : "Refresh all"}
          </Button>
        }
      />

      {errors.length > 0 && (
        <ul className="mb-4 rounded-xl border border-accent/50 bg-panel p-4 text-sm">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {providers.length === 0 ? (
        <div className="mb-10">
          <Notice title="No sources yet">Add an Xtream login or an M3U link below.</Notice>
        </div>
      ) : (
        <ul className="surface mb-10 divide-y divide-line">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">
                  {p.kind === "xtream" ? `Xtream · ${p.xtream?.host}` : `M3U · ${p.url}`}
                </p>
                {p.account && <AccountLine account={p.account} />}
              </div>
              <IconButton
                icon={TrashIcon}
                label={`Remove ${p.name}`}
                onClick={() => removeProvider(p.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddSource />
    </div>
  );
}

function AccountLine({ account }: { account: AccountInfo }) {
  const expiry = account.expires
    ? new Date(account.expires * 1000).toLocaleDateString()
    : "no expiry";
  return (
    <p className="mt-1 text-xs text-muted">
      <span className={account.active ? "text-paper" : "text-accent"}>
        {account.active ? "Active" : "Inactive"}
      </span>
      {account.trial && " · trial"} · expires {expiry} · {account.activeConnections}/
      {account.maxConnections} connections
    </p>
  );
}

function AddSource() {
  const addProvider = useStore((s) => s.addProvider);
  const setView = useStore((s) => s.setView);
  const notify = useStore((s) => s.notify);
  const [kind, setKind] = useState<Provider["kind"]>("xtream");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const base = { id: crypto.randomUUID(), addedAt: Date.now() };
      if (kind === "xtream") {
        const xtream = { host: normalizeHost(host), username: username.trim(), password };
        const account = await getAccount(xtream);
        await addProvider({
          ...base,
          kind,
          name: name.trim() || new URL(xtream.host).hostname,
          xtream,
          account,
        });
      } else {
        const link = url.trim();
        if (parseM3U(await fetchText(link)).length === 0)
          throw new Error("That link has no channels in it.");
        await addProvider({
          ...base,
          kind,
          name: name.trim() || new URL(link).hostname,
          url: link,
        });
      }
      notify("Source added");
      setName("");
      setHost("");
      setUsername("");
      setPassword("");
      setUrl("");
      setView("home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-semibold">Add a source</h2>
      <div className="mb-5 flex gap-2">
        <Chip active={kind === "xtream"} onClick={() => setKind("xtream")}>
          Xtream Codes
        </Chip>
        <Chip active={kind === "m3u"} onClick={() => setKind("m3u")}>
          M3U link
        </Chip>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        {kind === "xtream" ? (
          <>
            <Field
              label="Server"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="http://example.com:8080"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Username"
                required
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Field
                label="Password"
                required
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        ) : (
          <Field
            label="Playlist URL"
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/playlist.m3u"
            hint="Vesper ships no channels. Free public lists such as iptv-org work well for trying it out."
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Checking…" : "Add source"}
          </Button>
          {kind === "m3u" && (
            <Button
              onClick={() => {
                setUrl(DEMO_URL);
                setName("iptv-org · United States");
              }}
            >
              Use public demo list
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
