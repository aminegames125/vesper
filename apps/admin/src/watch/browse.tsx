import {
  type Channel,
  type CloudClient,
  type CloudRecording,
  formatBytes,
} from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { EmptyState, useToast } from "../kit";
import { EASE, useReveal } from "../motion";
import { Badge, Button, Modal, PageHeader, Progress, Segmented, Select, Skeleton } from "../ui";

type Kind = "movie" | "series";

const PAGE = 48;
const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");

/** Movies and series from your playlists: save one to the server, then watch it anywhere. */
export function BrowsePage({
  client,
  onPlay,
}: {
  client: CloudClient;
  onPlay: (id: string) => void;
}) {
  const say = useToast();
  const [kind, setKind] = useState<Kind>("movie");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [items, setItems] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState<string | null>(null);
  const [picked, setPicked] = useState<Channel | null>(null);
  const grid = useRef<HTMLUListElement>(null);
  useReveal(grid, `${kind}-${search}-${group}-${items.length === 0 ? "none" : "some"}`);

  // What is already on the server, so cards can say "saving" or "saved".
  const saved = useLoad(() => client.listRecordings({ kind: "download" }), 5000);
  const byTitle = new Map<string, CloudRecording>();
  for (const r of saved.data?.recordings ?? []) {
    const old = byTitle.get(r.title);
    if (!old || r.createdAt > old.createdAt) byTitle.set(r.title, r);
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const r = await client.channels("all", { kind, q: search, group, offset, limit: PAGE });
        setItems((old) => (offset ? [...old, ...r.channels] : r.channels));
        setTotal(r.total);
        setGroups(r.groups);
        setEmpty(null);
      } catch (e) {
        if (!offset) {
          setItems([]);
          setTotal(0);
        }
        const text = message(e);
        if (/playlist/i.test(text)) setEmpty(text);
        else say(text, "error");
      } finally {
        setLoading(false);
      }
    },
    [client, kind, search, group, say],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const change = (next: Kind) => {
    setKind(next);
    setGroup("");
    setItems([]);
  };

  return (
    <div>
      <PageHeader
        title="Movies & shows"
        lead="Pick something from your playlists and save it to the server. Saved titles play on any device, even when your provider is slow."
        actions={
          <Segmented<Kind>
            id="browse-kind"
            value={kind}
            onChange={change}
            options={[
              { value: "movie", label: "Movies" },
              { value: "series", label: "Series" },
            ]}
          />
        }
      />

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
            placeholder={kind === "movie" ? "Search movies" : "Search series and episodes"}
            aria-label="Search"
            className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-4 text-base placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <Select label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </div>

      {empty ? (
        <EmptyState icon="film" title="No playlists yet">
          {empty} Add one under Live TV, then movies and series show up here.
        </EmptyState>
      ) : loading && !items.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState icon="film" title={kind === "movie" ? "No movies found" : "No series found"}>
          {search || group
            ? "Nothing matches. Try a shorter search or another group."
            : "Your playlists have no titles of this kind. Providers usually mark them with groups like VOD or Series."}
        </EmptyState>
      ) : (
        <>
          <ul
            ref={grid}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {items.map((c) => (
              <li key={`${c.name}-${c.url}`} data-reveal>
                <Card channel={c} rec={byTitle.get(c.name)} onOpen={() => setPicked(c)} />
              </li>
            ))}
          </ul>
          {items.length < total && (
            <div className="mt-8 flex justify-center">
              <Button disabled={loading} onClick={() => void load(items.length)}>
                {loading ? "Loading…" : `Show more (${total - items.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {picked && (
          <Detail
            key={picked.url}
            client={client}
            channel={picked}
            rec={byTitle.get(picked.name)}
            onSaved={() => void saved.reload()}
            onPlay={(id) => {
              setPicked(null);
              onPlay(id);
            }}
            onClose={() => setPicked(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** The word shown on a card for what the server has done with a title. */
function state(rec: CloudRecording | undefined) {
  if (!rec) return null;
  if (rec.status === "done") return { tone: "ok" as const, text: "Saved" };
  if (rec.status === "failed") return { tone: "accent" as const, text: "Failed" };
  return { tone: "dusk" as const, text: rec.status === "queued" ? "Waiting" : "Saving" };
}

function Card({
  channel,
  rec,
  onOpen,
}: {
  channel: Channel;
  rec: CloudRecording | undefined;
  onOpen: () => void;
}) {
  const s = state(rec);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="group block w-full text-left"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-raised ring-1 ring-line transition-colors group-hover:ring-accent">
        <Poster channel={channel} />
        <div className="scrim absolute inset-x-0 bottom-0 h-1/3 opacity-70" />
        {s && (
          <div className="absolute left-2 top-2">
            <Badge tone={s.tone}>{s.text}</Badge>
          </div>
        )}
        {rec?.status === "recording" && rec.totalBytes ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, (rec.bytes / rec.totalBytes) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      <p className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug">{channel.name}</p>
      <p className="truncate text-sm text-muted">{channel.group || "Library"}</p>
    </motion.button>
  );
}

function Poster({ channel }: { channel: Channel }) {
  const [broken, setBroken] = useState(false);
  if (!channel.logo || broken) {
    return (
      <div className="grid size-full place-items-center bg-raised p-4 text-center">
        <div>
          <Icon name="film" size={30} className="mx-auto text-accent" />
          <p className="mt-3 line-clamp-4 text-sm font-medium text-muted">{channel.name}</p>
        </div>
      </div>
    );
  }
  return (
    <img
      src={channel.logo}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function Detail({
  client,
  channel,
  rec,
  onSaved,
  onPlay,
  onClose,
}: {
  client: CloudClient;
  channel: Channel;
  rec: CloudRecording | undefined;
  onSaved: () => void;
  onPlay: (id: string) => void;
  onClose: () => void;
}) {
  const say = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await client.createDownload({ title: channel.name, url: channel.url });
      setSent(true);
      onSaved();
      say(`Saving ${channel.name} to the server.`);
    } catch (e) {
      say(message(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const working = rec && (rec.status === "queued" || rec.status === "recording");
  const done = rec?.status === "done";
  const failed = rec?.status === "failed";
  const pct = rec?.totalBytes ? Math.min(1, rec.bytes / rec.totalBytes) : 0;

  return (
    <Modal title={channel.name} onClose={onClose}>
      <div className="flex gap-5">
        <div className="hidden w-32 flex-none overflow-hidden rounded-xl bg-raised ring-1 ring-line sm:block">
          <div className="aspect-[2/3]">
            <Poster channel={channel} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Badge>{channel.kind === "series" ? "Series episode" : "Movie"}</Badge>
            {channel.group && <Badge tone="dusk">{channel.group}</Badge>}
            {done && <Badge tone="ok">Saved on the server</Badge>}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            Vesper saves this title on your server, so it plays on any device, resumes where you
            stopped and does not depend on your provider afterwards.
          </p>

          {working && (
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">
                  {rec.status === "queued" ? "Waiting for a free slot…" : "Saving to the server…"}
                </span>
                <span className="tabular text-muted">
                  {formatBytes(rec.bytes)}
                  {rec.totalBytes ? ` of ${formatBytes(rec.totalBytes)}` : ""}
                </span>
              </div>
              <Progress value={pct || 0.04} />
            </div>
          )}
          {failed && (
            <p className="mt-5 rounded-lg border border-accent/40 bg-tint px-4 py-3 text-sm text-accent">
              {rec.error || "The last attempt failed."} You can try again.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {done ? (
              <Button variant="primary" icon="play" onClick={() => onPlay(rec.id)}>
                Play
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="download"
                disabled={busy || Boolean(working) || sent}
                onClick={() => void save()}
              >
                {working || sent ? "Saving…" : failed ? "Try again" : "Save to server"}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
