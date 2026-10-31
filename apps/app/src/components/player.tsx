import Hls from "hls.js";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useCloud } from "../lib/cloud";
import { formatClock, nowNext } from "../lib/epg";
import { isDesktop } from "../lib/fetch-text";
import { useGuide } from "../lib/guide-cache";
import { NativeLoader } from "../lib/hls-loader";
import { channelPlayable } from "../lib/playable";
import { beginRecording, canRecord } from "../lib/recorder";
import { useStore } from "../lib/store";
import type { Playable } from "../lib/types";
import { exitFullscreen, toggleFullscreen } from "../lib/window";
import { ChannelLogo, cleanName } from "./cards";
import {
  CircleDotIcon,
  FastForwardIcon,
  HeartIcon,
  IconButton,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  RewindIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SlidersHorizontalIcon,
  Volume2Icon,
  VolumeOffIcon,
  XIcon,
} from "./icons";

type Menu = null | "settings" | "record" | "channels";
type Fit = "contain" | "cover" | "fill";

const FITS: { value: Fit; label: string }[] = [
  { value: "contain", label: "Fit" },
  { value: "cover", label: "Fill" },
  { value: "fill", label: "Stretch" },
];
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const LENGTHS = [15, 30, 60, 120, 180];

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

export default function Player({ item }: { item: Playable }) {
  const play = useStore((s) => s.play);
  const zap = useStore((s) => s.zap);
  const saveProgress = useStore((s) => s.saveProgress);
  const favorite = useStore((s) => s.favorites.includes(item.channel?.id ?? item.id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const recordMinutes = useStore((s) => s.recordMinutes);
  const cloud = useCloud();
  const [where, setWhere] = useState<"device" | "cloud">(canRecord() ? "device" : "cloud");
  const [keepHours, setKeepHours] = useState(0);
  const setRecordMinutes = useStore((s) => s.setRecordMinutes);
  const notify = useStore((s) => s.notify);

  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resumeAt = useRef(
    useStore.getState().history.find((h) => h.item.id === item.id)?.position ?? 0,
  );

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [height, setHeight] = useState(0);
  const [fit, setFit] = useState<Fit>("contain");
  const [speed, setSpeed] = useState(1);
  const [full, setFull] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [audio, setAudio] = useState<{ id: number; name: string }[]>([]);
  const [audioId, setAudioId] = useState(0);
  const [subs, setSubs] = useState<{ id: number; name: string }[]>([]);
  const [subId, setSubId] = useState(-1);
  const [upNextDismissed, setUpNextDismissed] = useState(false);

  const flash = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 900);
  }, []);

  const channel = item.channel;
  const guide = useGuide(
    channel ?? { id: "", providerId: "", name: "", url: "", group: "" },
    !!channel,
    4,
  );
  const { now, next, progress } = nowNext(guide ?? []);

  // Wire the stream. Re-runs when the item changes or the viewer presses Retry.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    setError(null);
    setBuffering(true);
    setLevels([]);
    setLevel(-1);
    setAudio([]);
    setSubs([]);
    setUpNextDismissed(false);
    try {
      const saved = localStorage.getItem("vesper.volume");
      if (saved !== null) el.volume = Math.min(1, Math.max(0, Number(saved)));
    } catch {
      // storage can be unavailable; the default volume is fine
    }

    const isHls = item.live || /\.m3u8(\?|$)/i.test(item.url);
    const resume = () => {
      if (resumeAt.current > 5) el.currentTime = resumeAt.current;
    };
    if (isHls && Hls.isSupported()) {
      const instance = new Hls({
        lowLatencyMode: true,
        // On desktop, load through the native client: IPTV hosts rarely allow cross-origin requests.
        ...(isDesktop()
          ? { loader: NativeLoader as unknown as typeof Hls.DefaultConfig.loader }
          : {}),
      });
      hls.current = instance;
      instance.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(
          data.levels.map((l, index) => ({ height: l.height, index })).filter((l) => l.height),
        );
        resume();
      });
      instance.on(Hls.Events.LEVEL_SWITCHED, (_, data) =>
        setHeight(instance.levels[data.level]?.height ?? 0),
      );
      const syncTracks = () => {
        setAudio(
          instance.audioTracks.map((t) => ({
            id: t.id,
            name: t.name || t.lang || `Track ${t.id + 1}`,
          })),
        );
        setAudioId(instance.audioTrack);
        setSubs(
          instance.subtitleTracks.map((t) => ({
            id: t.id,
            name: t.name || t.lang || `Track ${t.id + 1}`,
          })),
        );
        setSubId(instance.subtitleTrack);
      };
      instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncTracks);
      instance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, syncTracks);
      let retries = 0;
      instance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && ++retries <= 3) instance.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retries++ < 3)
          instance.recoverMediaError();
        else setError(`This stream could not be played (${data.details}).`);
      });
      instance.loadSource(item.url);
      instance.attachMedia(el);
    } else {
      el.src = item.url;
      el.onerror = () => setError("This stream could not be played.");
      el.onloadedmetadata = () => {
        resume();
        setHeight(el.videoHeight);
      };
    }
    el.play().catch(() => setPlaying(false));

    return () => {
      hls.current?.destroy();
      hls.current = null;
      el.onerror = null;
      el.onloadedmetadata = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [item.url, item.live, attempt]);

  // Remember where a movie or episode was left, so it appears under Continue Watching.
  useEffect(() => {
    if (item.live) return;
    const save = () => {
      const el = video.current;
      if (el && Number.isFinite(el.duration)) saveProgress(item, el.currentTime, el.duration);
    };
    const timer = setInterval(save, 5000);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [item, saveProgress]);

  const close = useCallback(() => {
    void exitFullscreen();
    play(null);
  }, [play]);

  const wake = useCallback(() => {
    setShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), 3200);
  }, []);

  useEffect(() => {
    wake();
    return () => clearTimeout(hideTimer.current);
  }, [wake]);

  const togglePlay = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback(
    (delta: number) => {
      const el = video.current;
      if (el && Number.isFinite(el.duration)) {
        el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
        flash(delta > 0 ? `+${delta}s` : `${delta}s`);
      }
    },
    [flash],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!item.channel || zap.length < 2) return;
      const i = zap.findIndex((c) => c.id === item.channel?.id);
      const target = zap[(i + dir + zap.length) % zap.length];
      resumeAt.current = 0;
      if (target) play(channelPlayable(target));
    },
    [item.channel, zap, play],
  );

  const fullscreen = useCallback(async () => setFull(await toggleFullscreen()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input, select, textarea")) return;
      wake();
      switch (e.key) {
        case "Escape":
          if (menu) setMenu(null);
          else close();
          break;
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          void fullscreen();
          break;
        case "m":
          if (video.current) video.current.muted = !video.current.muted;
          break;
        case "ArrowLeft":
        case "j":
          if (!item.live) seek(-10);
          break;
        case "ArrowRight":
        case "l":
          if (!item.live) seek(10);
          break;
        case "Home":
        case "End":
          if (!item.live && video.current && Number.isFinite(video.current.duration))
            video.current.currentTime = e.key === "Home" ? 0 : video.current.duration - 1;
          break;
        case "<":
        case ">": {
          const el = video.current;
          if (el && !item.live) {
            el.playbackRate = Math.min(
              2,
              Math.max(0.5, el.playbackRate + (e.key === ">" ? 0.25 : -0.25)),
            );
            setSpeed(el.playbackRate);
            flash(`${el.playbackRate}x`);
          }
          break;
        }
        case "ArrowUp":
          if (item.live) step(-1);
          else if (video.current) video.current.volume = Math.min(1, video.current.volume + 0.1);
          break;
        case "ArrowDown":
          if (item.live) step(1);
          else if (video.current) video.current.volume = Math.max(0, video.current.volume - 0.1);
          break;
        default:
          if (
            /^[0-9]$/.test(e.key) &&
            !item.live &&
            video.current &&
            Number.isFinite(video.current.duration)
          )
            video.current.currentTime = (Number(e.key) / 10) * video.current.duration;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, flash, fullscreen, item.live, menu, seek, step, togglePlay, wake]);

  const record = async (minutes: number) => {
    setMenu(null);
    setRecordMinutes(minutes);
    if (where === "cloud" && cloud) {
      try {
        await cloud.createRecording({
          title: item.title,
          channel_name: item.subtitle ?? item.title,
          url: item.url,
          seconds: minutes * 60,
          keep_hours: keepHours,
        });
        notify(`Recording “${item.title}” in the cloud`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start the cloud recording.");
      }
      return;
    }
    await beginRecording(item.title, item.subtitle ?? item.title, item.url, minutes * 60);
  };

  const pip = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.current?.requestPictureInPicture();
    } catch {
      notify("Picture-in-picture is not available here.");
    }
  };

  const untilEnd = now ? Math.max(1, Math.ceil((now.end - Date.now() / 1000) / 60)) : 0;

  return (
    <div
      data-player
      className="scope-dark fixed inset-0 z-40 bg-black text-paper"
      onMouseMove={wake}
      style={{ cursor: shown ? "default" : "none" }}
    >
      <video
        ref={video}
        autoPlay
        playsInline
        onClick={() => {
          setMenu(null);
          if (!item.live) togglePlay();
        }}
        onDoubleClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - box.left) / box.width;
          if (!item.live && x < 0.33) seek(-10);
          else if (!item.live && x > 0.67) seek(10);
          else void fullscreen();
        }}
        onEnded={() => {
          if (item.next) play(item.next);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
          try {
            localStorage.setItem("vesper.volume", String(e.currentTarget.volume));
          } catch {
            // not worth failing playback over
          }
        }}
        onProgress={(e) => {
          const el = e.currentTarget;
          for (let i = 0; i < el.buffered.length; i++)
            if (el.currentTime >= el.buffered.start(i) && el.currentTime <= el.buffered.end(i))
              setBuffered(el.buffered.end(i));
        }}
        onTimeUpdate={(e) =>
          setTime({ now: e.currentTarget.currentTime, total: e.currentTarget.duration })
        }
        onResize={(e) => setHeight(e.currentTarget.videoHeight)}
        style={{ objectFit: fit }}
        className="size-full"
      />

      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full bg-black/70 px-5 py-2 text-lg font-semibold backdrop-blur">
          {toast}
        </div>
      )}

      {item.next && !upNextDismissed && time.total > 60 && time.total - time.now < 20 && (
        <div className="glass absolute bottom-32 right-6 w-72 rounded-2xl border border-line p-4 shadow-xl">
          <p className="truncate font-semibold">{item.next.title}</p>
          <p className="mt-0.5 text-sm tabular-nums text-muted">
            Starts in {Math.max(0, Math.ceil(time.total - time.now))}s
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => item.next && play(item.next)}
              className="fade rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-white/90"
            >
              Play now
            </button>
            <button
              type="button"
              onClick={() => setUpNextDismissed(true)}
              className="fade rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="size-12 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 text-center">
          <p className="text-lg font-semibold">{error}</p>
          <p className="max-w-md text-sm text-muted">
            The channel may be offline, or your provider limits how many streams can play at once.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="fade rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent hover:brightness-110"
            >
              Try again
            </button>
            {item.live && zap.length > 1 && (
              <button
                type="button"
                onClick={() => step(1)}
                className="fade rounded-full bg-white/10 px-5 py-2 text-sm font-medium hover:bg-white/20"
              >
                Next channel
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="fade rounded-full bg-white/10 px-5 py-2 text-sm font-medium hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-200 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {/* top bar */}
        <div className="flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-5 pb-10 pt-4">
          <IconButton
            icon={XIcon}
            label="Close player"
            onClick={close}
            className="bg-white/10 hover:bg-white/20"
          />
          {item.live && (
            <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold tracking-wider text-on-accent">
              LIVE
            </span>
          )}
          {height > 0 && (
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold">
              {height}p
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              icon={PictureInPictureIcon}
              label="Picture in picture"
              onClick={() => void pip()}
            />
            <IconButton
              icon={full ? MinimizeIcon : MaximizeIcon}
              label={full ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void fullscreen()}
            />
          </div>
        </div>

        {/* bottom controls */}
        <div className="relative bg-gradient-to-t from-black/90 via-black/60 to-transparent px-6 pb-5 pt-16">
          {menu === "settings" && (
            <Panel title="Playback">
              {levels.length > 1 && (
                <Group label="Quality">
                  <Pill
                    on={level === -1}
                    onClick={() => {
                      setLevel(-1);
                      if (hls.current) hls.current.currentLevel = -1;
                    }}
                  >
                    Auto
                  </Pill>
                  {[...levels]
                    .sort((a, b) => b.height - a.height)
                    .map((l) => (
                      <Pill
                        key={l.index}
                        on={level === l.index}
                        onClick={() => {
                          setLevel(l.index);
                          if (hls.current) hls.current.currentLevel = l.index;
                        }}
                      >
                        {l.height}p
                      </Pill>
                    ))}
                </Group>
              )}
              {audio.length > 1 && (
                <Group label="Audio">
                  {audio.map((t) => (
                    <Pill
                      key={t.id}
                      on={audioId === t.id}
                      onClick={() => {
                        if (hls.current) hls.current.audioTrack = t.id;
                        setAudioId(t.id);
                      }}
                    >
                      {t.name}
                    </Pill>
                  ))}
                </Group>
              )}
              {subs.length > 0 && (
                <Group label="Subtitles">
                  <Pill
                    on={subId === -1}
                    onClick={() => {
                      if (hls.current) hls.current.subtitleTrack = -1;
                      setSubId(-1);
                    }}
                  >
                    Off
                  </Pill>
                  {subs.map((t) => (
                    <Pill
                      key={t.id}
                      on={subId === t.id}
                      onClick={() => {
                        if (hls.current) hls.current.subtitleTrack = t.id;
                        setSubId(t.id);
                      }}
                    >
                      {t.name}
                    </Pill>
                  ))}
                </Group>
              )}
              <Group label="Picture">
                {FITS.map((f) => (
                  <Pill key={f.value} on={fit === f.value} onClick={() => setFit(f.value)}>
                    {f.label}
                  </Pill>
                ))}
              </Group>
              {!item.live && (
                <Group label="Speed">
                  {SPEEDS.map((s) => (
                    <Pill
                      key={s}
                      on={speed === s}
                      onClick={() => {
                        setSpeed(s);
                        if (video.current) video.current.playbackRate = s;
                      }}
                    >
                      {s}×
                    </Pill>
                  ))}
                </Group>
              )}
            </Panel>
          )}

          {menu === "record" && (
            <Panel title="Record">
              {canRecord() && cloud && (
                <Group label="Where">
                  <Pill on={where === "device"} onClick={() => setWhere("device")}>
                    This device
                  </Pill>
                  <Pill on={where === "cloud"} onClick={() => setWhere("cloud")}>
                    Cloud
                  </Pill>
                </Group>
              )}
              {where === "cloud" && cloud && (
                <Group label="Keep it for">
                  {[
                    { hours: 6, label: "6 hours" },
                    { hours: 24, label: "1 day" },
                    { hours: 168, label: "1 week" },
                    { hours: 0, label: "Forever" },
                  ].map((k) => (
                    <Pill
                      key={k.hours}
                      on={keepHours === k.hours}
                      onClick={() => setKeepHours(k.hours)}
                    >
                      {k.label}
                    </Pill>
                  ))}
                </Group>
              )}
              {now && (
                <Group label="This programme">
                  <Pill on={false} onClick={() => void record(untilEnd + 1)}>
                    Until it ends · {untilEnd} min
                  </Pill>
                </Group>
              )}
              <Group label="Length">
                {LENGTHS.map((m) => (
                  <Pill key={m} on={recordMinutes === m} onClick={() => void record(m)}>
                    {m} min
                  </Pill>
                ))}
              </Group>
            </Panel>
          )}

          {menu === "channels" && (
            <div className="glass absolute bottom-24 right-6 max-h-[55vh] w-80 overflow-y-auto rounded-2xl border border-line p-2 shadow-xl">
              {zap.slice(0, 300).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    resumeAt.current = 0;
                    play(channelPlayable(c));
                  }}
                  aria-current={c.id === channel?.id ? "true" : undefined}
                  className="fade flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/10 aria-[current=true]:bg-white/15 aria-[current=true]:text-accent"
                >
                  <ChannelLogo channel={c} size={26} />
                  <span className="truncate">{cleanName(c.name)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-end gap-4">
            {channel && <ChannelLogo channel={channel} size={52} />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-2xl font-bold">
                {item.live && channel ? cleanName(channel.name) : item.title}
              </p>
              {item.live ? (
                <p className="truncate text-sm text-muted">
                  {now
                    ? `${now.title} · ${formatClock(now.start)} – ${formatClock(now.end)}`
                    : "No programme information"}
                  {next ? `   ·   Next: ${next.title} at ${formatClock(next.start)}` : ""}
                </p>
              ) : (
                item.subtitle && <p className="truncate text-sm text-muted">{item.subtitle}</p>
              )}
            </div>
          </div>

          {item.live ? (
            now && (
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )
          ) : (
            <div className="mb-3 flex items-center gap-3 text-xs tabular-nums">
              <span>{clock(time.now)}</span>
              <SeekBar
                now={time.now}
                total={time.total}
                buffered={buffered}
                onSeek={(t) => {
                  if (video.current) video.current.currentTime = t;
                }}
              />
              <span>{clock(time.total)}</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            {item.live ? (
              <IconButton
                icon={SkipBackIcon}
                label="Previous channel"
                disabled={zap.length < 2}
                onClick={() => step(-1)}
              />
            ) : (
              <IconButton icon={RewindIcon} label="Back 10 seconds" onClick={() => seek(-10)} />
            )}
            <IconButton
              icon={playing ? PauseIcon : PlayIcon}
              label={playing ? "Pause" : "Play"}
              size={26}
              onClick={togglePlay}
              className="size-12 bg-white text-black hover:bg-white/90"
            />
            {item.live ? (
              <IconButton
                icon={SkipForwardIcon}
                label="Next channel"
                disabled={zap.length < 2}
                onClick={() => step(1)}
              />
            ) : (
              <IconButton
                icon={FastForwardIcon}
                label="Forward 10 seconds"
                onClick={() => seek(10)}
              />
            )}

            <div className="ml-3 flex items-center gap-1">
              <IconButton
                icon={muted || volume === 0 ? VolumeOffIcon : Volume2Icon}
                label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  if (video.current) video.current.muted = !video.current.muted;
                }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const el = video.current;
                  if (!el) return;
                  el.volume = Number(e.target.value);
                  el.muted = el.volume === 0;
                }}
                className="h-1 w-24 cursor-pointer accent-[var(--accent)]"
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
              <IconButton
                icon={HeartIcon}
                label={favorite ? "Remove from favourites" : "Add to favourites"}
                active={favorite}
                onClick={() => toggleFavorite(item.channel?.id ?? item.id)}
              />
              {(canRecord() || cloud) && (
                <IconButton
                  icon={CircleDotIcon}
                  label="Record"
                  active={menu === "record"}
                  onClick={() => setMenu(menu === "record" ? null : "record")}
                />
              )}
              {item.live && zap.length > 1 && (
                <IconButton
                  icon={ListIcon}
                  label="Channels"
                  active={menu === "channels"}
                  onClick={() => setMenu(menu === "channels" ? null : "channels")}
                />
              )}
              <IconButton
                icon={SlidersHorizontalIcon}
                label="Playback settings"
                active={menu === "settings"}
                onClick={() => setMenu(menu === "settings" ? null : "settings")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass absolute bottom-24 right-6 w-80 rounded-2xl border border-line p-4 shadow-xl">
      <p className="mb-3 text-sm font-bold">{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="fade rounded-full bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 aria-pressed:bg-accent aria-pressed:text-on-accent"
    >
      {children}
    </button>
  );
}

/** Scrubbing bar with a buffered range and a time tooltip that follows the pointer. */
function SeekBar({
  now,
  total,
  buffered,
  onSeek,
}: {
  now: number;
  total: number;
  buffered: number;
  onSeek: (seconds: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const valid = Number.isFinite(total) && total > 0;
  const at = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || !valid) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };
  const pct = valid ? (now / total) * 100 : 0;

  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={valid ? Math.round(total) : 0}
      aria-valuenow={Math.round(now)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onSeek(at(e.clientX) * total);
      }}
      onPointerMove={(e) => {
        setHover(at(e.clientX));
        if (dragging.current) onSeek(at(e.clientX) * total);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerLeave={() => setHover(null)}
      className="group relative flex h-5 flex-1 cursor-pointer items-center"
    >
      <div className="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover:h-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/30"
          style={{ width: `${valid ? Math.min(100, (buffered / total) * 100) : 0}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover:scale-100"
          style={{ left: `${pct}%` }}
        />
      </div>
      {hover !== null && valid && (
        <span
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/80 px-2 py-0.5 text-xs tabular-nums"
          style={{ left: `${hover * 100}%` }}
        >
          {clock(hover * total)}
        </span>
      )}
    </div>
  );
}
