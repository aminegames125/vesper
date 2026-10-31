import { useMemo } from "react";
import { ChannelCard, PosterCard, Rail } from "../components/cards";
import { PlayIcon } from "../components/icons";
import { Button } from "../components/ui";
import { moviePlayable, useAuth } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Movie } from "../lib/types";
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
  const hero = useMemo(() => {
    const pool = movies.filter((m) => m.poster);
    return pool[Math.floor(pool.length / 3)] as Movie | undefined;
  }, [movies]);
  const heroAuth = useAuth(hero?.providerId);
  const openDetail = useStore((s) => s.openDetail);

  if (channels.length + movies.length + shows.length === 0) return <NoSources what="content" />;

  const resume = history[0];

  return (
    <div>
      {resume ? (
        <section className="surface mb-9 flex items-center gap-6 overflow-hidden p-5">
          {resume.item.poster && (
            <img
              decoding="async"
              src={resume.item.poster}
              alt=""
              className="h-28 w-20 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-accent">
              Pick up where you left off
            </p>
            <h2 className="mt-1 truncate text-2xl font-bold">{resume.item.title}</h2>
            {resume.item.subtitle && (
              <p className="truncate text-sm text-muted">{resume.item.subtitle}</p>
            )}
            <div className="mt-3 h-1 max-w-sm overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-accent"
                style={{ width: `${percent(resume.position, resume.duration)}%` }}
              />
            </div>
          </div>
          <Button variant="primary" icon={PlayIcon} onClick={() => play(resume.item)}>
            Resume
          </Button>
        </section>
      ) : (
        hero && (
          <section className="relative mb-9 overflow-hidden rounded-3xl bg-raised">
            {hero.poster && (
              <img
                decoding="async"
                src={hero.poster}
                alt=""
                className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl"
              />
            )}
            <div className="relative flex items-center gap-8 p-8">
              {hero.poster && (
                <img
                  decoding="async"
                  src={hero.poster}
                  alt=""
                  className="h-56 w-40 rounded-xl object-cover shadow-2xl"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">Featured</p>
                <h2 className="mt-1 line-clamp-2 text-4xl font-bold">{hero.name}</h2>
                <p className="mt-2 text-sm text-muted">
                  {hero.group}
                  {hero.rating ? ` · ★ ${hero.rating.toFixed(1)}` : ""}
                </p>
                <div className="mt-5 flex gap-3">
                  {heroAuth && (
                    <Button
                      variant="primary"
                      icon={PlayIcon}
                      onClick={() => play(moviePlayable(hero, heroAuth))}
                    >
                      Play
                    </Button>
                  )}
                  <Button onClick={() => openDetail("movie", hero.id)}>Details</Button>
                </div>
              </div>
            </div>
          </section>
        )
      )}

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
