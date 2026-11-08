import type { Channel, CloudClient, Programme, Source } from "@vesper/cloud-client";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { Button, Empty, Field, Modal, Notice, PageHeader, Select, Skeleton, when } from "../ui";

const PAGE = 60;
/** How long to wait for the first picture before giving up on a channel. */
const TUNE_TIMEOUT = 45_000;

const DURATIONS = [
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "7200", label: "2 hours" },
  { value: "0", label: "Until I stop it" },
];

const hhmm = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const FAVORITES_KEY = "live:favorites";

const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");

/**
 * Live TV in the browser: browse the channels of your playlists, watch one now, record it now or
 * record a programme from the guide. Nothing here needs Kodi.
 */
export function LiveTv({
  client,
  onWatch,
}: {
  client: CloudClient;
  onWatch: (id: string) => void;
}) {
  const sources = useLoad(() => client.listSources());
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [items, setItems] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Channel | null>(null);
  const [managing, setManaging] = useState(false);
  const [favorites, setFavorites] = useState<Channel[]>([]);

  // Favorites live in the account's sync store, so they follow you to every device.
  useEffect(() => {
    let alive = true;
    void client
      .syncPull(0)
      .then((r) => {
        const saved = r.items.find((i) => i.key === FAVORITES_KEY)?.value;
        if (alive && Array.isArray(saved)) setFavorites(saved as Channel[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client]);

  const toggleFavorite = (channel: Channel) => {
    const has = favorites.some((f) => f.name === channel.name);
    const next = has
      ? favorites.filter((f) => f.name !== channel.name)
      : [...favorites, { ...channel, alt: channel.alt ?? [] }].slice(-60);
    setFavorites(next);
    void client.syncPush([{ key: FAVORITES_KEY, value: next }]).catch(() => {});
  };
  const isFavorite = (channel: Channel) => favorites.some((f) => f.name === channel.name);

  const have = sources.data?.sources ?? [];

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const r = await client.channels(source, {
          q: search,
          group,
          kind: "live",
          offset,
          limit: PAGE,
        });
        setItems((old) => (offset ? [...old, ...r.channels] : r.channels));
        setTotal(r.total);
        setGroups(r.groups);
        setError(null);
      } catch (e) {
        if (!offset) {
          setItems([]);
          setTotal(0);
        }
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [client, source, search, group],
  );

  useEffect(() => {
    if (sources.data && have.length) void load(0);
  }, [sources.data, have.length, load]);

  const sourcesChanged = async () => {
    await sources.reload();
    setSource("all");
  };

  const header = (
    <PageHeader
      title="Live TV"
      lead="Watch or record any channel from your playlists, right here."
      actions={
        <Button icon="plus" onClick={() => setManaging(true)}>
          {have.length ? "Playlists" : "Add a playlist"}
        </Button>
      }
    />
  );

  if (!sources.data && !sources.error)
    return (
      <div>
        {header}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      </div>
    );

  return (
    <div>
      {header}
      <Notice>{sources.error}</Notice>
      {!have.length ? (
        <div className="surface">
          <Empty>
            No playlists yet. Add the M3U link or the Xtream login your IPTV provider gave you and
            the channels show up here. If you use the Kodi add-on, its playlists appear
            automatically.
          </Empty>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <div className="relative min-w-52 flex-1 basis-64">
              <Icon
                name="search"
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels"
                aria-label="Search channels"
                className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            {have.length > 1 && (
              <Select
                label="Playlist"
                value={source}
                onChange={(e) => {
                  // A group of one playlist may not exist in another.
                  setSource(e.target.value);
                  setGroup("");
                }}
              >
                <option value="all">All playlists</option>
                {have.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            <Select label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          <Notice>{error}</Notice>
          {!loading && !items.length && !error && (
            <div className="surface">
              <Empty>No live channels match.</Empty>
            </div>
          )}

          {favorites.length > 0 && !search && !group && (
            <section className="mb-8" aria-label="Favorites">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                Favorites
              </h2>
              <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
                {favorites.map((c) => (
                  <li key={`fav-${c.name}`} className="w-40 flex-none snap-start">
                    <ChannelCard
                      channel={c}
                      favorite
                      onOpen={() => setPicked(c)}
                      onFavorite={() => toggleFavorite(c)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((c) => (
              <li key={`${c.url}`}>
                <ChannelCard
                  channel={c}
                  favorite={isFavorite(c)}
                  onOpen={() => setPicked(c)}
                  onFavorite={() => toggleFavorite(c)}
                />
              </li>
            ))}
          </ul>

          {items.length < total && (
            <div className="mt-6 flex justify-center">
              <Button disabled={loading} onClick={() => void load(items.length)}>
                {loading ? "Loading…" : `Show more (${total - items.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}

      {picked && (
        <ChannelModal
          client={client}
          channel={picked}
          favorite={isFavorite(picked)}
          onFavorite={() => toggleFavorite(picked)}
          onClose={() => setPicked(null)}
          onWatch={(id) => {
            setPicked(null);
            onWatch(id);
          }}
        />
      )}
      {managing && (
        <PlaylistsModal
          client={client}
          sources={have}
          onChanged={sourcesChanged}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  );
}

function ChannelCard({
  channel: c,
  favorite,
  onOpen,
  onFavorite,
}: {
  channel: Channel;
  favorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className="surface group relative h-full transition-colors hover:border-accent">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col items-center gap-3 p-4 text-center"
      >
        <span className="grid aspect-video w-full place-items-center overflow-hidden rounded-md bg-sunken">
          {c.logo ? (
            <img
              src={c.logo}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain p-2"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <Icon name="live" size={28} className="text-muted" />
          )}
        </span>
        <span className="w-full min-w-0">
          <span className="block truncate text-sm font-semibold">{c.name}</span>
          <span className="block truncate text-xs text-muted">{c.group || "Live"}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${c.name} from favorites` : `Add ${c.name} to favorites`}
        className={`absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-base leading-none transition-opacity hover:bg-black/75 focus-visible:opacity-100 ${favorite ? "text-accent opacity-100" : "text-white opacity-0 group-hover:opacity-100 max-sm:opacity-100"}`}
      >
        {favorite ? "★" : "☆"}
      </button>
    </div>
  );
}

function ChannelModal({
  client,
  channel,
  favorite,
  onFavorite,
  onClose,
  onWatch,
}: {
  client: CloudClient;
  channel: Channel;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onWatch: (id: string) => void;
}) {
  const [guide, setGuide] = useState<Programme[] | null>(null);
  const [seconds, setSeconds] = useState("3600");
  const [busy, setBusy] = useState<"tune" | "rec" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tuning = useRef<{ id: string | null; cancelled: boolean }>({ id: null, cancelled: false });

  useEffect(() => {
    const from = Math.floor(Date.now() / 1000) - 3600;
    void client
      .guide({ epgId: channel.id, name: channel.name, from, to: from + 14 * 3600 })
      .then((r) => setGuide(r.programmes))
      .catch(() => setGuide([]));
  }, [client, channel]);

  // Closing while the channel is still starting must not leave a session behind.
  useEffect(() => {
    const state = tuning.current;
    return () => {
      state.cancelled = true;
      if (state.id) void client.endWatch(state.id);
    };
  }, [client]);

  const watch = async () => {
    setBusy("tune");
    setError(null);
    const state = tuning.current;
    try {
      const { id } = await client.watchChannel(channel);
      state.id = id;
      const started = Date.now();
      while (!state.cancelled) {
        const rec = await client.getRecording(id);
        if (rec.status === "recording" && (await client.playlistReady(id))) {
          state.id = null; // the player owns it from here
          onWatch(id);
          return;
        }
        if (rec.status === "failed" || rec.status === "done") {
          throw new Error(rec.error || "The channel did not start.");
        }
        if (Date.now() - started > TUNE_TIMEOUT) {
          throw new Error("The channel took too long to start. Try another one.");
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      if (state.id) await client.endWatch(state.id);
      state.id = null;
      if (!state.cancelled) {
        setError(message(e));
        setBusy(null);
      }
    }
  };

  const record = async (
    title: string,
    body: { seconds: number; start_at?: number },
    note: string,
  ) => {
    setBusy("rec");
    setError(null);
    try {
      await client.createRecording({
        title,
        channel_name: channel.name,
        url: channel.url,
        backup_url: channel.alt[0],
        ...body,
      });
      setDone(note);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const now = Math.floor(Date.now() / 1000);
  const upcoming = (guide ?? []).filter((p) => p.stopAt > now).slice(0, 12);

  return (
    <Modal title={channel.name} onClose={onClose} wide>
      <Notice>{error}</Notice>
      {done && (
        <p className="mb-4 rounded-lg border border-line bg-sunken px-4 py-3 text-sm">{done}</p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Button variant="primary" icon="play" disabled={busy !== null} onClick={() => void watch()}>
          {busy === "tune" ? "Starting the channel…" : "Watch live"}
        </Button>
        <Button onClick={onFavorite} aria-pressed={favorite}>
          {favorite ? "★ Favorite" : "☆ Add to favorites"}
        </Button>
        <div className="flex items-end gap-2">
          <div className="w-44">
            <Select
              label="Record now"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              disabled={busy !== null}
            >
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            icon="rec"
            disabled={busy !== null}
            onClick={() =>
              void record(
                channel.name,
                { seconds: Number(seconds) },
                "Recording started. Watch it from the Library.",
              )
            }
          >
            Record
          </Button>
        </div>
      </div>
      {busy === "tune" && (
        <p className="mt-3 text-xs text-muted">
          The server is connecting to the channel. This usually takes a few seconds.
        </p>
      )}

      <h3 className="mb-2 mt-7 text-sm font-semibold">On this channel</h3>
      {guide === null ? (
        <Skeleton className="h-24" />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-muted">
          No guide for this channel. An admin can set the guide address under Manage, Settings.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {upcoming.map((p) => {
            const onNow = p.startAt <= now;
            return (
              <li key={`${p.startAt}-${p.title}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.title}
                    {onNow && (
                      <span className="ml-2 rounded bg-accent px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-on-accent">
                        now
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {onNow ? `until ${hhmm(p.stopAt)}` : when(p.startAt)}
                  </p>
                </div>
                <Button
                  icon="rec"
                  disabled={busy !== null}
                  onClick={() =>
                    // A minute early and a few minutes late, so the start and end are not cut off.
                    void record(
                      p.title,
                      onNow
                        ? { seconds: p.stopAt - now + 180 }
                        : { start_at: p.startAt - 60, seconds: p.stopAt - p.startAt + 240 },
                      onNow
                        ? `Recording ${p.title} until ${hhmm(p.stopAt)}.`
                        : `${p.title} will be recorded at ${hhmm(p.startAt)}.`,
                    )
                  }
                >
                  Record
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function PlaylistsModal({
  client,
  sources,
  onChanged,
  onClose,
}: {
  client: CloudClient;
  sources: Source[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"m3u" | "xtream">("m3u");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.createSource({
        name: name.trim() || "My playlist",
        kind,
        url: url.trim(),
        ...(kind === "xtream" ? { username: username.trim(), password } : {}),
      });
      setName("");
      setUrl("");
      setUsername("");
      setPassword("");
      await onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await client.deleteSource(id);
      await onChanged();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <Modal title="Playlists" onClose={onClose}>
      <Notice>{error}</Notice>
      {sources.length > 0 && (
        <ul className="mb-6 divide-y divide-line rounded-lg border border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="truncate text-xs text-muted">
                  {s.kind === "xtream" ? `Xtream · ${s.username}` : "M3U link"}
                </p>
              </div>
              <Button variant="danger" icon="trash" onClick={() => void remove(s.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-4">
        <h3 className="text-sm font-semibold">Add a playlist</h3>
        <div className="flex gap-2" role="tablist">
          {(["m3u", "xtream"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ring-1 ring-line ${kind === k ? "bg-accent text-on-accent" : "bg-sunken text-muted hover:text-paper"}`}
            >
              {k === "m3u" ? "M3U link" : "Xtream login"}
            </button>
          ))}
        </div>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label={kind === "m3u" ? "Playlist address" : "Server address"}
          type="url"
          required
          placeholder={kind === "m3u" ? "http://provider.example/playlist.m3u" : "http://host:8080"}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {kind === "xtream" && (
          <>
            <Field
              label="Username"
              required
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        <p className="text-xs text-muted">
          The playlist is stored on your server and read from there.
        </p>
        <Button type="submit" variant="primary" icon="plus" disabled={busy || !url.trim()}>
          {busy ? "Adding…" : "Add playlist"}
        </Button>
      </form>
    </Modal>
  );
}
