import { useMemo, useRef, useState } from "react";
import { ChannelLogo, cleanName } from "../components/cards";
import { CalendarPlusIcon, CircleDotIcon, PlayIcon } from "../components/icons";
import { Dialog } from "../components/onboarding";
import { Paged } from "../components/paged";
import { Button, Chip, Notice, PageHeader } from "../components/ui";
import { useCloud } from "../lib/cloud";
import { formatClock, formatDay } from "../lib/epg";
import { useGuide, useSeen } from "../lib/guide-cache";
import { groupBy } from "../lib/m3u";
import { channelPlayable } from "../lib/playable";
import { beginRecording, canRecord } from "../lib/recorder";
import { useStore } from "../lib/store";
import type { Channel, Programme } from "../lib/types";
import { NoSources } from "./no-sources";

const PX_PER_MIN = 4;
const HOURS = 8;
const LEFT = 192;
const slot = 30 * 60;

export function Guide() {
  const channels = useStore((s) => s.channels);
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const favorites = useStore((s) => s.favorites);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [picked, setPicked] = useState<{ channel: Channel; programme: Programme } | null>(null);

  const start = useMemo(() => Math.floor((Date.now() / 1000 - 30 * 60) / slot) * slot, []);
  const end = start + HOURS * 3600;
  const width = ((end - start) / 60) * PX_PER_MIN;

  const groups = useMemo(() => groupBy(channels), [channels]);
  const visible = useMemo(() => {
    let list = channels;
    if (group) list = list.filter((c) => c.group === group);
    if (onlyFavorites) list = list.filter((c) => favorites.includes(c.id));
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query));
    return list;
  }, [channels, group, onlyFavorites, favorites, query]);

  if (channels.length === 0) return <NoSources />;

  const ticks = Array.from({ length: HOURS * 2 }, (_, i) => start + i * slot);
  const nowX = ((Date.now() / 1000 - start) / 60) * PX_PER_MIN;

  return (
    <div>
      <PageHeader title="Guide" count={visible.length}>
        <Chip
          active={!group && !onlyFavorites}
          onClick={() => {
            setGroup("");
            setOnlyFavorites(false);
          }}
        >
          All
        </Chip>
        <Chip active={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}>
          Favourites
        </Chip>
        {groups.slice(0, 14).map(([name]) => (
          <Chip
            key={name}
            active={group === name}
            onClick={() => setGroup(group === name ? "" : name)}
          >
            {name}
          </Chip>
        ))}
      </PageHeader>

      {visible.length === 0 ? (
        <Notice title="No channels here">Try another category.</Notice>
      ) : (
        <div className="surface max-h-[calc(100vh-14rem)] overflow-auto">
          <div className="relative" style={{ width: LEFT + width }}>
            <div className="sticky top-0 z-20 flex border-b border-line bg-panel">
              <div
                className="sticky left-0 z-10 flex-none border-r border-line bg-panel"
                style={{ width: LEFT }}
              />
              {ticks.map((t) => (
                <div
                  key={t}
                  className="flex-none border-l border-line px-2 py-2 text-xs text-muted"
                  style={{ width: (slot / 60) * PX_PER_MIN }}
                >
                  {formatClock(t)}
                </div>
              ))}
            </div>
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-accent"
              style={{ left: LEFT + nowX }}
            />
            <Paged
              items={visible}
              list
              pageSize={30}
              render={(c) => (
                <GuideRow
                  channel={c}
                  start={start}
                  end={end}
                  onPick={(programme) => setPicked({ channel: c, programme })}
                />
              )}
            />
          </div>
        </div>
      )}

      {picked && <ProgrammeDialog {...picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function GuideRow({
  channel,
  start,
  end,
  onPick,
}: {
  channel: Channel;
  start: number;
  end: number;
  onPick: (programme: Programme) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const guide = useGuide(channel, seen, 30);
  const play = useStore((s) => s.play);
  const now = Date.now() / 1000;

  return (
    <div ref={ref} className="flex border-b border-line/60">
      <button
        type="button"
        onClick={() => play(channelPlayable(channel))}
        className="fade sticky left-0 z-10 flex flex-none items-center gap-3 border-r border-line bg-panel px-3 py-2 text-left hover:bg-raised"
        style={{ width: LEFT }}
      >
        <ChannelLogo channel={channel} size={28} />
        <span className="truncate text-sm font-medium">{cleanName(channel.name)}</span>
      </button>
      <div className="relative h-14 flex-none" style={{ width: ((end - start) / 60) * PX_PER_MIN }}>
        {(guide ?? [])
          .filter((p) => p.end > start && p.start < end)
          .map((p) => {
            const from = Math.max(p.start, start);
            const to = Math.min(p.end, end);
            const live = p.start <= now && now < p.end;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                title={p.title}
                className={`fade absolute top-1 bottom-1 overflow-hidden rounded-lg px-2.5 text-left text-xs hover:brightness-125 ${live ? "bg-tint text-accent" : "bg-raised"}`}
                style={{
                  left: ((from - start) / 60) * PX_PER_MIN + 1,
                  width: ((to - from) / 60) * PX_PER_MIN - 2,
                }}
              >
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="block truncate text-muted">
                  {formatClock(p.start)} – {formatClock(p.end)}
                </span>
              </button>
            );
          })}
        {guide !== null && guide.length === 0 && (
          <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted">
            No guide data
          </span>
        )}
      </div>
    </div>
  );
}

function ProgrammeDialog({
  channel,
  programme,
  onClose,
}: {
  channel: Channel;
  programme: Programme;
  onClose: () => void;
}) {
  const cloud = useCloud();
  const play = useStore((s) => s.play);
  const addScheduled = useStore((s) => s.addScheduled);
  const notify = useStore((s) => s.notify);
  const scheduledIds = useStore((s) => s.scheduled);
  const now = Date.now() / 1000;
  const live = programme.start <= now && now < programme.end;
  const upcoming = programme.start > now;
  const already = scheduledIds.some((s) => s.id === `${channel.id}:${programme.start}`);

  return (
    <Dialog title={programme.title || "Programme"} onClose={onClose}>
      <p className="text-sm text-muted">
        {cleanName(channel.name)} · {formatDay(programme.start)}, {formatClock(programme.start)} –{" "}
        {formatClock(programme.end)}
      </p>
      <p className="mt-4 text-sm leading-relaxed">
        {programme.description || "No description available."}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {live && canRecord() && (
          <Button
            icon={CircleDotIcon}
            onClick={() => {
              onClose();
              void beginRecording(
                programme.title,
                channel.name,
                channel.url,
                Math.ceil(programme.end - now) + 60,
              );
            }}
          >
            Record the rest
          </Button>
        )}
        {upcoming && canRecord() && (
          <Button
            icon={CalendarPlusIcon}
            disabled={already}
            onClick={() => {
              addScheduled({
                id: `${channel.id}:${programme.start}`,
                title: programme.title,
                channel,
                start: programme.start,
                end: programme.end,
              });
              notify(`Scheduled “${programme.title}” for ${formatClock(programme.start)}`);
              onClose();
            }}
          >
            {already ? "Scheduled" : "Schedule recording"}
          </Button>
        )}
        {cloud && (live || upcoming) && (
          <Button
            icon={CalendarPlusIcon}
            onClick={() => {
              // The server starts a minute early and ends a minute late, so the programme is never clipped.
              const startAt = Math.max(Math.floor(now), programme.start - 60);
              const seconds = Math.ceil(programme.end + 60 - startAt);
              cloud
                .createRecording({
                  title: programme.title,
                  channel_name: channel.name,
                  url: channel.url,
                  seconds,
                  start_at: startAt,
                })
                .then(() =>
                  notify(
                    upcoming
                      ? `Cloud will record “${programme.title}”`
                      : "Recording the rest in the cloud",
                  ),
                )
                .catch((e) =>
                  notify(e instanceof Error ? e.message : "Could not schedule in the cloud."),
                );
              onClose();
            }}
          >
            {upcoming ? "Record in the cloud" : "Record the rest in the cloud"}
          </Button>
        )}
        <Button
          variant="primary"
          icon={PlayIcon}
          onClick={() => {
            onClose();
            play(channelPlayable(channel));
          }}
        >
          Watch channel
        </Button>
      </div>
    </Dialog>
  );
}
