import { CloudError, formatBytes } from "@vesper/cloud-client";
import { type FormEvent, useEffect, useState } from "react";
import { MonitorIcon, ServerIcon } from "../components/icons";
import { Button, Chip, Field, Toggle } from "../components/ui";
import { makeClient, useCloud } from "../lib/cloud";
import { isDesktop } from "../lib/fetch-text";
import { useStore } from "../lib/store";

const invoke = async <T,>(command: string, args?: Record<string, unknown>) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
};

/** Connect to a Vesper Cloud server, choose what syncs, or run a server on this PC. */
export function CloudSettings() {
  const cloud = useStore((s) => s.cloud);
  const setCloud = useStore((s) => s.setCloud);
  const disconnect = useStore((s) => s.disconnectCloud);
  const notify = useStore((s) => s.notify);
  const client = useCloud();

  const [address, setAddress] = useState(cloud.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");

  // The server's setup and registration state changes while the app is away; look again on open.
  useEffect(() => {
    if (!cloud.url) return;
    makeClient(cloud.url, null)
      .info()
      .then((info) => setCloud({ info }))
      .catch(() => undefined);
  }, [cloud.url, setCloud]);

  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof CloudError || e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const connect = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      const probe = makeClient(address, null);
      const info = await probe.info();
      const next = makeClient(probe.baseUrl, null);
      // A lite server has no accounts, so connecting is all it takes.
      const user = info.mode === "lite" ? await next.me() : null;
      setCloud({ url: probe.baseUrl, token: null, user, info });
      notify(`Connected to ${probe.baseUrl}`);
    });
  };

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      const api = makeClient(cloud.url, null);
      const session =
        mode === "register"
          ? await api.register(username, password, invite || undefined)
          : await api.login(username, password);
      setCloud({ token: session.token, user: session.user });
      setPassword("");
      notify(`Signed in as ${session.user.username}`);
    });
  };

  const signOut = () => {
    void client?.logout().catch(() => {});
    setCloud({ token: null, user: null });
  };

  return (
    <div className="flex flex-col divide-y divide-line">
      <div className="px-5 py-4">
        <p className="font-medium">Server</p>
        <p className="mb-3 text-xs text-muted">
          Vesper Cloud records for you, keeps your library in sync and lets you watch your
          recordings on any device.
        </p>

        {!cloud.url || !cloud.info ? (
          <form onSubmit={connect} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field
                label="Server address"
                placeholder="192.168.1.20:8484"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="primary" icon={ServerIcon} disabled={busy}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-tint px-3 py-1 text-xs font-bold text-accent">
              {cloud.info.mode === "lite" ? "LITE" : "FULL"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {cloud.url} · v{cloud.info.version}
              {cloud.user && cloud.info.mode === "full" ? ` · ${cloud.user.username}` : ""}
            </span>
            {client && cloud.info.mode === "full" && <Button onClick={signOut}>Sign out</Button>}
            <Button variant="danger" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}
      </div>

      {cloud.info?.mode === "full" && !client && (
        <form onSubmit={signIn} className="flex flex-col gap-4 px-5 py-4">
          {cloud.info.needsSetup ? (
            <p className="text-sm text-muted">
              This server has no accounts yet. Open <b>{cloud.url}/admin/</b> in a browser to create
              the first administrator, then sign in here.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <Chip active={mode === "signin"} onClick={() => setMode("signin")}>
                  Sign in
                </Chip>
                {cloud.info.registration !== "closed" && (
                  <Chip active={mode === "register"} onClick={() => setMode("register")}>
                    Create account
                  </Chip>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Username"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Field
                  label="Password"
                  type="password"
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {mode === "register" && cloud.info.registration === "invite" && (
                <Field
                  label="Invite code"
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
              )}
              <div>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </div>
            </>
          )}
        </form>
      )}

      {client && cloud.user && (
        <div className="px-5 py-4 text-sm">
          <p className="mb-1 font-medium">Your cloud</p>
          <p className="text-xs text-muted">
            Role: {cloud.user.role} · storage {formatBytes(cloud.user.storageUsed)}
            {cloud.user.storage_bytes
              ? ` of ${formatBytes(cloud.user.storage_bytes)}`
              : " (no limit)"}
            {cloud.user.max_hours ? ` · up to ${cloud.user.max_hours}h per recording` : ""}
          </p>
        </div>
      )}

      {client && <SyncOptions />}
      {isDesktop() && <LocalServer />}
    </div>
  );
}

function SyncOptions() {
  const options = useStore((s) => s.syncOptions);
  const set = useStore((s) => s.setSyncOptions);
  const rows: { key: keyof typeof options; label: string; hint: string }[] = [
    { key: "favorites", label: "Favourites", hint: "Hearts on channels, movies and series." },
    {
      key: "history",
      label: "Continue watching",
      hint: "Where you stopped in movies and episodes.",
    },
    {
      key: "sources",
      label: "Sources",
      hint: "Your Xtream logins and playlists. They are stored on your server, so only enable this for a server you own.",
    },
  ];
  return (
    <div className="px-5 py-4">
      <p className="mb-3 font-medium">Sync across devices</p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm">{r.label}</p>
              <p className="text-xs text-muted">{r.hint}</p>
            </div>
            <Toggle
              label={r.label}
              checked={options[r.key]}
              onChange={(v) => set({ [r.key]: v })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Starts the server that ships with the desktop app, so phones and TVs can use this PC. */
function LocalServer() {
  const setCloud = useStore((s) => s.setCloud);
  const notify = useStore((s) => s.notify);
  const [status, setStatus] = useState<{ running: boolean; available: boolean } | null>(null);
  const [mode, setMode] = useState<"lite" | "full">("lite");
  const [port, setPort] = useState("8484");
  const [lan, setLan] = useState(false);

  useEffect(() => {
    void invoke<{ running: boolean; available: boolean }>("server_status")
      .then(setStatus)
      .catch(() => setStatus({ running: false, available: false }));
  }, []);
  if (!status?.available) return null;

  const toggle = async () => {
    try {
      if (status.running) await invoke("server_stop");
      else {
        await invoke("server_start", { port: Number(port), mode, lan });
        const url = `http://127.0.0.1:${port}`;
        const info = await makeClient(url, null).info();
        const user = info.mode === "lite" ? await makeClient(url, null).me() : null;
        setCloud({ url, token: null, user, info });
        notify(
          info.mode === "full"
            ? "Server started. Open /admin/ to set it up."
            : "Server started and connected.",
        );
      }
    } catch (e) {
      notify(String(e));
    } finally {
      setStatus(
        await invoke<{ running: boolean; available: boolean }>("server_status").catch(() => status),
      );
    }
  };

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            <MonitorIcon size={16} color="currentColor" /> Run a server on this PC
          </p>
          <p className="text-xs text-muted">
            Record and sync through this computer. Turn on sharing to let your phone and TV connect
            with this PC's network address, for example 192.168.1.20:{port}.
          </p>
          {!status.running && (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={lan}
                onChange={(e) => setLan(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Share with other devices on my network
              {lan && mode === "lite" && (
                <span className="text-muted">· anyone on the network can use a Lite server</span>
              )}
            </label>
          )}
        </div>
        {!status.running && (
          <>
            <select
              aria-label="Server mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "lite" | "full")}
              className="rounded-full border border-line bg-panel px-3 py-2 text-sm"
            >
              <option value="lite">Lite (no accounts)</option>
              <option value="full">Full (accounts + admin)</option>
            </select>
            <input
              aria-label="Port"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              className="w-20 rounded-full border border-line bg-panel px-3 py-2 text-sm"
            />
          </>
        )}
        <Button variant={status.running ? "danger" : "primary"} onClick={() => void toggle()}>
          {status.running ? "Stop server" : "Start server"}
        </Button>
      </div>
    </div>
  );
}
