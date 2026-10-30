import { useEffect, useMemo, useState } from "react";
import { ChannelLogo, cleanName } from "../components/cards";
import { CircleDotIcon, PlayIcon } from "../components/icons";
import { Button, Notice, PageHeader, Spinner } from "../components/ui";
import { formatClock, formatDay } from "../lib/epg";
import { catchupPlayable, useAuth } from "../lib/playable";
import { beginRecording, canRecord } from "../lib/recorder";
import { useStore } from "../lib/store";
import type { Channel, Programme } from "../lib/types";
import { getFullGuide } from "../lib/xtream";
import { NoSources } from "./no-sources";

const DAY = 86_400;

export function Catchup() {
  const channels = useStore((s) => s.channels);
  const group = useStore((s) => s.group);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [selected, setSelected] = useState<Channel | null>(null);

  const archived = useMemo(
    () =>
      channels.filter(
        (c) =>
          (c.archiveDays ?? 0) > 0 &&
          (!group || c.group === group) &&
          (!query || c.name.toLowerCase().includes(query)),
      ),
    [channels, group, query],
  );

  if (channels.length === 0) return <NoSources />;

  return (
    <div>
      <PageHeader title="Catch-up" count={archived.length} />
      {archived.length === 0 ? (
        <Notice title="No catch-up channels">
          Your provider does not mark any channel as keeping an archive, or nothing matches your
          search.
        </Notice>
      ) : (
        <div className="grid grid-cols-[20rem_1fr] gap-6">
          <ul
            className="surface max-h-[calc(100vh-14rem)] overflow-y-auto p-2"
            aria-label="Channels with catch-up"
          >
            {archived.slice(0, 300).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  aria-current={selected?.id === c.id ? "true" : undefined}
                  className="fade flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised aria-[current=true]:bg-tint aria-[current=true]:font-semibold aria-[current=true]:text-accent"
                >
                  <ChannelLogo channel={c} size={30} />
                  <span className="min-w-0 flex-1 truncate">{cleanName(c.name)}</span>
                  <span className="text-xs text-muted">{c.archiveDays}d</span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <Programmes key={selected.id} channel={selected} />
          ) : (
            <Notice title="Pick a channel">
              Choose a channel to see programmes you can still watch.
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}

function Programmes({ channel }: { channel: Channel }) {
  const auth = useAuth(channel.providerId);
  const play = useStore((s) => s.play);
  const [list, setList] = useState<Programme[] | null>(null);

  useEffect(() => {
    if (!auth || channel.streamId === undefined) return;
    let cancelled = false;
    getFullGuide(auth, channel.streamId)
      .then((all) => {
        if (cancelled) return;
        const now = Date.now() / 1000;
        const oldest = now - (channel.archiveDays ?? 0) * DAY;
        setList(
          all.filter((p) => p.start >= oldest && p.end <= now).sort((a, b) => b.start - a.start),
        );
      })
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [auth, channel]);

  if (!auth) return null;
  if (list === null) return <Spinner />;
  if (list.length === 0) {
    return (
      <Notice title="Nothing to catch up on">
        The guide has no finished programmes for this channel.
      </Notice>
    );
  }

  return (
    <ul className="flex max-h-[calc(100vh-14rem)] flex-col gap-2 overflow-y-auto">
      {list.map((p) => (
        <li key={p.id} className="surface flex items-center gap-4 px-5 py-3">
          <div className="w-36 flex-none text-xs text-muted">
            {formatDay(p.start)}
            <br />
            {formatClock(p.start)} – {formatClock(p.end)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{p.title}</p>
            {p.description && <p className="line-clamp-1 text-xs text-muted">{p.description}</p>}
          </div>
          {canRecord() && (
            <Button
              variant="ghost"
              icon={CircleDotIcon}
              onClick={() => {
                const item = catchupPlayable(channel, p, auth);
                void beginRecording(p.title, channel.name, item.url, p.end - p.start);
              }}
            >
              Record
            </Button>
          )}
          <Button
            variant="primary"
            icon={PlayIcon}
            onClick={() => play(catchupPlayable(channel, p, auth))}
          >
            Watch
          </Button>
        </li>
      ))}
    </ul>
  );
}
