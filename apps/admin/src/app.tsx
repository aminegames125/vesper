import { CloudClient, type CloudUser, type ServerInfo } from "@vesper/cloud-client";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "./logo";
import { AuditPage } from "./pages/audit";
import { Dashboard } from "./pages/dashboard";
import { InvitesPage } from "./pages/invites";
import { RecordingsPage } from "./pages/recordings";
import { SettingsPage } from "./pages/settings";
import { UsersPage } from "./pages/users";
import { Button, Field } from "./ui";

const TOKEN_KEY = "vesper-admin-token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* the session just will not survive a reload */
  }
};

type Page = "dashboard" | "users" | "invites" | "recordings" | "audit" | "settings";

const PAGES: { id: Page; label: string; full?: boolean }[] = [
  { id: "dashboard", label: "Overview" },
  { id: "users", label: "Users", full: true },
  { id: "invites", label: "Invites", full: true },
  { id: "recordings", label: "Recordings" },
  { id: "audit", label: "Activity" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [token, setToken] = useState<string | null>(readToken);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>("dashboard");

  const client = useMemo(() => new CloudClient({ token }), [token]);

  const signOut = useCallback(() => {
    void client.logout().catch(() => {});
    writeToken(null);
    setToken(null);
    setUser(null);
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const server = await client.info();
        if (cancelled) return;
        setInfo(server);
        if (server.mode === "lite" || token) {
          const me = await client.me().catch(() => null);
          if (!cancelled) {
            setUser(me);
            if (!me && token) {
              writeToken(null);
              setToken(null);
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  const signedIn = (session: { token: string; user: CloudUser }) => {
    writeToken(session.token);
    setToken(session.token);
    setUser(session.user);
  };

  if (error)
    return (
      <Centered>
        <p className="text-accent">{error}</p>
      </Centered>
    );
  if (!info)
    return (
      <Centered>
        <span className="size-7 animate-spin rounded-full border-2 border-line border-t-accent" />
      </Centered>
    );

  if (!user) return <SignIn client={client} info={info} onSession={signedIn} />;

  if (user.role !== "admin") {
    return (
      <Centered>
        <p className="mb-4">
          This panel is for administrators. You are signed in as {user.username}.
        </p>
        <Button onClick={signOut}>Sign out</Button>
      </Centered>
    );
  }

  const lite = info.mode === "lite";
  const content = {
    dashboard: <Dashboard client={client} />,
    users: <UsersPage client={client} me={user} />,
    invites: <InvitesPage client={client} />,
    recordings: <RecordingsPage client={client} />,
    audit: <AuditPage client={client} />,
    settings: <SettingsPage client={client} lite={lite} />,
  }[page];

  return (
    <div className="flex h-full">
      <nav className="flex w-56 flex-none flex-col border-r border-line bg-panel p-4">
        <div className="mb-6 flex items-center gap-3 px-2">
          <LogoMark size={30} />
          <div>
            <p className="font-display text-lg font-bold leading-none">Vesper</p>
            <p className="text-xs text-muted">
              Cloud · {info.mode} · v{info.version}
            </p>
          </div>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {PAGES.filter((p) => !p.full || !lite).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPage(p.id)}
                aria-current={page === p.id ? "page" : undefined}
                className="w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-paper aria-[current=page]:bg-tint aria-[current=page]:text-accent"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
        {lite ? (
          <p className="rounded-xl bg-raised p-3 text-xs text-muted">
            Lite server: anyone on your network can use it. Switch to full mode for accounts.
          </p>
        ) : (
          <div className="border-t border-line pt-3 text-sm">
            <p className="truncate px-2 font-medium">{user.username}</p>
            <Button variant="ghost" className="mt-1 w-full" onClick={signOut}>
              Sign out
            </Button>
          </div>
        )}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-8">{content}</main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}

function SignIn({
  client,
  info,
  onSession,
}: {
  client: CloudClient;
  info: ServerInfo;
  onSession: (s: { token: string; user: CloudUser }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = info.needsSetup;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSession(
        await (setup ? client.setup(username, password) : client.login(username, password)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <form onSubmit={submit} className="surface w-full max-w-sm p-8 text-left">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={48} />
          <h1 className="mt-4 text-2xl font-bold">
            {setup ? "Set up Vesper Cloud" : "Admin sign in"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {setup
              ? "Create the first administrator. You can add users afterwards."
              : `Vesper Cloud v${info.version}`}
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <Field
            label="Username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            required
            autoComplete={setup ? "new-password" : "current-password"}
            hint={setup ? "At least 8 characters." : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}
          </Button>
        </div>
      </form>
    </Centered>
  );
}
