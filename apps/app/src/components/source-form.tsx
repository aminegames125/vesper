import { type FormEvent, useState } from "react";
import { fetchText } from "../lib/fetch-text";
import { parseM3U } from "../lib/m3u";
import { useStore } from "../lib/store";
import type { Provider } from "../lib/types";
import { getAccount, normalizeHost } from "../lib/xtream";
import { Button, Field } from "./ui";

export const DEMO_URL = "https://iptv-org.github.io/iptv/countries/us.m3u";

/** One form for adding a source; the Sources page and the first-run welcome both use it. */
export function SourceForm({
  kind,
  onAdded,
  submitLabel = "Add source",
}: {
  kind: Provider["kind"];
  onAdded: (provider: Provider) => void;
  submitLabel?: string;
}) {
  const addProvider = useStore((s) => s.addProvider);
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
      let provider: Provider;
      if (kind === "xtream") {
        const xtream = { host: normalizeHost(host), username: username.trim(), password };
        const account = await getAccount(xtream);
        provider = {
          ...base,
          kind,
          name: name.trim() || new URL(xtream.host).hostname,
          xtream,
          account,
        };
      } else {
        const link = url.trim();
        if (parseM3U(await fetchText(link)).length === 0)
          throw new Error("That link has no channels in it.");
        provider = { ...base, kind, name: name.trim() || new URL(link).hostname, url: link };
      }
      await addProvider(provider);
      onAdded(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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
          label="Playlist link"
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/playlist.m3u"
        />
      )}
      <Field
        label="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shown in your library"
      />
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy} className="self-start px-6 py-2.5">
        {busy ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}

export function addDemoSource() {
  const { addProvider, notify } = useStore.getState();
  return addProvider({
    id: crypto.randomUUID(),
    name: "Free public channels",
    kind: "m3u",
    url: DEMO_URL,
    addedAt: Date.now(),
  }).then(() => notify("Loaded free public channels"));
}
