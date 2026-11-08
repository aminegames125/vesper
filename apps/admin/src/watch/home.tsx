import {
  type Channel,
  type CloudClient,
  type CloudRecording,
  type CloudUser,
  formatDuration,
} from "@vesper/cloud-client";
import { motion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { clockTime, dayLabel } from "../dash/parts";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { EmptyState } from "../kit";
import { EASE, useReveal } from "../motion";
import type { Space } from "../router";
import { Button, Notice, Skeleton } from "../ui";
import { clock, isPlayable, MediaCard, resumable, useMediaToken } from "./media";

const FAVORITES_KEY = "live:favorites";

/**
 * Home is the TV's idle screen: what you were watching, what is on the air in your house, and what
 * is about to be recorded. The lower-third plate at the top carries the one action that matters.
 */
export function WatchHome({
  client,
  user,
  onPlay,
  go,
}: {
  client: CloudClient;
  user: CloudUser;
  onPlay: (id: string) => void;
  go: (space: Space, page: string) => void;
}) {
  const { data, error } = useLoad(() => client.listRecordings(), 6000);
  const { data: cal } = useLoad(() => client.calendar(Math.floor(Date.now() / 1000)), 30_000);
  const media = useMediaToken(client);
  const page = useRef<HTMLDivElement>(null);
  const [favorites, setFavorites] = useState<Channel[]>([]);
  useReveal(page, data ? "ready" : "loading");

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

  if (error) return <Notice>{error}</Notice>;
  if (!data)
    return (
      <div className="space-y-8">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );

  const rows = data.recordings;
  const resume = rows.filter(resumable);
  const live = rows.filter((r) => r.status === "recording" && r.kind === "recording");
  const recent = rows
    .filter((r) => isPlayable(r) && !resumable(r) && r.status === "done")
    .slice(0, 12);
  const upcoming = (cal?.items ?? []).filter((c) => c.status === "scheduled").slice(0, 6);
  const featured: CloudRecording | undefined = resume[0] ?? live[0] ?? recent[0];

  return (
    <div ref={page} className="space-y-12">
      {featured ? (
        <NowPlate
          client={client}
          media={media}
          rec={featured}
          resumeAt={resume[0] ? featured.positionS : 0}
          onPlay={onPlay}
          onLive={() => go("watch", "live")}
        />
      ) : (
        <div data-reveal>
          <h1 className="display mb-6 text-[length:var(--text-hero)] leading-none">
            Hello, {user.username}
          </h1>
          <EmptyState
            icon="live"
            title="Nothing recorded yet"
            action={
              <div className="mt-2 flex flex-wrap gap-3">
                <Button variant="primary" icon="live" onClick={() => go("watch", "live")}>
                  Watch live TV
                </Button>
                <Button icon="clock" onClick={() => go("watch", "schedules")}>
                  Schedule a recording
                </Button>
              </div>
            }
          >
            Start with Live TV: add your playlist, open a channel and press Record. It lands here
            and in your Library, ready to play on any screen in the house.
          </EmptyState>
        </div>
      )}

      {upcoming.length > 0 && (
        <section data-reveal aria-label="Coming up">
          <SectionTitle
            title="Coming up"
            action={
              <Button variant="ghost" onClick={() => go("watch", "schedules")}>
                All schedules
              </Button>
            }
          />
          <ul className="mt-3 space-y-1">
            {upcoming.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go("watch", "schedules")}
                  className="plate grid w-full grid-cols-[6.5rem_1fr_auto] items-center gap-5 rounded-lg bg-panel px-5 py-4 text-left"
                >
                  <span>
                    <span className="display block text-3xl leading-none tabular">
                      {clockTime(c.startAt)}
                    </span>
                    <span className="text-muted text-sm">{dayLabel(c.startAt)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xl font-semibold">{c.title}</span>
                    <span className="text-muted block truncate text-base">
                      {c.channelName || "Channel"}
                      {c.clash ? " · clashes with another recording" : ""}
                    </span>
                  </span>
                  <span className="text-muted text-lg tabular">
                    {formatDuration(Math.max(0, c.endAt - c.startAt))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length > 1 && (
        <Rail title="Recording now">
          {live.map((r) => (
            <MediaCard key={r.id} rec={r} media={media} client={client} onPlay={onPlay} wide />
          ))}
        </Rail>
      )}

      {resume.length > 1 && (
        <Rail title="Continue watching">
          {resume.slice(1).map((r) => (
            <MediaCard key={r.id} rec={r} media={media} client={client} onPlay={onPlay} wide />
          ))}
        </Rail>
      )}

      {favorites.length > 0 && (
        <Rail title="Your channels">
          {favorites.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => go("watch", "live")}
              className="plate flex w-44 flex-none snap-start flex-col items-center gap-3 rounded-xl bg-panel p-4 text-center"
            >
              <span className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-sunken">
                {c.logo ? (
                  <img
                    src={c.logo}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                ) : (
                  <Icon name="live" size={28} className="text-muted" />
                )}
              </span>
              <span className="w-full truncate text-lg font-semibold">{c.name}</span>
            </button>
          ))}
        </Rail>
      )}

      {recent.length > 0 && (
        <Rail title="Recently recorded">
          {recent.map((r) => (
            <MediaCard key={r.id} rec={r} media={media} client={client} onPlay={onPlay} wide />
          ))}
        </Rail>
      )}
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="text-3xl">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function Rail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-reveal aria-label={title}>
      <SectionTitle title={title} />
      <div className="rail-scroll -mx-[var(--page-pad)] mt-4 flex snap-x gap-5 overflow-x-auto px-[var(--page-pad)] pb-3">
        {children}
      </div>
    </section>
  );
}

/** The lower-third: a coral bar, the title, what it is, and the one action. */
function NowPlate({
  client,
  media,
  rec,
  resumeAt,
  onPlay,
  onLive,
}: {
  client: CloudClient;
  media: string | null;
  rec: CloudRecording;
  resumeAt: number;
  onPlay: (id: string) => void;
  onLive: () => void;
}) {
  const live = rec.status === "recording" && rec.kind === "recording";
  return (
    <motion.section
      data-reveal
      aria-label="Now"
      initial={{ clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="surface grid overflow-hidden lg:grid-cols-[1fr_minmax(0,26rem)]"
    >
      <div className="flex">
        <span className={`w-4 flex-none ${live ? "bg-accent" : "bg-paper"}`} />
        <div className="flex min-w-0 flex-col justify-center gap-5 p-7 sm:p-9">
          <div className="min-w-0">
            <h1 className="display text-[length:var(--text-hero)] leading-[1.02]">{rec.title}</h1>
            <p className="text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xl">
              {live ? (
                <span className="inline-flex items-center gap-2 font-semibold text-accent">
                  <span className="size-3 animate-pulse rounded-full bg-accent" />
                  Recording now
                </span>
              ) : resumeAt > 0 ? (
                <span>Left off at {clock(resumeAt)}</span>
              ) : (
                <span>Latest recording</span>
              )}
              {rec.channelName && <span>{rec.channelName}</span>}
              {rec.status === "done" && rec.seconds > 0 && (
                <span className="tabular">{formatDuration(rec.seconds)}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" icon="play" onClick={() => onPlay(rec.id)}>
              {live ? "Watch from the start" : resumeAt > 0 ? "Resume" : "Play"}
            </Button>
            <Button icon="live" onClick={onLive}>
              Live TV
            </Button>
          </div>
        </div>
      </div>
      <div className="relative hidden min-h-56 bg-sunken lg:block">
        {rec.thumb && media !== null ? (
          <img
            src={client.thumbFor(rec.id, media)}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-muted">
            <Icon name={live ? "live" : "film"} size={48} />
          </span>
        )}
      </div>
    </motion.section>
  );
}
