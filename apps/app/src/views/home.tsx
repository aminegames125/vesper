import { useEffect, useMemo, useState } from "react";
import { ChannelCard, cleanName, PosterCard, Rail } from "../components/cards";
import { PlayIcon } from "../components/icons";
import { Button } from "../components/ui";
import { nowNext } from "../lib/epg";
import { useGuide } from "../lib/guide-cache";
import { channelPlayable, moviePlayable } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Channel, Movie, Show } from "../lib/types";
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
  const hidden = useStore((s) => s.hiddenRows);
  const show = (id: string) => !hidden.includes(id);

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
  // Libraries with only live TV still deserve a full Home: one rail per category.
  const groups = useMemo(() => {
    if (movies.length + shows.length > 0) return [];
    const byGroup = new Map<string, typeof channels>();
    for (const c of channels) {
      const key = c.group.split(";")[0]?.trim() || "Other";
      byGroup.set(key, [...(byGroup.get(key) ?? []), c]);
    }
    return [...byGroup.entries()]
      .filter(([, list]) => list.length >= 6)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8);
  }, [channels, movies.length, shows.length]);
  const top10 = useMemo(
    () =>
      [...movies, ...shows]
        .filter((x) => (x as Movie).poster || (x as Show).cover)
        .sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
        .slice(0, 10),
    [movies, shows],
  );

  if (channels.length + movies.length + shows.length === 0)
    return (
      <div className="px-8 pt-24">
        <NoSources what="content" />
      </div>
    );

  return (
    <div className="pb-24 md:pb-10">
      {show("billboard") &&
        (featured.length > 0 ? <Hero items={featured} /> : <LiveHero channels={channels} />)}
      <div className="relative px-10 pt-6 max-md:px-4">
        {history.length > 0 && show("continue") && (
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
                <span className="block truncate px-3 py-2.5 text-sm font-medium">
                  {h.item.title}
                </span>
              </button>
            ))}
          </Rail>
        )}

        {recentChannels.length > 0 && show("recent") && (
          <Rail title="Recently watched">
            {recentChannels.slice(0, 12).map((c) => (
              <div key={c.id} className="w-60 flex-none">
                <ChannelCard channel={c} list={recentChannels} />
              </div>
            ))}
          </Rail>
        )}

        {favoriteChannels.length > 0 && show("favourites") && (
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

        {channels.length > 0 && show("live") && (
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

        {show("live") &&
          groups.map(([name, list]) => (
            <Rail key={name} title={name}>
              {list.slice(0, 14).map((c) => (
                <div key={c.id} className="w-60 flex-none">
                  <ChannelCard channel={c} list={list} />
                </div>
              ))}
            </Rail>
          ))}

        {top10.length >= 5 && show("top10") && (
          <Rail title="Top 10 on Vesper">
            {top10.map((x, i) => (
              <div key={x.id} className="w-44 flex-none">
                <PosterCard kind={"poster" in x ? "movie" : "show"} item={x} rank={i + 1} />
              </div>
            ))}
          </Rail>
        )}

        {newest.length > 0 && show("movies") && (
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

        {topShows.length > 0 && show("series") && (
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
    </div>
  );
}

type Featured = { kind: "movie" | "show"; item: Movie | Show; image: string };

const dot = (on: boolean) =>
  `h-1.5 rounded-full transition-all ${on ? "w-6 bg-accent" : "w-2 bg-white/40"}`;

/** A full-bleed featured title: blurred artwork behind, the crisp poster beside the words. */
function Hero({ items }: { items: Featured[] }) {
  const play = useStore((s) => s.play);
  const openDetail = useStore((s) => s.openDetail);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 9000);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  const at = index % Math.max(1, items.length);
  const current = items[at];
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
      className="relative isolate h-[78vh] min-h-[30rem] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="scope-dark absolute inset-0 bg-ink">
        {items.map((f, i) => (
          <img
            key={f.item.id}
            decoding="async"
            src={f.image}
            alt=""
            className={`absolute inset-0 size-full scale-125 object-cover blur-2xl transition-opacity duration-700 ease-out ${i === at ? "opacity-60" : "opacity-0"}`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink to-transparent" />

      <div className="scope-dark relative flex h-full items-end justify-between gap-12 px-10 pb-20 max-md:px-4">
        <div className="max-w-xl">
          <h1 className="line-clamp-3 text-6xl leading-[0.98] font-extrabold tracking-tight max-md:text-4xl">
            {item.name}
          </h1>
          <p className="mt-4 text-sm text-muted">
            {[
              kind === "movie" ? "Movie" : "Series",
              item.group,
              item.rating ? `★ ${item.rating.toFixed(1)}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          {plot && <p className="mt-4 line-clamp-3 text-paper/85">{plot}</p>}
          <div className="mt-7 flex items-center gap-3">
            <Button variant="primary" icon={PlayIcon} className="px-6 py-3" onClick={playNow}>
              {kind === "movie" ? "Play" : "Watch"}
            </Button>
            <Button className="px-6 py-3" onClick={() => openDetail(kind, item.id)}>
              More info
            </Button>
          </div>
        </div>
        {current.image && (
          <img
            decoding="async"
            src={current.image}
            alt=""
            className="hidden aspect-[2/3] h-[min(26rem,52vh)] rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 lg:block"
          />
        )}
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-6 left-10 flex max-md:left-4">
          {items.map((f, i) => (
            <button
              key={f.item.id}
              type="button"
              aria-label={`Show ${f.item.name}`}
              onClick={() => setIndex(i)}
              className="px-0.5 py-3"
            >
              <span className={`block ${dot(i === at)}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** For libraries with only live channels: lead with a channel and what is on it. */
function LiveHero({ channels }: { channels: Channel[] }) {
  const play = useStore((s) => s.play);
  const setView = useStore((s) => s.setView);
  const channel = useMemo(() => channels.find((c) => c.logo) ?? channels[0], [channels]);
  const guide = useGuide(
    channel ?? { id: "", providerId: "", name: "", url: "", group: "" },
    !!channel,
    3,
  );
  const { now } = nowNext(guide ?? []);
  if (!channel) return null;

  return (
    <section className="relative isolate h-[56vh] min-h-[24rem] overflow-hidden">
      <div className="scope-dark absolute inset-0 bg-ink">
        <div className="absolute -right-24 top-0 size-[34rem] rounded-full bg-accent/25 blur-3xl" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
      <div className="scope-dark relative flex h-full items-end justify-between gap-12 px-10 pb-16 max-md:px-4">
        <div className="max-w-xl">
          <h1 className="line-clamp-2 text-6xl leading-[0.98] font-extrabold tracking-tight max-md:text-4xl">
            {cleanName(channel.name)}
          </h1>
          <p className="mt-4 text-sm text-muted">
            Live{channel.group ? `  ·  ${channel.group}` : ""}
            {now ? `  ·  ${now.title}` : ""}
          </p>
          <div className="mt-7 flex items-center gap-3">
            <Button
              variant="primary"
              icon={PlayIcon}
              className="px-6 py-3"
              onClick={() => play(channelPlayable(channel), channels)}
            >
              Watch live
            </Button>
            <Button className="px-6 py-3" onClick={() => setView("live")}>
              All channels
            </Button>
          </div>
        </div>
        {channel.logo && (
          <div className="hidden h-[min(18rem,40vh)] aspect-video items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 lg:flex">
            <img src={channel.logo} alt="" className="size-full object-contain p-10" />
          </div>
        )}
      </div>
    </section>
  );
}
