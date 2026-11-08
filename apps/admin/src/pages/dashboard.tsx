import { type CloudClient, formatBytes } from "@vesper/cloud-client";
import { AnimatePresence } from "framer-motion";
import { type ReactNode, useRef, useState } from "react";
import { ComingUp, DiskRing, Dot, greeting, Panel, Quiet, RecordingNow } from "../dash/parts";
import { useLoad } from "../hooks";
import { useReveal } from "../motion";
import type { Space } from "../router";
import { Badge, Button, Notice, Skeleton, when } from "../ui";

/**
 * The operations board: what is on air, what is next, and whether the box is healthy. Rows, not
 * tiles; the single most urgent fact leads the page in plain words.
 */
export function Dashboard({
  client,
  go,
}: {
  client: CloudClient;
  go: (space: Space, page: string, id?: string) => void;
}) {
  const page = useRef<HTMLDivElement>(null);
  const { data: stats, error } = useLoad(() => client.admin.stats(), 5000);
  const { data: status } = useLoad(() => client.status(), 15_000);
  const { data: caps } = useLoad(() => client.capabilities());
  const { data: audit } = useLoad(() => client.admin.audit(8), 10_000);
  const { data: cal } = useLoad(() => client.calendar(Math.floor(Date.now() / 1000)), 20_000);
  const { data: recs, reload } = useLoad(() => client.listRecordings(), 4000);
  const [copied, setCopied] = useState(false);
  useReveal(page, stats ? "ready" : "loading");

  if (error) return <Notice>{error}</Notice>;
  if (!stats)
    return (
      <div className="space-y-8">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );

  const lite = stats.mode === "lite";
  const address = window.location.origin;
  const onAir = (recs?.recordings ?? []).filter(
    (r) => r.status === "recording" && r.kind === "recording",
  );
  const upcoming = (cal?.items ?? []).filter((c) => c.status === "scheduled");
  const total = status?.diskTotal ?? 0;
  const free = status?.diskFree ?? 0;
  const clashes = upcoming.filter((c) => c.clash).length;
  const broken = status?.brokenChannels.length ?? 0;
  const problems = [
    stats.recordings.failed > 0 && `${stats.recordings.failed} failed`,
    clashes > 0 && `${clashes} clashing`,
    broken > 0 && `${broken} broken channel${broken === 1 ? "" : "s"}`,
    total > 0 && free / total < 0.1 && "disk almost full",
  ].filter(Boolean) as string[];

  const headline = onAir.length
    ? `${onAir.length} recording now`
    : upcoming[0]
      ? `Next recording at ${new Date(upcoming[0].startAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Nothing is recording";

  return (
    <div ref={page} className="space-y-12">
      <header data-reveal className="flex flex-wrap items-end gap-x-8 gap-y-5">
        <div className="min-w-0 flex-1 basis-96">
          <h1 className="display text-[length:var(--text-hero)] leading-[1.02]">
            {greeting()}.
            <span className={onAir.length ? " text-accent" : " text-muted"}> {headline}.</span>
          </h1>
          <p className="mt-4 flex items-center gap-3 text-xl text-muted">
            <Dot tone={problems.length ? "warn" : "ok"} />
            {problems.length ? `Needs a look: ${problems.join(", ")}.` : "Everything is healthy."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" icon="live" onClick={() => go("watch", "live")}>
            Live TV
          </Button>
          <Button icon="clock" onClick={() => go("watch", "schedules")}>
            Schedules
          </Button>
          <Button icon="download" onClick={() => go("manage", "downloads")}>
            Download
          </Button>
        </div>
      </header>

      <div className="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-12">
          <Panel
            title="On air"
            count={onAir.length}
            actions={
              <Button variant="ghost" onClick={() => go("watch", "activity")}>
                Activity
              </Button>
            }
          >
            {onAir.length === 0 ? (
              <Quiet>Nothing is recording. Start one from Live TV or the guide.</Quiet>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {onAir.map((r) => (
                    <RecordingNow
                      key={r.id}
                      rec={r}
                      client={client}
                      onChanged={() => void reload()}
                      onOpen={(id) => go("watch", "play", id)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>

          <Panel
            title="Coming up"
            count={upcoming.length}
            actions={
              <Button variant="ghost" onClick={() => go("watch", "schedules")}>
                All schedules
              </Button>
            }
          >
            {upcoming.length === 0 ? (
              <Quiet>No recordings are scheduled.</Quiet>
            ) : (
              <ComingUp items={upcoming} limit={6} />
            )}
          </Panel>
        </div>

        <div className="space-y-12">
          <Panel title="Disk">
            {total ? (
              <DiskRing used={total - free} total={total} free={free} daysLeft={status?.daysLeft} />
            ) : (
              <Quiet>The server cannot read the disk size here.</Quiet>
            )}
            <dl className="px-[var(--card-pad)] pb-5">
              <Fact label="Recordings">
                {stats.recordings.done} saved · {formatBytes(stats.storageBytes)}
              </Fact>
            </dl>
          </Panel>

          <Panel title="Health">
            <dl className="px-[var(--card-pad)] py-3">
              <Fact label="ffmpeg" dot={caps ? (caps.ffmpeg ? "ok" : "warn") : "off"}>
                {caps?.ffmpeg ? "Ready" : "Missing: no thumbnails, trimming or re-encoding"}
              </Fact>
              <Fact label="yt-dlp" dot={caps ? (caps.ytdlp.available ? "ok" : "warn") : "off"}>
                {caps?.ytdlp.available ? `v${caps.ytdlp.version}` : "Missing: no web downloads"}
              </Fact>
              <Fact label="Channels" dot={broken ? "warn" : "ok"}>
                {broken ? `${broken} not answering` : "All answering"}
              </Fact>
              <Fact label={lite ? "Mode" : "Accounts"} dot="ok">
                {lite
                  ? "Lite, no accounts"
                  : `${stats.users} accounts, ${stats.sessions} signed in`}
              </Fact>
              {status?.updateAvailable && (
                <Fact label="Update" dot="warn">
                  {status.updateAvailable} is available
                </Fact>
              )}
            </dl>
          </Panel>

          <Panel title="Connect a device">
            <div className="px-[var(--card-pad)] py-5">
              <p className="text-lg text-muted">
                Type this address into the Vesper Kodi add-on, or open it in any browser.
                {lite ? " Lite mode has no passwords: keep it on your home network." : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <code className="selectable min-w-0 flex-1 truncate rounded-lg bg-raised px-5 py-3.5 font-mono text-lg">
                  {address}
                </code>
                <Button
                  onClick={() => {
                    void navigator.clipboard?.writeText(address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title="Latest activity"
        actions={
          <Button variant="ghost" onClick={() => go("manage", "activity")}>
            All activity
          </Button>
        }
      >
        {audit && audit.length > 0 ? (
          <ul>
            {audit.slice(0, 6).map((e) => (
              <li
                key={`${e.at}-${e.action}-${e.detail}`}
                className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-[var(--card-pad)] py-4 text-lg not-last:border-b not-last:border-line/50"
              >
                <span className="w-44 flex-none text-muted tabular">{when(e.at)}</span>
                <Badge tone="dusk">{e.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {e.actor}
                  {e.detail ? `: ${e.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Quiet>Nothing yet.</Quiet>
        )}
      </Panel>
    </div>
  );
}

function Fact({
  label,
  dot,
  children,
}: {
  label: string;
  dot?: "ok" | "warn" | "off";
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-4 py-2.5 text-lg">
      <dt className="flex w-32 flex-none items-center gap-3 text-muted">
        {dot && <Dot tone={dot} />}
        {label}
      </dt>
      <dd className="min-w-0 flex-1 font-medium tabular">{children}</dd>
    </div>
  );
}
