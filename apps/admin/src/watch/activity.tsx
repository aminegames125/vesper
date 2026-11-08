import {
  type CloudClient,
  type CloudRecording,
  formatBytes,
  formatUntil,
} from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { ComingUp, DiskRing, Dot, Panel, Quiet, RecordingNow } from "../dash/parts";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { ActionMenu, Confirm, EmptyState, Stat, useToast } from "../kit";
import { CountUp, EASE, useReveal } from "../motion";
import { Button, Notice, PageHeader, Skeleton, when } from "../ui";

const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");

/** Everything the server is doing, and what needs attention. The web twin of Kodi's status screen. */
export function ActivityPage({
  client,
  onPlay,
}: {
  client: CloudClient;
  onPlay: (id: string) => void;
}) {
  const say = useToast();
  const page = useRef<HTMLDivElement>(null);
  const lib = useLoad(() => client.listRecordings(), 3000);
  const cal = useLoad(
    () =>
      client.calendar(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 14 * 86_400),
    10_000,
  );
  const status = useLoad(() => client.status(), 10_000);
  const storage = useLoad(() => client.storage(), 30_000);
  const [cancel, setCancel] = useState<{ id: string; title: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  useReveal(page, status.data && lib.data ? "ready" : "loading");

  const run = async (action: () => Promise<unknown>, done: string, after?: () => void) => {
    try {
      await action();
      say(done);
      after?.();
      void lib.reload();
      void status.reload();
      void cal.reload();
    } catch (e) {
      say(message(e), "error");
    }
  };

  if (lib.error && !lib.data) return <Notice>{lib.error}</Notice>;
  if (!lib.data || !status.data)
    return (
      <div>
        <PageHeader title="Activity" lead="What the server is recording and how it is doing." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );

  const s = status.data;
  const rows = lib.data.recordings;
  const live = rows.filter((r) => r.status === "recording" && r.kind === "recording");
  const failed = rows.filter((r) => r.status === "failed");
  const upcoming = (cal.data?.items ?? []).filter((c) => c.status === "scheduled");
  const total = s.diskTotal ?? 0;
  const free = s.diskFree ?? 0;
  const maxFolder = Math.max(1, ...(storage.data?.folders.map((f) => f.bytes) ?? [1]));
  const maxSource = Math.max(1, ...(storage.data?.sources.map((f) => f.bytes) ?? [1]));

  return (
    <div ref={page} className="space-y-6">
      <PageHeader title="Activity" lead="What the server is recording and how it is doing." />

      {s.updateAvailable && (
        <div
          data-reveal
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-tint px-4 py-3 text-sm text-accent"
        >
          <Icon name="download" size={18} />
          <span className="font-medium">
            A newer Vesper is available: {s.updateAvailable}. You run v{s.version}.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Recording now"
          icon="rec"
          tone={s.recording ? "accent" : "paper"}
          value={<CountUp value={s.recording} />}
          hint={s.recording ? "capturing live" : "idle"}
        />
        <Stat
          label="Scheduled"
          icon="calendar"
          value={<CountUp value={s.scheduled} />}
          hint={
            s.next ? `next: ${s.next.title} in ${formatUntil(s.next.startAt)}` : "nothing coming up"
          }
        />
        <Stat
          label="Failed"
          icon="close"
          tone={s.failed ? "warn" : "paper"}
          value={<CountUp value={s.failed} />}
          hint={s.failed ? "needs a look" : "all good"}
        />
        <Stat
          label="Per day"
          icon="library"
          value={<CountUp value={s.perDayBytes} format={(n) => formatBytes(Math.round(n))} />}
          hint="recent pace"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel
            title="Recording now"
            icon={<Icon name="rec" size={18} className="text-accent" />}
            count={live.length}
          >
            {live.length === 0 ? (
              <Quiet>Nothing is recording right now.</Quiet>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {live.map((r) => (
                    <RecordingNow
                      key={r.id}
                      rec={r}
                      client={client}
                      onChanged={() => void lib.reload()}
                      onOpen={onPlay}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>

          <Panel
            title="Coming up"
            icon={<Icon name="calendar" size={18} className="text-dusk" />}
            count={upcoming.length}
          >
            {upcoming.length === 0 ? (
              <Quiet>No recordings in the next two weeks.</Quiet>
            ) : (
              <ComingUp
                items={upcoming}
                action={(c) => (
                  <ActionMenu
                    label={`Actions for ${c.title}`}
                    items={[
                      {
                        label: "Cancel this recording",
                        icon: "close",
                        danger: true,
                        onClick: () => setCancel({ id: c.id, title: c.title }),
                      },
                    ]}
                  />
                )}
              />
            )}
          </Panel>

          <Panel
            title="Failed"
            icon={<Icon name="close" size={18} className="text-warn" />}
            count={failed.length}
            actions={
              failed.length > 0 && (
                <Button
                  onClick={() =>
                    void run(() => client.clearFailedRecordings(), "Cleared failed recordings")
                  }
                >
                  Clear all
                </Button>
              )
            }
          >
            {failed.length === 0 ? (
              <Quiet>No failures. Nice.</Quiet>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {failed.map((r) => (
                    <FailedRow
                      key={r.id}
                      rec={r}
                      onDelete={() =>
                        void run(() => client.deleteRecording(r.id), `Deleted ${r.title}`)
                      }
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>

          <Panel
            title="Expiring soon"
            icon={<Icon name="clock" size={18} className="text-warn" />}
            count={s.expiring.length}
          >
            {s.expiring.length === 0 ? (
              <Quiet>Nothing is about to be deleted.</Quiet>
            ) : (
              <ul>
                {s.expiring.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/60 px-[var(--card-pad)] py-3.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="text-sm text-muted">
                        Deleted in {formatUntil(e.keepUntil)} · {when(e.keepUntil)}
                      </p>
                    </div>
                    <Button
                      icon="check"
                      onClick={() =>
                        void run(() => client.keepRecording(e.id, 0), `Keeping ${e.title} forever`)
                      }
                    >
                      Keep forever
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Disk" icon={<Icon name="chip" size={18} className="text-muted" />}>
            {total ? (
              <DiskRing used={total - free} total={total} free={free} daysLeft={s.daysLeft} />
            ) : (
              <Quiet>The server cannot read its disk size.</Quiet>
            )}
            {!s.ffmpeg && (
              <p className="border-t border-line px-[var(--card-pad)] py-3 text-sm text-warn">
                ffmpeg is missing: no thumbnails, trimming or MP4 export.
              </p>
            )}
          </Panel>

          <Panel
            title="Broken channels"
            icon={<Icon name="live" size={18} className="text-warn" />}
            count={s.brokenChannels.length}
          >
            {s.brokenChannels.length === 0 ? (
              <div className="flex items-center gap-3 px-[var(--card-pad)] py-5 text-sm text-muted">
                <Dot tone="ok" />
                Every checked channel answers.
              </div>
            ) : (
              <ul>
                {s.brokenChannels.map((c) => (
                  <li
                    key={c.name}
                    className="border-b border-line/60 px-[var(--card-pad)] py-3 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <Dot tone="warn" />
                      <p className="min-w-0 flex-1 truncate font-semibold">{c.name}</p>
                      <Button
                        variant="ghost"
                        disabled={testing === c.name}
                        onClick={async () => {
                          // The status list has no address, so find the channel by name first.
                          setTesting(c.name);
                          try {
                            const found = await client.channels("all", {
                              q: c.name,
                              kind: "live",
                              limit: 5,
                            });
                            const match =
                              found.channels.find((x) => x.name === c.name) ?? found.channels[0];
                            if (!match)
                              throw new Error("Could not find that channel in your playlists.");
                            const r = await client.testChannel(match.url, 4);
                            if (r.ok) say(`${c.name} works (${r.kbps ?? "?"} kbps)`);
                            else say(`${c.name}: ${r.error ?? "still not working"}`, "error");
                          } catch (e) {
                            say(message(e), "error");
                          } finally {
                            setTesting(null);
                          }
                        }}
                      >
                        {testing === c.name ? "Testing…" : "Test"}
                      </Button>
                    </div>
                    <p className="mt-1 pl-[1.375rem] text-sm text-muted">
                      {c.detail} · checked {when(c.checkedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Storage" icon={<Icon name="library" size={18} className="text-muted" />}>
            {!storage.data ? (
              <div className="p-[var(--card-pad)]">
                <Skeleton className="h-24" />
              </div>
            ) : (
              <div className="space-y-6 p-[var(--card-pad)]">
                <Bars title="By folder" rows={storage.data.folders} max={maxFolder} />
                <Bars title="By source" rows={storage.data.sources} max={maxSource} />
                {storage.data.biggest.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Biggest</h3>
                    <ul className="space-y-1.5 text-sm">
                      {storage.data.biggest.slice(0, 5).map((b) => (
                        <li key={b.id} className="flex items-baseline gap-3">
                          <button
                            type="button"
                            onClick={() => onPlay(b.id)}
                            className="min-w-0 flex-1 truncate text-left hover:text-accent"
                          >
                            {b.title}
                          </button>
                          <span className="text-muted tabular">{formatBytes(b.bytes)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {storage.data.folders.length === 0 &&
                  storage.data.sources.length === 0 &&
                  storage.data.biggest.length === 0 && <Quiet>Nothing stored yet.</Quiet>}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {cancel && (
        <Confirm
          title="Cancel this recording?"
          body={`${cancel.title} will not be recorded. Repeating schedules keep their other times.`}
          confirm="Cancel recording"
          onClose={() => setCancel(null)}
          onConfirm={() =>
            run(() => client.deleteRecording(cancel.id), `Cancelled ${cancel.title}`)
          }
        />
      )}
    </div>
  );
}

function FailedRow({ rec, onDelete }: { rec: CloudRecording; onDelete: () => void }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/60 px-[var(--card-pad)] py-3.5 last:border-0"
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-semibold">{rec.title}</p>
        <p className="text-sm text-warn">{rec.error || "Failed."}</p>
        <p className="text-sm text-muted">
          {rec.channelName || "Recording"} · {when(rec.finishedAt ?? rec.createdAt)}
        </p>
      </div>
      <Button variant="danger" icon="trash" onClick={onDelete}>
        Delete
      </Button>
    </motion.li>
  );
}

function Bars({
  title,
  rows,
  max,
}: {
  title: string;
  rows: { name: string; bytes: number; count: number }[];
  max: number;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-3">
        {rows.slice(0, 6).map((r) => (
          <li key={r.name || "none"}>
            <div className="mb-1 flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.name || "No folder"}</span>
              <span className="text-muted tabular">
                {formatBytes(r.bytes)} · {r.count}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${(r.bytes / max) * 100}%` }}
                transition={{ duration: 0.8, ease: EASE }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { EmptyState };
