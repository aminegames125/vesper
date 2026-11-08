import {
  type CalendarItem,
  type CloudClient,
  type CloudRecording,
  formatBytes,
  formatDuration,
} from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import { useToast } from "../kit";
import { EASE } from "../motion";
import { Badge, Button, Progress } from "../ui";

/** Re-renders every `ms`, so elapsed times and "in 5m" labels stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const greeting = (hour = new Date().getHours()) =>
  hour < 5
    ? "Good night"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening";

/** A titled card with an optional action on the right. */
export function Panel({
  title,
  icon,
  count,
  actions,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className} data-reveal>
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <h2 className="text-3xl">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-xl font-semibold text-muted tabular">{count}</span>
        )}
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="surface overflow-hidden">{children}</div>
    </section>
  );
}

export const Quiet = ({ children }: { children: ReactNode }) => (
  <p className="px-[var(--card-pad)] py-7 text-lg text-muted">{children}</p>
);

/** A small coloured dot: green when fine, amber when something deserves a look. */
export function Dot({ tone }: { tone: "ok" | "warn" | "off" }) {
  const color = { ok: "bg-ok", warn: "bg-warn", off: "bg-line" }[tone];
  return (
    <span className="relative inline-flex size-2.5 flex-none">
      {tone === "ok" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-40" />
      )}
      <span className={`relative size-2.5 rounded-full ${color}`} />
    </span>
  );
}

/**
 * The disk as one straight bar: what is free in large type, the bar filling in, warm above 90%.
 * (Kept under its old name so callers do not change.)
 */
export function DiskRing({
  used,
  total,
  free,
  daysLeft,
}: {
  used: number;
  total: number;
  free: number;
  daysLeft: number | null | undefined;
}) {
  const share = total ? Math.min(1, used / total) : 0;
  const hot = share > 0.9;
  return (
    <div className="px-[var(--card-pad)] py-6">
      <p className="flex items-baseline gap-3">
        <span className="display text-5xl tabular">{formatBytes(free)}</span>
        <span className="text-xl text-muted">free of {formatBytes(total)}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Disk used"
        aria-valuenow={Math.round(share * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-4 h-4 overflow-hidden rounded-full bg-raised"
      >
        <motion.div
          className={`h-full rounded-full ${hot ? "bg-warn" : "bg-accent"}`}
          initial={{ width: 0 }}
          animate={{ width: `${share * 100}%` }}
          transition={{ duration: 1, ease: EASE }}
        />
      </div>
      <p className={`mt-3 text-lg ${hot ? "font-semibold text-warn" : "text-muted"}`}>
        {daysLeft == null
          ? "No recent pace to estimate from"
          : daysLeft > 365
            ? "Over a year of room at the recent pace"
            : `About ${daysLeft} day${daysLeft === 1 ? "" : "s"} of room at the recent pace`}
      </p>
    </div>
  );
}

/** One running recording with its progress bar and a Stop button. */
export function RecordingNow({
  rec,
  client,
  onChanged,
  onOpen,
}: {
  rec: CloudRecording;
  client: CloudClient;
  onChanged: () => void;
  onOpen?: (id: string) => void;
}) {
  const say = useToast();
  const [stopping, setStopping] = useState(false);
  const share = rec.maxSeconds > 0 ? rec.seconds / rec.maxSeconds : 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 px-[var(--card-pad)] py-5 not-last:border-b not-last:border-line/50"
    >
      <span className="relative flex size-4 flex-none">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
        <span className="relative size-4 rounded-full bg-accent" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <button
          type="button"
          disabled={!onOpen}
          onClick={() => onOpen?.(rec.id)}
          className="block max-w-full truncate text-left text-xl font-semibold enabled:hover:text-accent"
        >
          {rec.title}
        </button>
        <p className="truncate text-base text-muted tabular">
          {rec.channelName || "Recording"} · {formatDuration(rec.seconds)} ·{" "}
          {rec.bytes > 0 ? formatBytes(rec.bytes) : "starting"}
        </p>
        {rec.maxSeconds > 0 && (
          <div className="mt-2 max-w-md">
            <Progress value={share} />
          </div>
        )}
      </div>
      {onOpen && (
        <Button variant="primary" icon="play" onClick={() => onOpen(rec.id)}>
          Watch live
        </Button>
      )}
      <Button
        variant="danger"
        disabled={stopping}
        onClick={async () => {
          setStopping(true);
          try {
            await client.stopRecording(rec.id);
            say(`Stopped ${rec.title}`);
            onChanged();
          } catch (e) {
            say(e instanceof Error ? e.message : "Could not stop it.", "error");
            setStopping(false);
          }
        }}
      >
        {stopping ? "Stopping…" : "Stop"}
      </Button>
    </motion.li>
  );
}

export const clockTime = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const dayLabel = (epoch: number) => {
  const d = new Date(epoch * 1000);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
};

/** Upcoming recordings, soonest first, with a "starts in" label and a clash warning. */
export function ComingUp({
  items,
  limit,
  action,
}: {
  items: CalendarItem[];
  limit?: number;
  action?: (item: CalendarItem) => ReactNode;
}) {
  const now = useNow(30_000);
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul>
      <AnimatePresence initial={false}>
        {shown.map((c) => {
          const delta = c.startAt - now;
          const soon =
            delta <= 0
              ? "starting"
              : delta < 3600
                ? `in ${Math.max(1, Math.round(delta / 60))} min`
                : delta < 86_400
                  ? `in ${Math.round(delta / 3600)} h`
                  : dayLabel(c.startAt);
          return (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="flex items-center gap-5 px-[var(--card-pad)] py-4 not-last:border-b not-last:border-line/50"
            >
              <div className="w-24 flex-none">
                <p className="display text-3xl leading-none tabular">{clockTime(c.startAt)}</p>
                <p className="mt-1 text-sm text-muted">{dayLabel(c.startAt)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-semibold">{c.title}</p>
                <p className="truncate text-base text-muted">
                  {c.channelName || "Channel"} · {soon}
                </p>
              </div>
              {c.clash && <Badge tone="warn">clash</Badge>}
              {action?.(c)}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
