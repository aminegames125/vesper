import { CloudClient, type CloudUser, type ServerInfo } from "@vesper/cloud-client";
import { AnimatePresence } from "framer-motion";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "./logo";
import { AuditPage } from "./pages/audit";
import { Dashboard } from "./pages/dashboard";
import { DownloadsPage } from "./pages/downloads";
import { InvitesPage } from "./pages/invites";
import { LibraryPage } from "./pages/library";
import { PluginsPage } from "./pages/plugins";
import { SettingsPage } from "./pages/settings";
import { SyncPage } from "./pages/sync";
import { UsersPage } from "./pages/users";
import { useRoute } from "./router";
import { Shell } from "./shell";
import { Button, Field, Notice } from "./ui";
import { WatchHome } from "./watch/home";
import { Library } from "./watch/library";
import { LiveTv } from "./watch/live";
import { Player } from "./watch/player";

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

export function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [token, setToken] = useState<string | null>(readToken);
  const [error, setError] = useState<string | null>(null);

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
        <LogoMark size={44} />
        <p className="mt-4 max-w-sm text-accent">{error}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Centered>
    );
  if (!info)
    return (
      <Centered>
        <LogoMark size={52} animate />
      </Centered>
    );

  if (!user) return <SignIn client={client} info={info} onSession={signedIn} />;

  return <Workspace client={client} info={info} user={user} onSignOut={signOut} />;
}

function Workspace({
  client,
  info,
  user,
  onSignOut,
}: {
  client: CloudClient;
  info: ServerInfo;
  user: CloudUser;
  onSignOut: () => void;
}) {
  const isAdmin = user.role === "admin";
  const { route: wanted, go } = useRoute(isAdmin ? "manage" : "watch");
  // Accounts that are not administrators only ever see the viewer.
  const route = isAdmin ? wanted : { ...wanted, space: "watch" as const };
  const lite = info.mode === "lite";

  let content: ReactNode;
  if (route.space === "manage") {
    content = {
      overview: <Dashboard client={client} go={go} />,
      users: <UsersPage client={client} me={user} />,
      invites: <InvitesPage client={client} />,
      library: <LibraryPage client={client} />,
      downloads: <DownloadsPage client={client} />,
      sync: <SyncPage client={client} />,
      plugins: <PluginsPage client={client} />,
      activity: <AuditPage client={client} />,
      settings: <SettingsPage client={client} lite={lite} />,
    }[route.page] ?? <Dashboard client={client} go={go} />;
  } else {
    const open = (id: string) => go("watch", "play", id);
    content = {
      home: <WatchHome client={client} user={user} onPlay={open} go={go} />,
      library: <Library client={client} onPlay={open} />,
      live: <LiveTv client={client} onWatch={(id) => go("watch", "tv", id)} />,
    }[route.page] ?? <WatchHome client={client} user={user} onPlay={open} go={go} />;
  }

  const playing = route.space === "watch" && route.page === "play" ? route.param : undefined;
  // A channel being watched live (`#/watch/tv/<session>`), played over the Live TV page.
  const watching = route.space === "watch" && route.page === "tv" ? route.param : undefined;

  return (
    <>
      <Shell
        route={
          playing ? { ...route, page: "library" } : watching ? { ...route, page: "live" } : route
        }
        go={go}
        info={info}
        user={user}
        isAdmin={isAdmin}
        onSignOut={onSignOut}
      >
        {playing ? (
          <Library client={client} onPlay={(id) => go("watch", "play", id)} />
        ) : watching ? (
          <LiveTv client={client} onWatch={(id) => go("watch", "tv", id)} />
        ) : (
          content
        )}
      </Shell>
      <AnimatePresence>
        {playing && (
          <Player
            key={playing}
            client={client}
            id={playing}
            onClose={() => go("watch", "library")}
            onPlay={(id) => go("watch", "play", id)}
          />
        )}
        {watching && (
          <Player
            key={watching}
            client={client}
            id={watching}
            onClose={() => {
              void client.endWatch(watching);
              go("watch", "live");
            }}
            onPlay={(id) => go("watch", "play", id)}
            onRecord={async () => {
              await client.patchRecording(watching, { tag: "", keep_hours: 168 });
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
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
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-line bg-panel p-8 text-left"
      >
        <div className="mb-7 flex items-center gap-3">
          <LogoMark size={36} animate />
          <div>
            <h1 className="text-xl font-bold leading-none">
              {setup ? "Set up Vesper" : "Sign in"}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {info.mode === "lite" ? "Lite" : "Cloud"} {info.version}
            </p>
          </div>
        </div>
        {setup && (
          <p className="mb-5 text-sm text-muted">
            Create the first administrator. You can add other users afterwards.
          </p>
        )}
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
          <Notice>{error}</Notice>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
