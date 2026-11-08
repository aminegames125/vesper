import { type CloudClient, type CloudUser, formatBytes } from "@vesper/cloud-client";
import { useRef } from "react";
import { useLoad } from "../hooks";
import { useReveal } from "../motion";
import type { Space } from "../router";
import { Button, Empty, Notice, Skeleton } from "../ui";
import { isPlayable, MediaCard, resumable, useMediaToken } from "./media";

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
  const { data, error } = useLoad(() => client.listRecordings(), 8000);
  const media = useMediaToken(client);
  const page = useRef<HTMLDivElement>(null);
  useReveal(page, data ? "ready" : "loading");

  if (error) return <Notice>{error}</Notice>;
  if (!data)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-video" />
        ))}
      </div>
    );

  const rows = data.recordings;
  const resume = rows.filter(resumable);
  const recent = rows.filter((r) => isPlayable(r) && !resumable(r)).slice(0, 12);
  const hero = resume[0] ?? recent[0];

  return (
    <div ref={page} className="space-y-8">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-[length:var(--text-2xl)] font-bold leading-tight">
            {resume[0] ? "Continue watching" : "Home"}
          </h1>
          <p className="mt-1 truncate text-sm text-muted">
            {resume[0]
              ? resume[0].title
              : rows.length
                ? `${rows.filter(isPlayable).length} items ready to watch`
                : `Signed in as ${user.username}`}
          </p>
        </div>
        <div className="flex gap-2">
          {hero && (
            <Button variant="primary" onClick={() => onPlay(hero.id)}>
              {resume[0] ? "Resume" : "Play latest"}
            </Button>
          )}
          <Button icon="live" onClick={() => go("watch", "live")}>
            Live TV
          </Button>
          <Button onClick={() => go("watch", "library")}>Browse library</Button>
        </div>
        {data.storageLimit > 0 && (
          <p className="basis-full text-xs text-muted tabular">
            Storage {formatBytes(data.storageUsed)} of {formatBytes(data.storageLimit)}
          </p>
        )}
      </header>

      {resume.length > 0 && (
        <Rail title="Continue watching" count={resume.length}>
          {resume.map((r) => (
            <MediaCard key={r.id} rec={r} media={media} client={client} onPlay={onPlay} wide />
          ))}
        </Rail>
      )}
      {recent.length > 0 && (
        <Rail title="Recently added" count={recent.length}>
          {recent.map((r) => (
            <MediaCard key={r.id} rec={r} media={media} client={client} onPlay={onPlay} wide />
          ))}
        </Rail>
      )}
      {rows.length === 0 && (
        <Empty>Nothing here yet. Items saved from Kodi or from a download show up here.</Empty>
      )}
    </div>
  );
}

function Rail({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section data-reveal>
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="text-sm font-normal text-muted">{count}</span>
      </h2>
      <div className="rail-scroll -mx-[var(--page-pad)] flex snap-x snap-mandatory scroll-px-[var(--page-pad)] gap-4 overflow-x-auto px-[var(--page-pad)] pb-2">
        {children}
      </div>
    </section>
  );
}
