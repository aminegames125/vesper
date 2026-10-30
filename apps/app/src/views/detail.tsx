import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, HeartIcon, IconButton, PlayIcon } from "../components/icons";
import { Button, Chip, Spinner } from "../components/ui";
import { episodePlayable, moviePlayable, useAuth } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Episode, Movie, Show } from "../lib/types";
import { getMovieDetail, getShow, type MovieDetail, type ShowDetail } from "../lib/xtream";

/** Full-page movie or series page over a dark backdrop. */
export function Detail() {
  const detail = useStore((s) => s.detail);
  const movies = useStore((s) => s.movies);
  const shows = useStore((s) => s.shows);
  if (!detail) return null;
  if (detail.kind === "movie") {
    const movie = movies.find((m) => m.id === detail.id);
    return movie ? <MovieDetailPage movie={movie} /> : null;
  }
  const show = shows.find((s) => s.id === detail.id);
  return show ? <ShowDetailPage show={show} /> : null;
}

function Backdrop({ image, children }: { image?: string; children: React.ReactNode }) {
  const close = useStore((s) => s.closeDetail);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="scope-dark relative min-h-full bg-ink">
      {image && (
        <img
          src={image}
          alt=""
          className="absolute inset-x-0 top-0 h-[60vh] w-full object-cover opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
      )}
      <div className="relative px-10 py-8">
        <IconButton
          icon={ArrowLeftIcon}
          label="Back"
          onClick={close}
          className="mb-6 bg-white/10 hover:bg-white/20"
        />
        {children}
      </div>
    </div>
  );
}

function Meta({ items }: { items: (string | undefined)[] }) {
  const shown = items.filter(Boolean);
  return <p className="mt-2 text-sm text-muted">{shown.join("  ·  ")}</p>;
}

function Facts({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="mt-6 grid max-w-2xl grid-cols-[6rem_1fr] gap-y-2 text-sm">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function FavoriteAction({ id }: { id: string }) {
  const on = useStore((s) => s.favorites.includes(id));
  const toggle = useStore((s) => s.toggleFavorite);
  return (
    <Button
      icon={HeartIcon}
      onClick={() => toggle(id)}
      aria-pressed={on}
      className={on ? "text-accent" : ""}
    >
      {on ? "In favourites" : "Add to favourites"}
    </Button>
  );
}

function MovieDetailPage({ movie }: { movie: Movie }) {
  const auth = useAuth(movie.providerId);
  const play = useStore((s) => s.play);
  const resume = useStore((s) => s.history.find((h) => h.item.id === movie.id));
  const [info, setInfo] = useState<MovieDetail | null>(null);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    getMovieDetail(auth, movie.streamId)
      .then((d) => !cancelled && setInfo(d))
      .catch(() => !cancelled && setInfo({}));
    return () => {
      cancelled = true;
    };
  }, [auth, movie.streamId]);

  return (
    <Backdrop image={info?.backdrop ?? movie.poster}>
      <div className="flex gap-10">
        {movie.poster && (
          <img
            src={movie.poster}
            alt=""
            className="hidden h-96 w-64 flex-none rounded-2xl object-cover shadow-2xl md:block"
          />
        )}
        <div className="min-w-0 max-w-2xl pt-4">
          <h1 className="text-5xl font-bold">{movie.name}</h1>
          <Meta
            items={[
              info?.year,
              info?.genre ?? movie.group,
              info?.duration,
              movie.rating ? `★ ${movie.rating.toFixed(1)}` : undefined,
            ]}
          />
          <p className="mt-5 leading-relaxed text-paper/90">
            {info === null ? "" : (info.plot ?? "No description available.")}
          </p>
          <div className="mt-6 flex gap-3">
            {auth && (
              <Button
                variant="primary"
                icon={PlayIcon}
                onClick={() => play(moviePlayable(movie, auth))}
              >
                {resume ? "Resume" : "Play"}
              </Button>
            )}
            <FavoriteAction id={movie.id} />
          </div>
          <Facts
            rows={[
              ["Cast", info?.cast],
              ["Director", info?.director],
            ]}
          />
        </div>
      </div>
    </Backdrop>
  );
}

function ShowDetailPage({ show }: { show: Show }) {
  const auth = useAuth(show.providerId);
  const play = useStore((s) => s.play);
  const history = useStore((s) => s.history);
  const [data, setData] = useState<{ detail: ShowDetail; episodes: Episode[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    getShow(auth, show.seriesId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setSeason(d.episodes[0]?.season ?? null);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [auth, show.seriesId]);

  const seasons = useMemo(
    () => [...new Set(data?.episodes.map((e) => e.season))].sort((a, b) => a - b),
    [data],
  );
  const episodes = data?.episodes.filter((e) => e.season === season) ?? [];
  const first = data?.episodes[0];
  const info = data?.detail;

  return (
    <Backdrop image={info?.backdrop ?? show.cover}>
      <div className="flex gap-10">
        {show.cover && (
          <img
            src={show.cover}
            alt=""
            className="hidden h-96 w-64 flex-none rounded-2xl object-cover shadow-2xl md:block"
          />
        )}
        <div className="min-w-0 max-w-3xl flex-1 pt-4">
          <h1 className="text-5xl font-bold">{show.name}</h1>
          <Meta
            items={[
              info?.year ?? show.year,
              info?.genre ?? show.group,
              show.rating ? `★ ${show.rating.toFixed(1)}` : undefined,
            ]}
          />
          <p className="mt-5 leading-relaxed text-paper/90">{info?.plot ?? show.plot ?? ""}</p>
          <div className="mt-6 flex gap-3">
            {first && (
              <Button
                variant="primary"
                icon={PlayIcon}
                onClick={() => play(episodePlayable(show, first))}
              >
                Play S{first.season} E{first.number}
              </Button>
            )}
            <FavoriteAction id={show.id} />
          </div>
          <Facts
            rows={[
              ["Cast", info?.cast],
              ["Director", info?.director],
            ]}
          />
        </div>
      </div>

      <section className="mt-10 max-w-4xl">
        {failed && <p className="text-sm text-muted">Episodes could not be loaded.</p>}
        {!data && !failed && <Spinner />}
        {data && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {seasons.map((s) => (
                <Chip key={s} active={season === s} onClick={() => setSeason(s)}>
                  Season {s}
                </Chip>
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {episodes.map((e) => {
                const progress = history.find((h) => h.item.id === `${show.id}:${e.id}`);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => play(episodePlayable(show, e))}
                      className="surface fade flex w-full items-center gap-4 p-3 text-left hover:border-accent"
                    >
                      <span className="relative block h-20 w-36 flex-none overflow-hidden rounded-lg bg-raised">
                        {e.image && (
                          <img
                            src={e.image}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        )}
                        {progress && (
                          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                            <span
                              className="block h-full bg-accent"
                              style={{
                                width: `${Math.round((progress.position / progress.duration) * 100)}%`,
                              }}
                            />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {e.number}. {e.title}
                        </span>
                        <span className="line-clamp-2 text-sm text-muted">{e.plot}</span>
                      </span>
                      {e.duration && <span className="text-xs text-muted">{e.duration}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Backdrop>
  );
}
