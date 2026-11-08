import type { Channel, CloudClient, GuideHit, Programme } from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { ActionMenu, EmptyState, type MenuItem, Stat, useToast } from "../kit";
import { EASE, useReveal } from "../motion";
import { Button, PageHeader, Progress, Segmented, Skeleton, when } from "../ui";
import {
  channelFor,
  clock,
  dayLabel,
  FAVORITES_KEY,
  message,
  type RecordMode,
  recordProgramme,
  useWatchChannel,
} from "./guide/shared";

type View = "channel" | "search";

const PAGE = 100;

/** The TV guide: pick a channel, see what is on, and record a programme once or on repeat. */
export function GuidePage({ client }: { client: CloudClient; onPlay: (id: string) => void }) {
  const say = useToast();
  const status = useLoad(() => client.guideStatus());
  const [view, setView] = useState<View>("channel");
  const [refreshing, setRefreshing] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  useReveal(page, status.data ? "ready" : "loading");

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await client.refreshGuide();
      say(`Guide updated: ${r.programmes.toLocaleString()} programmes.`);
      await status.reload();
    } catch (e) {
      const text = message(e);
      say(
        /forbidden|admin|403/i.test(text) ? "Only an administrator can refresh the guide." : text,
        "error",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const g = status.data;
  const ready = Boolean(g?.configured && g.programmes > 0);

  return (
    <div ref={page}>
      <PageHeader
        title="TV guide"
        lead="See what is on, then record a programme once, every day, every week or every episode."
        actions={
          <>
            <Button
              icon="sync"
              disabled={refreshing || !g?.configured}
              onClick={() => void refresh()}
            >
              {refreshing ? "Updating…" : "Refresh guide"}
            </Button>
            <Segmented<View>
              id="guide-view"
              value={view}
              onChange={setView}
              options={[
                { value: "channel", label: "By channel" },
                { value: "search", label: "Search" },
              ]}
            />
          </>
        }
      />

      {status.data === null && !status.error ? (
        <Skeleton className="h-24" />
      ) : g && ready ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Channels in the guide" value={g.channels.toLocaleString()} icon="live" />
          <Stat label="Programmes" value={g.programmes.toLocaleString()} icon="calendar" />
          <Stat
            label="Last updated"
            value={<span className="text-[length:var(--text-xl)]">{when(g.updatedAt)}</span>}
            icon="clock"
          />
        </div>
      ) : (
        <div className="mb-6" data-reveal>
          <EmptyState icon="calendar" title="No guide yet">
            {g?.configured
              ? "A guide address is set but nothing has been loaded. Press Refresh guide to fetch it."
              : "The guide comes from an XMLTV address. If you are an administrator, add it under Manage, then Settings. Until then you can still record any channel from Live TV."}
          </EmptyState>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        >
          {view === "channel" ? (
            <ByChannel client={client} guideReady={ready} />
          ) : (
            <SearchGuide client={client} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** The record split-menu: one main action plus the repeating choices. */
function RecordMenu({
  programme,
  disabled,
  onRecord,
}: {
  programme: Programme;
  disabled?: boolean;
  onRecord: (mode: RecordMode) => void;
}) {
  const airing = programme.startAt <= Date.now() / 1000;
  const items: MenuItem[] = [
    {
      label: airing ? "Record from now until it ends" : "Record this programme",
      icon: "rec",
      onClick: () => onRecord("once"),
    },
    {
      label: "Record every week at this time",
      icon: "calendar",
      onClick: () => onRecord("weekly"),
    },
    { label: "Record every day at this time", icon: "clock", onClick: () => onRecord("daily") },
    { label: "Record every episode", icon: "sync", onClick: () => onRecord("series") },
  ];
  return (
    <div className="flex flex-none items-center gap-1">
      <Button icon="rec" disabled={disabled} onClick={() => onRecord("once")}>
        Record
      </Button>
      <ActionMenu items={items} label={`More ways to record ${programme.title}`} />
    </div>
  );
}

function Logo({ channel }: { channel: Pick<Channel, "logo"> }) {
  return (
    <span className="grid size-10 flex-none place-items-center overflow-hidden rounded-lg bg-sunken">
      {channel.logo ? (
        <img
          src={channel.logo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-1"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Icon name="live" size={18} className="text-muted" />
      )}
    </span>
  );
}

function ByChannel({ client, guideReady }: { client: CloudClient; guideReady: boolean }) {
  const say = useToast();
  const { watch, tuning } = useWatchChannel(client);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [guideId, setGuideId] = useState("");
  const [recording, setRecording] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Favorites follow the account (the same store Live TV writes to).
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

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const r = await client.channels("all", { q: search, kind: "live", offset, limit: PAGE });
        setItems((old) => (offset ? [...old, ...r.channels] : r.channels));
        setTotal(r.total);
      } catch (e) {
        if (!offset) setItems([]);
        const text = message(e);
        // "Add a playlist first." is a state, not a failure.
        if (!/playlist/i.test(text)) say(text, "error");
      } finally {
        setLoading(false);
      }
    },
    [client, search, say],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const list = useMemo(() => {
    if (search) return items;
    const favNames = new Set(favorites.map((f) => f.name));
    return [...favorites, ...items.filter((c) => !favNames.has(c.name))];
  }, [items, favorites, search]);

  useEffect(() => {
    if (!selected && list.length) setSelected(list[0] ?? null);
  }, [list, selected]);

  // What is on the selected channel, from half an hour ago to tomorrow.
  useEffect(() => {
    if (!selected || !guideReady) {
      setProgrammes(guideReady ? null : []);
      return;
    }
    let alive = true;
    setProgrammes(null);
    const from = Math.floor(Date.now() / 1000) - 1800;
    void client
      .guide({ epgId: selected.id, name: selected.name, from, to: from + 26 * 3600 })
      .then((r) => {
        if (!alive) return;
        setGuideId(r.channelId ?? "");
        setProgrammes(r.programmes);
      })
      .catch(() => alive && setProgrammes([]));
    return () => {
      alive = false;
    };
  }, [client, selected, guideReady]);

  // Keeps the "now" markers and progress bars honest.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const record = async (p: Programme, mode: RecordMode) => {
    if (!selected) return;
    setRecording(true);
    try {
      say(await recordProgramme(client, selected, p, mode, guideId || selected.id));
    } catch (e) {
      say(message(e), "error");
    } finally {
      setRecording(false);
    }
  };

  const goLive = async () => {
    if (!selected) return;
    try {
      await watch(selected);
    } catch (e) {
      say(message(e), "error");
    }
  };

  const now = Date.now() / 1000;
  const shown = (programmes ?? []).filter((p) => p.stopAt > now);
  const days = shown.reduce<{ day: string; rows: Programme[] }[]>((acc, p) => {
    const day = dayLabel(Math.max(p.startAt, now));
    const last = acc[acc.length - 1];
    if (last?.day === day) last.rows.push(p);
    else acc.push({ day, rows: [p] });
    return acc;
  }, []);

  if (!loading && !list.length) {
    return (
      <EmptyState icon="live" title="No channels to show">
        {search
          ? "No live channel matches that search."
          : "Add a playlist under Live TV and its channels appear here."}
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section aria-label="Channels" className="surface flex flex-col overflow-hidden">
        <div className="relative border-b border-line p-3">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels"
            aria-label="Search channels"
            className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5 lg:max-h-[68vh]">
          {loading && !list.length
            ? [0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="p-1.5">
                  <Skeleton className="h-12" />
                </li>
              ))
            : list.map((c) => {
                const on = selected?.name === c.name;
                const fav = favorites.some((f) => f.name === c.name);
                return (
                  <li key={`${c.name}-${c.url}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${on ? "bg-raised" : "hover:bg-raised/60"}`}
                    >
                      <Logo channel={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {c.group || "Live"}
                        </span>
                      </span>
                      {fav && <span className="text-accent">★</span>}
                    </button>
                  </li>
                );
              })}
        </ul>
        {items.length < total && (
          <div className="border-t border-line p-3">
            <Button className="w-full" disabled={loading} onClick={() => void load(items.length)}>
              {loading ? "Loading…" : `Show more (${total - items.length})`}
            </Button>
          </div>
        )}
      </section>

      <section aria-label="Programmes" className="min-w-0">
        {selected && (
          <div className="surface mb-4 flex flex-wrap items-center gap-4 p-4" data-reveal>
            <Logo channel={selected} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-bold">{selected.name}</h2>
              <p className="truncate text-sm text-muted">{selected.group || "Live"}</p>
            </div>
            <Button
              variant="primary"
              icon="play"
              disabled={tuning !== null}
              onClick={() => void goLive()}
            >
              {tuning === selected.name ? "Starting…" : "Watch live"}
            </Button>
          </div>
        )}

        {programmes === null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon="calendar" title="Nothing listed for this channel">
            {guideReady
              ? "The guide has no programmes for this channel. It may be named differently there."
              : "There is no guide to read yet, but you can still watch this channel live or record it from Live TV."}
          </EmptyState>
        ) : (
          <div className="space-y-6">
            {days.map(({ day, rows }) => (
              <div key={day}>
                <h3 className="mb-2 text-2xl font-bold text-paper">{day}</h3>
                <motion.ul layout className="surface divide-y divide-line overflow-hidden">
                  <AnimatePresence initial={false}>
                    {rows.map((p) => (
                      <ProgrammeRow
                        key={`${p.startAt}-${p.title}`}
                        programme={p}
                        now={now}
                        busy={recording}
                        onRecord={(mode) => void record(p, mode)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProgrammeRow({
  programme: p,
  now,
  busy,
  onRecord,
  channelName,
}: {
  programme: Programme;
  now: number;
  busy: boolean;
  onRecord: (mode: RecordMode) => void;
  channelName?: string;
}) {
  const [open, setOpen] = useState(false);
  const airing = p.startAt <= now;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="px-4 py-3.5"
    >
      <div className="flex items-start gap-4">
        <div className="w-16 flex-none pt-0.5 tabular">
          <p className="text-base font-semibold">{clock(p.startAt)}</p>
          <p className="text-sm text-muted">{clock(p.stopAt)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="min-w-0 break-words">{p.title}</span>
            {airing && (
              <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold uppercase text-on-accent">
                on now
              </span>
            )}
          </p>
          {channelName && <p className="text-sm text-muted">{channelName}</p>}
          {airing && (
            <div className="mt-2 max-w-sm">
              <Progress value={(now - p.startAt) / (p.stopAt - p.startAt)} />
              <p className="mt-1 text-sm text-muted">
                {Math.max(1, Math.round((p.stopAt - now) / 60))} min left
              </p>
            </div>
          )}
          {p.description && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-1.5 block text-left text-sm leading-relaxed text-muted hover:text-paper"
              aria-expanded={open}
            >
              <span className={open ? "" : "line-clamp-2"}>{p.description}</span>
            </button>
          )}
        </div>
        <RecordMenu programme={p} disabled={busy} onRecord={onRecord} />
      </div>
    </motion.li>
  );
}

function SearchGuide({ client }: { client: CloudClient }) {
  const say = useToast();
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<GuideHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const resolved = useRef(new Map<string, Channel>());

  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let alive = true;
    void client
      .searchGuide(term)
      .then((r) => alive && setHits(r.programmes))
      .catch((e) => {
        if (!alive) return;
        setHits([]);
        say(message(e), "error");
      });
    return () => {
      alive = false;
    };
  }, [client, term, say]);

  const record = async (hit: GuideHit, mode: RecordMode) => {
    setBusy(true);
    try {
      const key = `${hit.channelId}|${hit.channelName}`;
      let channel = resolved.current.get(key);
      if (!channel) {
        channel = await channelFor(client, hit.channelId, hit.channelName);
        resolved.current.set(key, channel);
      }
      say(await recordProgramme(client, channel, hit, mode, hit.channelId));
    } catch (e) {
      say(message(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now() / 1000;
  return (
    <div>
      <div className="relative mb-5 max-w-xl">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every channel for a programme"
          aria-label="Search the guide"
          className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-4 text-base placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>
      {hits === null ? (
        <EmptyState icon="search" title="Search the guide">
          Type at least two letters of a title, like a show or a match, to see when it is on.
        </EmptyState>
      ) : hits.length === 0 ? (
        <EmptyState icon="search" title="Nothing found">
          No upcoming programme has "{term}" in its title.
        </EmptyState>
      ) : (
        <ul className="surface divide-y divide-line overflow-hidden">
          <AnimatePresence initial={false}>
            {hits.map((h) => (
              <ProgrammeRow
                key={`${h.channelId}-${h.startAt}-${h.title}`}
                programme={h}
                now={now}
                busy={busy}
                channelName={`${h.channelName} · ${dayLabel(h.startAt)}`}
                onRecord={(mode) => void record(h, mode)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
