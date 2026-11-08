import {
  type CalendarItem,
  type Channel,
  type CloudClient,
  EVERY_DAY,
  formatDuration,
  type NewSchedule,
  type Schedule,
  type SeriesRule,
  WEEKEND,
} from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { ActionMenu, Confirm, EmptyState, Stat, useToast } from "../kit";
import { EASE, useReveal } from "../motion";
import {
  Badge,
  Button,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Toggle,
  when,
} from "../ui";

const WEEKDAYS = 0b0011111;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Every day", "Weekdays", "Mon, Wed" or, for a one-off, its date. */
export function daysLabel(days: number, startDate: string): string {
  if (days === 0) return `Once, ${startDate}`;
  if (days === EVERY_DAY) return "Every day";
  if (days === WEEKDAYS) return "Weekdays";
  if (days === WEEKEND) return "Weekends";
  return DAY_NAMES.filter((_, i) => days & (1 << i)).join(", ");
}

const message = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");
const minutes = (s: number) => `${Math.round(s / 60)} min`;
const today = () => new Date().toLocaleDateString("en-CA");

const dayOf = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
const timeOf = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const KEEP_OPTIONS = [
  { value: "", label: "Server default" },
  { value: "24", label: "1 day" },
  { value: "72", label: "3 days" },
  { value: "168", label: "1 week" },
  { value: "336", label: "2 weeks" },
  { value: "720", label: "1 month" },
  { value: "0", label: "Forever" },
];

/**
 * Schedules: repeating recording rules, series rules (every episode of a show) and what is
 * coming up. Everything the Kodi add-on does with schedules, plus full editing.
 */
export function SchedulesPage({
  client,
  onPlay: _onPlay,
}: {
  client: CloudClient;
  onPlay: (id: string) => void;
}) {
  const say = useToast();
  const schedules = useLoad(() => client.listSchedules(), 15_000);
  const rules = useLoad(() => client.seriesRules(), 30_000);
  const calendar = useLoad(() => client.calendar(), 15_000);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [removing, setRemoving] = useState<Schedule | null>(null);
  const [removingRule, setRemovingRule] = useState<SeriesRule | null>(null);
  const [cancelling, setCancelling] = useState<CalendarItem | null>(null);
  const importer = useRef<HTMLInputElement>(null);
  const page = useRef<HTMLDivElement>(null);
  useReveal(page, schedules.data ? "ready" : "loading");

  const list = schedules.data?.schedules ?? [];
  const active = list.filter((s) => s.enabled);
  const next = active
    .filter((s) => s.nextStart)
    .sort((a, b) => (a.nextStart ?? 0) - (b.nextStart ?? 0))[0];
  const allPaused = list.length > 0 && active.length === 0;

  const refresh = async () => {
    await Promise.all([schedules.reload(), calendar.reload(), rules.reload()]);
  };

  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      say(done);
      await refresh();
    } catch (e) {
      say(message(e), "error");
    }
  };

  const exportAll = async () => {
    try {
      const data = await client.exportSchedules();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "vesper-schedules.json";
      link.click();
      URL.revokeObjectURL(url);
      say(`Exported ${data.schedules.length} schedules.`);
    } catch (e) {
      say(message(e), "error");
    }
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { schedules?: NewSchedule[] };
      if (!Array.isArray(parsed.schedules)) throw new Error("That file has no schedules in it.");
      const r = await client.importSchedules(parsed.schedules);
      say(
        r.problems.length
          ? `Added ${r.added}. ${r.problems.length} skipped: ${r.problems[0]}`
          : `Added ${r.added} schedules.`,
        r.problems.length ? "error" : "ok",
      );
      await refresh();
    } catch (e) {
      say(e instanceof SyntaxError ? "That is not a valid JSON file." : message(e), "error");
    }
  };

  // Group what is coming up by day.
  const upcoming = useMemo(() => {
    const groups = new Map<string, CalendarItem[]>();
    for (const item of calendar.data?.items ?? []) {
      const key = dayOf(item.startAt);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()];
  }, [calendar.data]);
  const clashes = (calendar.data?.items ?? []).filter((i) => i.clash).length;

  return (
    <div ref={page}>
      <PageHeader
        title="Schedules"
        lead="Record channels and shows automatically, on the days and times you choose."
        actions={
          <>
            <Button variant="ghost" icon="download" onClick={() => void exportAll()}>
              Export
            </Button>
            <Button variant="ghost" icon="plus" onClick={() => importer.current?.click()}>
              Import
            </Button>
            <input
              ref={importer}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importFile(file);
              }}
            />
            {list.length > 0 && (
              <Button
                icon={allPaused ? "play" : "pause"}
                onClick={() =>
                  void run(
                    () => client.pauseAllSchedules(!allPaused),
                    allPaused ? "All schedules resumed." : "All schedules paused.",
                  )
                }
              >
                {allPaused ? "Resume all" : "Pause all"}
              </Button>
            )}
            <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
              New schedule
            </Button>
          </>
        }
      />
      <Notice>{schedules.error}</Notice>

      {!schedules.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Schedules"
            value={list.length}
            icon="clock"
            hint={`${active.length} active`}
          />
          <Stat
            label="Next recording"
            value={next?.nextStart ? timeOf(next.nextStart) : "None"}
            icon="rec"
            tone={next ? "accent" : "paper"}
            hint={
              next?.nextStart ? `${dayOf(next.nextStart)} · ${next.title}` : "Nothing is planned"
            }
          />
          <Stat
            label="Clashes"
            value={clashes}
            icon="pulse"
            tone={clashes ? "warn" : "ok"}
            hint={clashes ? "Some recordings overlap" : "Everything fits"}
          />
        </div>
      )}

      {/* Repeating schedules */}
      <h2 className="mb-3 font-display text-xl font-semibold" data-reveal>
        Repeating schedules
      </h2>
      {!schedules.data ? (
        <Skeleton className="h-40" />
      ) : list.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No schedules yet"
          action={
            <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
              Create your first schedule
            </Button>
          }
        >
          A schedule records a channel at the same time on the days you pick: the evening news every
          weekday, a weekly show, or a one-off match. You can also record a programme straight from
          the Guide.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map((s) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ duration: 0.34, ease: EASE }}
                className={`surface flex flex-col gap-4 p-5 transition-opacity ${s.enabled ? "" : "opacity-70"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-lg font-semibold">{s.title}</h3>
                    <p className="truncate text-sm text-muted">
                      {s.channelName || "Custom stream"}
                    </p>
                  </div>
                  <ActionMenu
                    label={`Actions for ${s.title}`}
                    items={[
                      { label: "Edit", icon: "settings", onClick: () => setEditing(s) },
                      {
                        label: "Record now",
                        icon: "rec",
                        onClick: () =>
                          void run(() => client.runSchedule(s.id), "Recording started."),
                      },
                      {
                        label: "Duplicate",
                        icon: "copy",
                        onClick: () =>
                          void run(() => client.duplicateSchedule(s.id), "Schedule duplicated."),
                      },
                      {
                        label: "Delete",
                        icon: "trash",
                        danger: true,
                        onClick: () => setRemoving(s),
                      },
                    ]}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Repeats</dt>
                    <dd className="font-medium">{daysLabel(s.days, s.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Starts</dt>
                    <dd className="font-medium tabular">
                      {s.startTime} · {minutes(s.seconds)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Next</dt>
                    <dd className="font-medium">
                      {!s.enabled ? "Paused" : s.nextStart ? when(s.nextStart) : "Finished"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Padding</dt>
                    <dd className="font-medium tabular">
                      {minutes(s.padBefore)} before, {minutes(s.padAfter)} after
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <Toggle
                    checked={s.enabled}
                    label={s.enabled ? "Active" : "Paused"}
                    onChange={(on) =>
                      void run(
                        () => client.setScheduleEnabled(s.id, on),
                        on ? "Schedule resumed." : "Schedule paused.",
                      )
                    }
                  />
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {s.tag && <Badge tone="dusk">{s.tag}</Badge>}
                    {s.followGuide && <Badge tone="ok">follows guide</Badge>}
                    {s.keepLast ? <Badge>keeps last {s.keepLast}</Badge> : null}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Series rules */}
      <h2 className="mb-3 mt-10 font-display text-xl font-semibold" data-reveal>
        Series rules
      </h2>
      {!rules.data ? (
        <Skeleton className="h-24" />
      ) : rules.data.rules.length === 0 ? (
        <div className="surface px-[var(--card-pad)] py-6 text-sm leading-relaxed text-muted">
          A series rule records every episode of a show the guide lists. Add one from the Guide with
          “Record every episode”.
        </div>
      ) : (
        <ul className="surface divide-y divide-line">
          <AnimatePresence initial={false}>
            {rules.data.rules.map((r) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 px-[var(--card-pad)] py-4"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="truncate text-sm text-muted">
                    Every episode on {r.channelName || r.epgChannelId}
                  </p>
                </div>
                <Toggle
                  checked={r.enabled}
                  label={r.enabled ? "Active" : "Paused"}
                  onChange={(on) =>
                    void run(
                      () => client.setSeriesRuleEnabled(r.id, on),
                      on ? "Rule resumed." : "Rule paused.",
                    )
                  }
                />
                <Button variant="danger" icon="trash" onClick={() => setRemovingRule(r)}>
                  Delete
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Coming up */}
      <h2 className="mb-3 mt-10 font-display text-xl font-semibold" data-reveal>
        Coming up
      </h2>
      {clashes > 0 && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-paper"
        >
          <Icon name="pulse" size={18} className="mt-0.5 flex-none text-warn" />
          <span>
            <b>{clashes} recordings overlap.</b> More run at the same time than your account allows,
            so the extra ones will fail. Move one, shorten it, or ask an admin to raise your limit.
          </span>
        </p>
      )}
      {!calendar.data ? (
        <Skeleton className="h-32" />
      ) : upcoming.length === 0 ? (
        <div className="surface px-[var(--card-pad)] py-6 text-sm text-muted">
          Nothing is planned for the next days.
        </div>
      ) : (
        <div className="space-y-5">
          {upcoming.map(([day, items]) => (
            <section key={day} className="surface overflow-hidden">
              <h3 className="border-b border-line px-[var(--card-pad)] py-3 text-2xl font-bold text-paper">
                {day}
              </h3>
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 px-[var(--card-pad)] py-3.5"
                  >
                    <span className="w-28 flex-none font-medium tabular">
                      {timeOf(item.startAt)} – {timeOf(item.endAt)}
                    </span>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-semibold">{item.title}</p>
                      <p className="truncate text-sm text-muted">{item.channelName}</p>
                    </div>
                    {item.clash && <Badge tone="warn">overlaps another</Badge>}
                    {item.status === "recording" ? (
                      <Badge tone="accent">recording now</Badge>
                    ) : (
                      <Badge>{formatDuration(item.endAt - item.startAt)}</Badge>
                    )}
                    {item.status === "scheduled" && (
                      <Button variant="ghost" onClick={() => setCancelling(item)}>
                        Cancel
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ScheduleForm
          client={client}
          schedule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (text) => {
            say(text);
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Delete this schedule?"
          body={`“${removing.title}” will stop recording. Recordings it already made stay in your library.`}
          onClose={() => setRemoving(null)}
          onConfirm={() => run(() => client.deleteSchedule(removing.id), "Schedule deleted.")}
        />
      )}
      {removingRule && (
        <Confirm
          title="Delete this series rule?"
          body={`Vesper will stop recording every episode of “${removingRule.title}”.`}
          onClose={() => setRemovingRule(null)}
          onConfirm={() => run(() => client.deleteSeriesRule(removingRule.id), "Rule deleted.")}
        />
      )}
      {cancelling && (
        <Confirm
          title="Cancel this recording?"
          body={`“${cancelling.title}” on ${dayOf(cancelling.startAt)} at ${timeOf(cancelling.startAt)} will not be recorded. The schedule itself stays.`}
          confirm="Cancel recording"
          onClose={() => setCancelling(null)}
          onConfirm={() => run(() => client.deleteRecording(cancelling.id), "Recording cancelled.")}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

interface Form {
  title: string;
  channelName: string;
  url: string;
  epgId: string;
  startTime: string;
  minutes: string;
  days: number;
  startDate: string;
  endDate: string;
  padBefore: string;
  padAfter: string;
  keepHours: string;
  keepLast: string;
  tag: string;
  backupUrl: string;
  quality: "best" | "lowest";
  followGuide: boolean;
  tz: string;
}

const blank = (): Form => ({
  title: "",
  channelName: "",
  url: "",
  epgId: "",
  startTime: "20:00",
  minutes: "60",
  days: EVERY_DAY,
  startDate: today(),
  endDate: "",
  padBefore: "1",
  padAfter: "3",
  keepHours: "",
  keepLast: "",
  tag: "",
  backupUrl: "",
  quality: "best",
  followGuide: false,
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
});

const fromSchedule = (s: Schedule): Form => ({
  title: s.title,
  channelName: s.channelName,
  url: s.url,
  epgId: s.epgId,
  startTime: s.startTime,
  minutes: String(Math.round(s.seconds / 60)),
  days: s.days,
  startDate: s.startDate,
  endDate: s.endDate ?? "",
  padBefore: String(Math.round(s.padBefore / 60)),
  padAfter: String(Math.round(s.padAfter / 60)),
  keepHours: s.keepHours == null ? "" : String(s.keepHours),
  keepLast: s.keepLast ? String(s.keepLast) : "",
  tag: s.tag,
  backupUrl: s.backupUrl ?? "",
  quality: s.quality,
  followGuide: s.followGuide,
  tz: s.tz,
});

function ScheduleForm({
  client,
  schedule,
  onClose,
  onSaved,
}: {
  client: CloudClient;
  schedule: Schedule | null;
  onClose: () => void;
  onSaved: (text: string) => Promise<void>;
}) {
  const [f, setF] = useState<Form>(() => (schedule ? fromSchedule(schedule) : blank()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(Boolean(schedule?.backupUrl || schedule?.endDate));
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setF((old) => ({ ...old, [key]: value }));

  useEffect(() => {
    void client
      .listRecordings()
      .then((r) => setTags(r.tags))
      .catch(() => {});
  }, [client]);

  const keepOptions = KEEP_OPTIONS.some((o) => o.value === f.keepHours)
    ? KEEP_OPTIONS
    : [...KEEP_OPTIONS, { value: f.keepHours, label: `${f.keepHours} hours` }];

  const pickChannel = (c: Channel) =>
    setF((old) => ({
      ...old,
      channelName: c.name,
      url: c.url,
      epgId: c.id,
      backupUrl: old.backupUrl || c.alt[0] || "",
      title: old.title || c.name,
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const length = Number(f.minutes);
    if (!f.title.trim()) return setError("Give the schedule a title.");
    if (!f.url.trim()) return setError("Pick a channel, or paste a stream address.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.startTime))
      return setError("Use a start time like 21:30.");
    if (!Number.isFinite(length) || length < 1)
      return setError("The length must be at least a minute.");
    if (f.days === 0 && !f.startDate) return setError("A one-off recording needs a date.");
    if (f.endDate && f.endDate < f.startDate)
      return setError("The end date is before the start date.");
    const body: NewSchedule = {
      title: f.title.trim(),
      channel_name: f.channelName,
      url: f.url.trim(),
      tz: f.tz.trim() || "UTC",
      start_time: f.startTime,
      seconds: Math.round(length * 60),
      days: f.days,
      start_date: f.startDate || today(),
      end_date: f.endDate || null,
      pad_before: Math.max(0, Number(f.padBefore) || 0) * 60,
      pad_after: Math.max(0, Number(f.padAfter) || 0) * 60,
      keep_last: f.keepLast ? Math.max(1, Number(f.keepLast)) : null,
      backup_url: f.backupUrl.trim() || null,
      quality: f.quality,
      tag: f.tag.trim(),
      epg_id: f.epgId,
      follow_guide: f.followGuide && Boolean(f.epgId),
      enabled: schedule?.enabled ?? true,
    };
    if (f.keepHours !== "") body.keep_hours = Number(f.keepHours);
    setBusy(true);
    setError(null);
    try {
      const r = schedule
        ? await client.updateSchedule(schedule.id, body)
        : await client.createSchedule(body);
      const warn = r.warnings?.[0];
      await onSaved(warn ? `Saved. ${warn}` : schedule ? "Schedule saved." : "Schedule created.");
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  const once = f.days === 0;

  return (
    <Modal title={schedule ? "Edit schedule" : "New schedule"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-6">
        <Notice>{error}</Notice>

        <Field
          label="Title"
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Evening news"
        />

        <ChannelPicker client={client} f={f} onPick={pickChannel} onUrl={(u) => set("url", u)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start time"
            type="time"
            value={f.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
          <Field
            label="Length (minutes)"
            type="number"
            min={1}
            value={f.minutes}
            onChange={(e) => set("minutes", e.target.value)}
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Repeats</legend>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Once", mask: 0 },
              { label: "Every day", mask: EVERY_DAY },
              { label: "Weekdays", mask: WEEKDAYS },
              { label: "Weekends", mask: WEEKEND },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={f.days === p.mask}
                onClick={() => set("days", p.mask)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors ${f.days === p.mask ? "bg-accent text-on-accent ring-accent" : "bg-sunken text-muted ring-line hover:text-paper"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Days of the week">
            {DAY_NAMES.map((name, i) => {
              const on = Boolean(f.days & (1 << i));
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("days", f.days ^ (1 << i))}
                  className={`grid size-11 place-items-center rounded-lg text-sm font-semibold ring-1 transition-colors ${on ? "bg-raised text-paper ring-accent" : "bg-sunken text-muted ring-line hover:text-paper"}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted">
            {once ? "Records one time, on the start date." : daysLabel(f.days, f.startDate)}
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={once ? "Date" : "Starts on"}
            type="date"
            value={f.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
          <Field
            label="Folder"
            list="schedule-folders"
            value={f.tag}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="News"
            hint="Recordings are put in this folder."
          />
          <datalist id="schedule-folders">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Start early (min)"
            type="number"
            min={0}
            max={60}
            value={f.padBefore}
            onChange={(e) => set("padBefore", e.target.value)}
          />
          <Field
            label="End late (min)"
            type="number"
            min={0}
            max={60}
            value={f.padAfter}
            onChange={(e) => set("padAfter", e.target.value)}
          />
          <Select
            label="Keep each for"
            value={f.keepHours}
            onChange={(e) => set("keepHours", e.target.value)}
          >
            {keepOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Field
            label="Keep only the newest"
            type="number"
            min={1}
            placeholder="All"
            value={f.keepLast}
            onChange={(e) => set("keepLast", e.target.value)}
          />
        </div>

        <Toggle
          checked={f.followGuide && Boolean(f.epgId)}
          onChange={(v) => set("followGuide", v)}
          label="Follow the guide"
          hint={
            f.epgId
              ? "If the programme runs over, keep recording until the guide says it ended."
              : "Pick a channel that is in the TV guide to turn this on."
          }
        />

        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="text-sm font-medium text-muted hover:text-paper"
        >
          {advanced ? "Hide" : "Show"} more options
        </button>
        <AnimatePresence initial={false}>
          {advanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="grid gap-4 pb-1 sm:grid-cols-2">
                <Field
                  label="Ends on (optional)"
                  type="date"
                  value={f.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
                <Select
                  label="Quality"
                  value={f.quality}
                  onChange={(e) => set("quality", e.target.value as Form["quality"])}
                >
                  <option value="best">Best available</option>
                  <option value="lowest">Smallest files</option>
                </Select>
                <Field
                  label="Backup stream address"
                  value={f.backupUrl}
                  onChange={(e) => set("backupUrl", e.target.value)}
                  placeholder="Tried when the first keeps failing"
                />
                <Field
                  label="Time zone"
                  value={f.tz}
                  onChange={(e) => set("tz", e.target.value)}
                  hint="The start time is read in this zone."
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : schedule ? "Save changes" : "Create schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Search the playlists for a channel, or paste a stream address by hand. */
function ChannelPicker({
  client,
  f,
  onPick,
  onUrl,
}: {
  client: CloudClient;
  f: Form;
  onPick: (c: Channel) => void;
  onUrl: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Channel[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [changing, setChanging] = useState(!f.url);
  const [noPlaylist, setNoPlaylist] = useState(false);

  const search = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const r = await client.channels("all", { q, kind: "live", limit: 24 });
        setResults(r.channels);
        setNoPlaylist(false);
      } catch {
        // `all` fails when there is no playlist at all.
        setResults([]);
        setNoPlaylist(true);
      } finally {
        setSearching(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!changing) return;
    const timer = setTimeout(() => void search(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, changing, search]);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Channel</span>
      {!changing && f.url ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken px-4 py-3">
          <Icon name="live" size={18} className="flex-none text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{f.channelName || "Custom stream"}</p>
            <p className="truncate text-sm text-muted">{f.url}</p>
          </div>
          <Button variant="ghost" onClick={() => setChanging(true)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your channels"
              aria-label="Search channels"
              className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
            {searching && !results ? (
              <Skeleton className="h-24 rounded-none" />
            ) : results?.length ? (
              <ul className="divide-y divide-line">
                {results.map((c) => (
                  <li key={c.url}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(c);
                        setChanging(false);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-raised"
                    >
                      <span className="grid size-10 flex-none place-items-center overflow-hidden rounded-md bg-sunken">
                        {c.logo ? (
                          <img
                            src={c.logo}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <Icon name="live" size={16} className="text-muted" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {c.group || "Live"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-5 text-sm text-muted">
                {noPlaylist
                  ? "No playlists yet. Add one under Live TV, or paste a stream address below."
                  : "No channels match."}
              </p>
            )}
          </div>
          {f.url && (
            <Button variant="ghost" onClick={() => setChanging(false)}>
              Keep the current channel
            </Button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        aria-expanded={manual}
        className="mt-3 text-sm font-medium text-muted hover:text-paper"
      >
        Or paste a stream address
      </button>
      {manual && (
        <div className="mt-2">
          <Field
            label="Stream address"
            value={f.url}
            onChange={(e) => {
              onUrl(e.target.value);
              if (e.target.value) setChanging(false);
            }}
            placeholder="http://provider.example/live/1234.ts"
          />
        </div>
      )}
    </div>
  );
}
