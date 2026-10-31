import { type ReactNode, useEffect, useMemo } from "react";
import { moviePlayable, useAuth } from "../lib/playable";
import { useStore, type View } from "../lib/store";
import type { Movie } from "../lib/types";
import { ChannelCard, PosterCard } from "./cards";
import { InfoIcon, PlayIcon, SearchIcon } from "./icons";
import { LogoMark } from "./logo";
import { SearchBox } from "./ui";

const TABS: { view: View; label: string }[] = [
  { view: "home", label: "Home" },
  { view: "live", label: "Live TV" },
  { view: "movies", label: "Movies" },
  { view: "series", label: "Series" },
  { view: "guide", label: "Guide" },
  { view: "favorites", label: "My list" },
  { view: "recordings", label: "Recordings" },
  { view: "sources", label: "Sources" },
  { view: "settings", label: "Settings" },
];

/**
 * The television layout: a slim top bar instead of a side rail, content that stays inside the
 * overscan-safe margins, and big focus states. Everything is reachable with a remote's arrows.
 */
export function TvShell({ children }: { children: ReactNode }) {
  const view = useStore((s) => s.view);
  const detail = useStore((s) => s.detail);
  const query = useStore((s) => s.query);
  const setView = useStore((s) => s.setView);
  const setQuery = useStore((s) => s.setQuery);

  // The remote's Back key steps out of a detail page, then back to Home.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["Escape", "GoBack", "BrowserBack"].includes(e.key)) return;
      if (document.querySelector("[data-player]")) return;
      const s = useStore.getState();
      if (s.detail) s.closeDetail();
      else if (s.view !== "home") s.setView("home");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="tv flex h-full flex-col">
      <header className="tv-pad flex flex-none items-center gap-8 pt-5 pb-3">
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label="Vesper home"
          className="tv-tile flex items-center gap-3 rounded-xl"
        >
          <LogoMark size={36} />
        </button>
        <nav
          aria-label="Main"
          className="rail-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1"
        >
          <button
            type="button"
            onClick={() => setView("search")}
            aria-label="Search"
            aria-current={view === "search" ? "page" : undefined}
            className="tv-tab"
          >
            <SearchIcon size={22} color="currentColor" isAnimated={false} />
          </button>
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              onClick={() => setView(t.view)}
              aria-current={view === t.view && !detail ? "page" : undefined}
              className="tv-tab"
            >
              {t.label}
            </button>
          ))}
        </nav>
        {view === "search" && (
          <div className="w-72 flex-none">
            <SearchBox value={query} onChange={setQuery} placeholder="Search" autoFocus />
          </div>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto pb-10">{children}</main>
    </div>
  );
}

/** A titled row of tiles that scrolls sideways and leaves room for the focused tile to grow. */
function TvRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="tv-pad mb-1 text-xl font-bold">{title}</h2>
      <div className="rail-scroll tv-pad flex gap-5 overflow-x-auto py-5 [scroll-padding-inline:5vw]">
        {children}
      </div>
    </section>
  );
}

const percent = (position: number, duration: number) =>
  Math.min(100, Math.round((position / Math.max(1, duration)) * 100));

/** Home for the television: a full-width billboard with Play, then rows of what to watch. */
export function TvHome() {
  const channels = useStore((s) => s.channels);
  const movies = useStore((s) => s.movies);
  const shows = useStore((s) => s.shows);
  const history = useStore((s) => s.history);
  const favorites = useStore((s) => s.favorites);
  const play = useStore((s) => s.play);
  const openDetail = useStore((s) => s.openDetail);
  const setView = useStore((s) => s.setView);

  const featured = useMemo(() => {
    const pool = movies.filter((m) => m.poster);
    return pool[Math.floor(pool.length / 3)] as Movie | undefined;
  }, [movies]);
  const featuredAuth = useAuth(featured?.providerId);
  const resume = history[0];

  const newest = useMemo(
    () => [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 24),
    [movies],
  );
  const topShows = useMemo(
    () => [...shows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 24),
    [shows],
  );
  const favoriteChannels = useMemo(
    () => channels.filter((c) => favorites.includes(c.id)),
    [channels, favorites],
  );

  if (channels.length + movies.length + shows.length === 0) {
    return (
      <div className="tv-pad flex h-full flex-col items-start justify-center gap-5">
        <h1 className="text-5xl font-bold">Welcome to Vesper</h1>
        <p className="max-w-xl text-lg text-muted">
          Add your IPTV source to see channels, movies and series here.
        </p>
        <button
          type="button"
          onClick={() => setView("sources")}
          className="tv-cta bg-accent text-on-accent"
        >
          Add a source
        </button>
      </div>
    );
  }

  const billboard = resume
    ? {
        title: resume.item.title,
        meta: resume.item.subtitle ?? "",
        image: resume.item.poster,
        progress: percent(resume.position, resume.duration),
        onPlay: () => play(resume.item),
        onInfo: undefined,
      }
    : featured
      ? {
          title: featured.name,
          meta: `${featured.group}${featured.rating ? ` · ★ ${featured.rating.toFixed(1)}` : ""}`,
          image: featured.poster,
          progress: 0,
          onPlay: featuredAuth ? () => play(moviePlayable(featured, featuredAuth)) : undefined,
          onInfo: () => openDetail("movie", featured.id),
        }
      : null;

  return (
    <div>
      {billboard && (
        <section className="relative mb-2 h-[58vh] min-h-80 overflow-hidden">
          {billboard.image && (
            <img
              decoding="async"
              src={billboard.image}
              alt=""
              className="absolute inset-0 size-full scale-125 object-cover opacity-45 blur-sm"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-r from-ink via-ink/70 to-transparent" />
          <div className="absolute inset-0 bg-linear-to-t from-ink to-transparent" />
          <div className="tv-pad relative flex h-full max-w-[60vw] flex-col justify-end pb-8">
            <h1 className="line-clamp-2 text-6xl leading-[1.05] font-bold">{billboard.title}</h1>
            {billboard.meta && <p className="mt-3 text-lg text-muted">{billboard.meta}</p>}
            {billboard.progress > 0 && (
              <div className="mt-4 h-1.5 w-72 overflow-hidden rounded-full bg-raised">
                <div className="h-full bg-accent" style={{ width: `${billboard.progress}%` }} />
              </div>
            )}
            <div className="mt-6 flex gap-4">
              {billboard.onPlay && (
                <button
                  type="button"
                  autoFocus
                  onClick={billboard.onPlay}
                  className="tv-cta bg-paper text-ink"
                >
                  <PlayIcon size={22} color="currentColor" isAnimated={false} />
                  {resume ? "Resume" : "Play"}
                </button>
              )}
              {billboard.onInfo && (
                <button
                  type="button"
                  onClick={billboard.onInfo}
                  className="tv-cta bg-raised/80 text-paper"
                >
                  <InfoIcon size={22} color="currentColor" isAnimated={false} />
                  More info
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {history.length > 1 && (
        <TvRow title="Continue watching">
          {history.slice(0, 12).map((h) => (
            <button
              key={h.item.id}
              type="button"
              onClick={() => play(h.item)}
              className="tv-tile surface w-72 flex-none overflow-hidden text-left"
            >
              <span className="relative flex aspect-video items-center justify-center bg-raised">
                {h.item.poster && (
                  <img
                    decoding="async"
                    loading="lazy"
                    src={h.item.poster}
                    alt=""
                    className="size-full object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${percent(h.position, h.duration)}%` }}
                  />
                </span>
              </span>
              <span className="block truncate px-3 py-2.5 text-sm font-medium">{h.item.title}</span>
            </button>
          ))}
        </TvRow>
      )}

      {favoriteChannels.length > 0 && (
        <TvRow title="My channels">
          {favoriteChannels.slice(0, 14).map((c) => (
            <div key={c.id} className="w-72 flex-none">
              <ChannelCard channel={c} list={favoriteChannels} />
            </div>
          ))}
        </TvRow>
      )}

      {channels.length > 0 && (
        <TvRow title="Live now">
          {channels.slice(0, 16).map((c) => (
            <div key={c.id} className="w-72 flex-none">
              <ChannelCard channel={c} list={channels} />
            </div>
          ))}
        </TvRow>
      )}

      {newest.length > 0 && (
        <TvRow title="New movies">
          {newest.map((m) => (
            <div key={m.id} className="w-44 flex-none">
              <PosterCard kind="movie" item={m} />
            </div>
          ))}
        </TvRow>
      )}

      {topShows.length > 0 && (
        <TvRow title="Top series">
          {topShows.map((s) => (
            <div key={s.id} className="w-44 flex-none">
              <PosterCard kind="show" item={s} />
            </div>
          ))}
        </TvRow>
      )}
    </div>
  );
}
