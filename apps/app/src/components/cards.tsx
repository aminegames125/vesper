import { type ReactNode, useRef, useState } from "react";
import { nowNext } from "../lib/epg";
import { useGuide, useSeen } from "../lib/guide-cache";
import { channelPlayable } from "../lib/playable";
import { useStore } from "../lib/store";
import type { Channel, Movie, Show } from "../lib/types";
import { ChevronLeftIcon, ChevronRightIcon, HeartIcon, IconButton, PlayIcon } from "./icons";

const QUALITY = /\s*\((\d{3,4}p)\)\s*$/;

export const cleanName = (name: string) => name.replace(QUALITY, "");

const initialsOf = (name: string) =>
  cleanName(name)
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 2)
    .toUpperCase();

export function ChannelLogo({ channel, size = 40 }: { channel: Channel; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="flex flex-none items-center justify-center overflow-hidden rounded-lg bg-raised"
      style={{ width: size * 1.4, height: size }}
    >
      {channel.logo && !failed ? (
        <img
          src={channel.logo}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-contain p-1"
        />
      ) : (
        <span className="text-sm font-bold text-muted">{initialsOf(channel.name)}</span>
      )}
    </span>
  );
}

/** Heart that sits on a card; fills when the item is a favourite. */
function FavoriteButton({ id, name }: { id: string; name: string }) {
  const on = useStore((s) => s.favorites.includes(id));
  const toggle = useStore((s) => s.toggleFavorite);
  return (
    <IconButton
      icon={HeartIcon}
      label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      active={on}
      size={17}
      className={`size-8 bg-black/55 text-white hover:bg-black/75 ${on ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
    />
  );
}

/** Tile for the live grid: logo, name, what is on now and how far through it is. */
export function ChannelCard({ channel, list }: { channel: Channel; list: Channel[] }) {
  const play = useStore((s) => s.play);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const guide = useGuide(channel, seen, 3);
  const { now, progress } = nowNext(guide ?? []);
  const title = cleanName(channel.name);
  const quality = channel.name.match(QUALITY)?.[1];

  return (
    <div ref={ref} className="group surface lift relative overflow-hidden">
      <button
        type="button"
        onClick={() => play(channelPlayable(channel), list)}
        className="block w-full text-left"
      >
        <span className="relative flex aspect-video items-center justify-center bg-raised">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.hidden = true;
              }}
              className="size-full object-contain p-6"
            />
          ) : (
            <span className="font-display text-3xl font-bold text-muted">
              {initialsOf(channel.name)}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-on-accent">
              <PlayIcon size={22} color="currentColor" isAnimated={false} />
            </span>
          </span>
          {quality && (
            <span className="absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {quality}
            </span>
          )}
          {progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          )}
        </span>
        <span className="block px-3.5 py-3">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className="block h-4 truncate text-xs text-muted">
            {now?.title ?? channel.group}
          </span>
        </span>
      </button>
      <span className="absolute right-2 top-2">
        <FavoriteButton id={channel.id} name={title} />
      </span>
    </div>
  );
}

/** One line of the dense channel list. */
export function ChannelRow({ channel, list }: { channel: Channel; list: Channel[] }) {
  const play = useStore((s) => s.play);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const guide = useGuide(channel, seen, 3);
  const { now, progress } = nowNext(guide ?? []);
  const title = cleanName(channel.name);

  return (
    <div ref={ref} className="group flex items-center rounded-xl hover:bg-raised">
      <button
        type="button"
        onClick={() => play(channelPlayable(channel), list)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-3 py-2.5 text-left"
      >
        <ChannelLogo channel={channel} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{title}</span>
          <span className="block h-4 truncate text-xs text-muted">
            {now?.title ?? channel.group}
          </span>
          {now && (
            <span className="mt-1 block h-0.5 overflow-hidden rounded bg-line">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          )}
        </span>
      </button>
      <span className="mr-2">
        <FavoriteButton id={channel.id} name={title} />
      </span>
    </div>
  );
}

export function PosterCard({
  kind,
  item,
  rank,
}: {
  kind: "movie" | "show";
  item: Movie | Show;
  rank?: number;
}) {
  const openDetail = useStore((s) => s.openDetail);
  const [failed, setFailed] = useState(false);
  const image = kind === "movie" ? (item as Movie).poster : (item as Show).cover;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => openDetail(kind, item.id)}
        className="lift surface block w-full overflow-hidden text-left"
      >
        <span className="relative block aspect-[2/3] bg-raised">
          {image && !failed ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              onError={() => setFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center p-4 text-center font-display text-lg font-bold text-muted">
              {item.name}
            </span>
          )}
          {item.rating ? (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
              ★ {item.rating.toFixed(1)}
            </span>
          ) : null}
          {rank !== undefined && (
            <span className="absolute left-0 top-0 rounded-br-xl bg-accent px-2.5 py-1 font-display text-lg font-bold text-on-accent">
              {rank}
            </span>
          )}
        </span>
        <span className="block truncate px-3 py-2.5 text-sm font-medium">{item.name}</span>
      </button>
      <span className="absolute right-2 top-2">
        <FavoriteButton id={item.id} name={item.name} />
      </span>
    </div>
  );
}

/** A titled row that scrolls sideways, Netflix-style. */
export function Rail({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {action}
          <IconButton
            icon={ChevronLeftIcon}
            label={`Scroll ${title} left`}
            size={18}
            className="size-8"
            onClick={() => scroll(-1)}
          />
          <IconButton
            icon={ChevronRightIcon}
            label={`Scroll ${title} right`}
            size={18}
            className="size-8"
            onClick={() => scroll(1)}
          />
        </div>
      </div>
      <div ref={ref} className="rail-scroll -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {children}
      </div>
    </section>
  );
}
