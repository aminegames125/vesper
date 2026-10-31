import { useEffect, useMemo, useState } from "react";
import { ChannelCard, PosterCard, Rail } from "../components/cards";
import { PlayIcon } from "../components/icons";
import { Button } from "../components/ui";
import { moviePlayable } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Movie, Show } from "../lib/types";
import { NoSources } from "./no-sources";

const percent = (position: number, duration: number) =>
  Math.min(100, Math.round((position / Math.max(1, duration)) * 100));

export function Home() {
  const channels = useStore((s) => s.channels);
  const movies = useStore((s) => s.movies);
  const shows = useStore((s) => s.shows);
  const recents = useStore((s) => s.recents);
  const favorites = useStore((s) => s.favorites);
  const history = useStore((s) => s.history);
  const play = useStore((s) => s.play);
  const setView = useStore((s) => s.setView);

  const recentChannels = useMemo(
    () => recents.map((id) => channels.find((c) => c.id === id)).filter((c) => !!c),
    [recents, channels],
  );
  const favoriteChannels = useMemo(
    () => channels.filter((c) => favorites.includes(c.id)),
    [channels, favorites],
  );
  const newest = useMemo(
    () => [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 24),
    [movies],
  );
  const topShows = useMemo(
    () => [...shows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 24),
    [shows],
  );
  const featured = useMemo<Featured[]>(() => {
    const moviePicks = movies
      .filter((m) => m.poster)
      .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
      .slice(0, 3)
      .map((m): Featured => ({ kind: "movie", item: m, image: m.poster as string }));
    const showPicks = shows
      .filter((x) => x.cover)
      .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
      .slice(0, 3)
      .map((x): Featured => ({ kind: "show", item: x, image: x.cover as string }));
    return moviePicks.flatMap((m, i) => (showPicks[i] ? [m, showPicks[i]] : [m]));
  }, [movies, shows]);
  const top10 = useMemo(
    () =>
      [...movies, ...shows]
        .filter((x) => (x as Movie).poster || (x as Show).cover)
        .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
        .slice(0, 10),
    [movies, shows],
  );

  if (channels.length + movies.length + shows.length === 0) return <NoSources what="content" />;

  return (
    <div>
      <Billboard items={featured} />

      {history.length > 0 && (
        <Rail title="Continue watching">
          {history.slice(0, 12).map((h) => (
            <button
              key={h.item.id}
              type="button"
              onClick={() => play(h.item)}
              className="surface lift w-60 flex-none overflow-hidden text-left"
            >
              <span className="relative flex aspect-video items-center justify-center bg-raised">
                {h.item.poster && (
                  <img
                    decoding="async"
                    src={h.item.poster}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${percent(h.position, h.duration)}%` }}
                  />
                </span>
              </span>
              <span className="block truncate px-3 py-2.5 text-sm font-medium">{h.item.title}</span>
            </button>
          ))}
        </Rail>
      )}

      {recentChannels.length > 0 && (
        <Rail title="Recently watched">
          {recentChannels.slice(0, 12).map((c) => (
            <div key={c.id} className="w-60 flex-none">
              <ChannelCard channel={c} list={recentChannels} />
            </div>
          ))}
        </Rail>
      )}

      {favoriteChannels.length > 0 && (
        <Rail
          title="Favourite channels"
          action={
            <Button variant="ghost" onClick={() => setView("favorites")}>
              See all
            </Button>
          }
        >
          {favoriteChannels.slice(0, 12).map((c) => (
            <div key={c.id} className="w-60 flex-none">
              <ChannelCard channel={c} list={favoriteChannels} />
            </div>
          ))}
        </Rail>
      )}

      {channels.length > 0 && (
        <Rail
          title="Live now"
          action={
            <Button variant="ghost" onClick={() => setView("live")}>
              All channels
            </Button>
          }
        >
          {channels.slice(0, 14).map((c) => (
            <div key={c.id} className="w-60 flex-none">
              <ChannelCard channel={c} list={channels} />
            </div>
          ))}
        </Rail>
      )}

      {top10.length >= 5 && (
        <Rail title="Top 10 on Vesper">
          {top10.map((x, i) => (
            <div key={x.id} className="w-44 flex-none">
              <PosterCard kind={"poster" in x ? "movie" : "show"} item={x} rank={i + 1} />
            </div>
          ))}
        </Rail>
      )}

      {newest.length > 0 && (
        <Rail
          title="New movies"
          action={
            <Button variant="ghost" onClick={() => setView("movies")}>
              See all
            </Button>
          }
        >
          {newest.map((m) => (
            <div key={m.id} className="w-40 flex-none">
              <PosterCard kind="movie" item={m} />
            </div>
          ))}
        </Rail>
      )}

      {topShows.length > 0 && (
        <Rail
          title="Top series"
          action={
            <Button variant="ghost" onClick={() => setView("series")}>
              See all
            </Button>
          }
        >
          {topShows.map((s) => (
            <div key={s.id} className="w-40 flex-none">
              <PosterCard kind="show" item={s} />
            </div>
          ))}
        </Rail>
      )}
    </div>
  );
}

type Featured = { kind: "movie" | "show"; item: Movie | Show; image: string };

/** A full-width featured title that rotates every few seconds, like the big streaming apps. */
function Billboard({ items }: { items: Featured[] }) {
  const play = useStore((s) => s.play);
  const openDetail = useStore((s) => s.openDetail);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  const current = items[index % Math.max(1, items.length)];
  if (!current) return null;
  const { item, kind } = current;
  const plot = (item as Show).plot;

  const playNow = () => {
    if (kind !== "movie") return openDetail("show", item.id);
    const auth = useStore.getState().providers.find((p) => p.id === item.providerId)?.xtream;
    if (auth) play(moviePlayable(item as Movie, auth));
  };

  return (
    <section
      className="relative -mx-1 mb-9 aspect-[21/9] min-h-72 overflow-hidden rounded-3xl bg-raised"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <img
        key={current.image}
        decoding="async"
        src={current.image}
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover object-top blur-sm"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
      <div className="absolute inset-y-0 left-0 flex max-w-2xl flex-col justify-end p-8 md:p-10">
        <p className="text-xs font-bold uppercase tracking-wider text-accent">
          {kind === "movie" ? "Featured movie" : "Featured series"}
        </p>
        <h2 className="mt-2 line-clamp-2 font-display text-4xl font-bold md:text-5xl">
          {item.name}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {[item.group, item.rating ? `★ ${item.rating.toFixed(1)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {plot && <p className="mt-3 line-clamp-2 text-sm text-paper/80">{plot}</p>}
        <div className="mt-5 flex gap-3">
          <Button variant="primary" icon={PlayIcon} onClick={playNow}>
            {kind === "movie" ? "Play" : "Watch"}
          </Button>
          <Button onClick={() => openDetail(kind, item.id)}>More info</Button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="absolute bottom-5 right-6 flex gap-1.5">
          {items.map((f, i) => (
            <button
              key={f.item.id}
              type="button"
              aria-label={`Show ${f.item.name}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-accent" : "w-2 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
