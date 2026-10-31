import { useMemo, useRef, useState } from "react";
import { ChannelLogo, cleanName } from "../components/cards";
import { HeartIcon, IconButton, PlayIcon } from "../components/icons";
import { Paged } from "../components/paged";
import { formatClock, nowNext } from "../lib/epg";
import { useGuide, useSeen } from "../lib/guide-cache";
import { groupBy } from "../lib/m3u";
import { channelPlayable } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Channel } from "../lib/types";
import { NoSources } from "./no-sources";

const FAVOURITES = "\u0000favourites";

/**
 * Live TV as three panes: categories, the channel list, and a preview of the channel you are on.
 * Clicking selects, double-clicking (or the Watch button) plays.
 */
export function Live() {
  const channels = useStore((s) => s.channels);
  const favorites = useStore((s) => s.favorites);
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const groups = useMemo(() => groupBy(channels), [channels]);
  const shownGroups = groups.filter(([name]) =>
    name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const visible = useMemo(() => {
    let list = channels;
    if (group === FAVOURITES) list = list.filter((c) => favorites.includes(c.id));
    else if (group) list = list.filter((c) => c.group === group);
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query));
    return list;
  }, [channels, group, favorites, query]);

  if (channels.length === 0) return <NoSources />;

  const selected = visible.find((c) => c.id === selectedId) ?? visible[0];
  const title = group === FAVOURITES ? "Favourites" : group === "" ? "All channels" : group;

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-[13.5rem_minmax(0,1fr)_23rem] gap-8 max-xl:grid-cols-[13.5rem_minmax(0,1fr)] max-lg:grid-cols-[minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col max-lg:hidden">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a category"
          aria-label="Find a category"
          className="mb-3 rounded-xl bg-raised px-3.5 py-2 text-sm placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
          <li>
            <Category
              label="All channels"
              count={channels.length}
              active={group === ""}
              onClick={() => setGroup("")}
            />
          </li>
          {favorites.length > 0 && (
            <li>
              <Category
                label="Favourites"
                count={channels.filter((c) => favorites.includes(c.id)).length}
                active={group === FAVOURITES}
                onClick={() => setGroup(FAVOURITES)}
              />
            </li>
          )}
          {shownGroups.map(([name, list]) => (
            <li key={name}>
              <Category
                label={name}
                count={list.length}
                active={group === name}
                onClick={() => setGroup(name)}
              />
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <h1 className="mb-4 flex items-baseline gap-3 text-3xl font-bold">
          {title}
          <span className="text-sm font-medium text-muted tabular-nums">
            {visible.length.toLocaleString()}
          </span>
        </h1>
        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {visible.length === 0 ? (
            <p className="py-10 text-muted">
              No channels here. Try another category or clear the search.
            </p>
          ) : (
            <Paged
              items={visible}
              list
              pageSize={80}
              render={(c) => (
                <LiveRow
                  channel={c}
                  list={visible}
                  active={c.id === selected?.id}
                  onSelect={() => setSelectedId(c.id)}
                />
              )}
            />
          )}
        </div>
      </section>

      {selected && <Preview key={selected.id} channel={selected} list={visible} />}
    </div>
  );
}

function Category({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className="fade flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:text-paper aria-[current=true]:bg-paper aria-[current=true]:font-semibold aria-[current=true]:text-ink"
    >
      <span className="truncate">{label}</span>
      <span className="text-xs tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function LiveRow({
  channel,
  list,
  active,
  onSelect,
}: {
  channel: Channel;
  list: Channel[];
  active: boolean;
  onSelect: () => void;
}) {
  const play = useStore((s) => s.play);
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useSeen(ref);
  const guide = useGuide(channel, seen, 3);
  const { now, progress } = nowNext(guide ?? []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onDoubleClick={() => play(channelPlayable(channel), list)}
      aria-current={active ? "true" : undefined}
      className="fade flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-raised aria-[current=true]:bg-raised aria-[current=true]:ring-1 aria-[current=true]:ring-line"
    >
      <ChannelLogo channel={channel} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{cleanName(channel.name)}</span>
        <span className="block h-4 truncate text-xs text-muted">{now?.title ?? channel.group}</span>
        {now && (
          <span className="mt-1 block h-0.5 overflow-hidden rounded bg-line">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        )}
      </span>
    </button>
  );
}

/** The right-hand pane: a large look at the channel, what is on and what comes next. */
function Preview({ channel, list }: { channel: Channel; list: Channel[] }) {
  const play = useStore((s) => s.play);
  const favourite = useStore((s) => s.favorites.includes(channel.id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const guide = useGuide(channel, true, 6);
  const { now, next, progress } = nowNext(guide ?? []);
  const upcoming = (guide ?? []).filter((p) => p.start > Date.now() / 1000).slice(1, 4);

  return (
    <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto max-xl:hidden">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-panel">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-accent/15 to-transparent"
        />
        {channel.logo ? (
          <img src={channel.logo} alt="" className="relative size-full object-contain p-8" />
        ) : (
          <span className="relative font-display text-5xl font-bold text-muted">
            {cleanName(channel.name).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-bold">{cleanName(channel.name)}</h2>
        <p className="mt-1 text-sm text-muted">{channel.group}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => play(channelPlayable(channel), list)}
          className="fade inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-semibold text-on-accent hover:brightness-110"
        >
          <PlayIcon size={16} color="currentColor" isAnimated={false} /> Watch live
        </button>
        <IconButton
          icon={HeartIcon}
          label={favourite ? "Remove from favourites" : "Add to favourites"}
          active={favourite}
          onClick={() => toggleFavorite(channel.id)}
        />
      </div>

      <div className="rounded-2xl bg-panel p-4">
        {now ? (
          <>
            <p className="text-xs text-muted tabular-nums">
              Now · {formatClock(now.start)} – {formatClock(now.end)}
            </p>
            <p className="mt-1 font-semibold">{now.title}</p>
            <span className="my-3 block h-1 overflow-hidden rounded bg-line">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            {now.description && (
              <p className="line-clamp-4 text-sm text-muted">{now.description}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">No programme information for this channel.</p>
        )}
      </div>

      {(next || upcoming.length > 0) && (
        <ul className="flex flex-col gap-3 text-sm">
          {[next, ...upcoming].filter(Boolean).map((p) => (
            <li key={p?.id} className="flex gap-3">
              <span className="w-12 flex-none text-muted tabular-nums">
                {p && formatClock(p.start)}
              </span>
              <span className="truncate">{p?.title}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
