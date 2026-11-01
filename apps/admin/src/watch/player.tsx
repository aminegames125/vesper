import type { Bookmark, CloudClient, CloudRecording } from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import type Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../icons";
import { EASE, gsap, reduced, SPRING } from "../motion";
import { clock, isPlayable, useMediaToken } from "./media";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_AFTER = 2800;
const SAVE_EVERY = 10_000;
const PREFS_KEY = "player:prefs";

interface Prefs {
  volume: number;
  rate: number;
}

type Menu = null | "speed" | "quality" | "next";

/**
 * The Vesper player: HLS for recordings (even while they are still recording), plain files for
 * downloads, resume, bookmarks, speed, quality, picture in picture and keyboard control.
 * Volume and speed follow the account through sync.
 */
export function Player({
  client,
  id,
  onClose,
  onPlay,
}: {
  client: CloudClient;
  id: string;
  onClose: () => void;
  onPlay: (id: string) => void;
}) {
  const media = useMediaToken(client);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef<{ at: number; side: number }>({ at: 0, side: 0 });

  const [all, setAll] = useState<CloudRecording[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [shown, setShown] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<{ x: number; at: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rec = all.find((r) => r.id === id);
  const live = rec?.status === "recording" && rec.kind === "recording";
  const upNext = useMemo(
    () =>
      all
        .filter((r) => r.id !== id && isPlayable(r) && !r.watched && r.kind === rec?.kind)
        .slice(0, 8),
    [all, id, rec?.kind],
  );

  const say = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2200);
  }, []);

  // ---- load the recording, bookmarks and the account's player preferences ----
  useEffect(() => {
    let alive = true;
    void client
      .listRecordings()
      .then((r) => alive && setAll(r.recordings))
      .catch((e) => alive && setProblem(e instanceof Error ? e.message : "Could not load."));
    void client
      .bookmarks(id)
      .then((r) => alive && setBookmarks(r.bookmarks))
      .catch(() => {});
    void client
      .syncPull(0)
      .then((r) => {
        const saved = r.items.find((i) => i.key === PREFS_KEY)?.value as Partial<Prefs> | null;
        if (!alive || !saved) return;
        if (typeof saved.volume === "number") setVolume(Math.min(1, Math.max(0, saved.volume)));
        if (typeof saved.rate === "number" && SPEEDS.includes(saved.rate)) setRate(saved.rate);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, id]);

  // ---- attach the stream ----
  useEffect(() => {
    const el = video.current;
    if (!el || !rec || media === null) return;
    if (!isPlayable(rec)) {
      setProblem("This one is not ready to play yet.");
      return;
    }
    setProblem(null);
    const src = client.streamUrl(rec, media);
    let gone = false;
    const resume = rec.status === "done" && !rec.watched && rec.positionS > 15 ? rec.positionS : 0;
    const begin = () => {
      if (resume && el.duration && resume < el.duration - 10) {
        el.currentTime = resume;
        say(`Resumed at ${clock(resume)}`);
      }
      void el.play().catch(() => setPlaying(false));
    };

    if (rec.kind === "download") {
      el.src = src;
      el.addEventListener("loadedmetadata", begin, { once: true });
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src;
      el.addEventListener("loadedmetadata", begin, { once: true });
    } else {
      void import("hls.js").then(({ default: HlsLib }) => {
        if (gone) return;
        if (!HlsLib.isSupported()) {
          setProblem("This browser cannot play HLS video.");
          return;
        }
        const instance = new HlsLib({ lowLatencyMode: false, backBufferLength: 60 });
        hls.current = instance;
        instance.loadSource(src);
        instance.attachMedia(el);
        instance.on(HlsLib.Events.MANIFEST_PARSED, (_, data) => {
          setLevels(data.levels.map((l) => ({ height: l.height })));
          begin();
        });
        instance.on(HlsLib.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) instance.startLoad();
          else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) instance.recoverMediaError();
          else setProblem("The stream stopped working.");
        });
      });
    }
    return () => {
      gone = true;
      hls.current?.destroy();
      hls.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [rec?.id, rec?.status === "recording", media, client, say]);

  // ---- keep the element in step with preferences ----
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
    el.playbackRate = rate;
  }, [volume, muted, rate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void client
        .syncPush([{ key: PREFS_KEY, value: { volume, rate } satisfies Prefs }])
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [client, volume, rate]);

  // ---- progress is saved as you watch and when you leave ----
  const save = useCallback(
    (finished = false) => {
      const el = video.current;
      if (!el || !rec || rec.status !== "done" || !el.duration) return;
      const done = finished || el.currentTime / el.duration > 0.95;
      void client
        .patchRecording(
          rec.id,
          done ? { watched: true, position_s: 0 } : { position_s: Math.floor(el.currentTime) },
        )
        .catch(() => {});
    },
    [client, rec],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (video.current && !video.current.paused) save();
    }, SAVE_EVERY);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [save]);

  // ---- controls ----
  const poke = useCallback(() => {
    setShown(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (video.current && !video.current.paused) {
        setShown(false);
        setMenu(null);
      }
    }, HIDE_AFTER);
  }, []);
  useEffect(() => () => clearTimeout(idle.current), []);

  const toggle = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  /** A soft flash over the picture that says what just happened: a skip or a play/pause. */
  const pulse = useCallback((where: "left" | "right" | "center") => {
    const node = flash.current?.querySelector<HTMLElement>(`[data-flash="${where}"]`);
    if (!node || reduced()) return;
    gsap.killTweensOf(node);
    gsap.fromTo(
      node,
      { opacity: 0.95, scale: 0.7 },
      { opacity: 0, scale: 1.35, duration: 0.7, ease: "power2.out" },
    );
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const el = video.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
      pulse(delta < 0 ? "left" : "right");
      poke();
    },
    [pulse, poke],
  );

  const toggleFull = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await box.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const pip = useCallback(async () => {
    const el = video.current;
    if (!el || !document.pictureInPictureEnabled)
      return say("Picture in picture is not available here.");
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else
      await el
        .requestPictureInPicture()
        .catch(() => say("Picture in picture is not available here."));
  }, [say]);

  const addBookmark = useCallback(async () => {
    const el = video.current;
    if (!el || !rec) return;
    const at = Math.floor(el.currentTime);
    try {
      const made = await client.addBookmark(rec.id, at);
      setBookmarks((b) =>
        [...b, { id: made.id, atS: at, label: "" }].sort((x, y) => x.atS - y.atS),
      );
      say(`Bookmarked ${clock(at)}`);
    } catch {
      say("Could not save the bookmark.");
    }
  }, [client, rec, say]);

  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const el = video.current;
      if (!el) return;
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
        poke();
      };
      switch (e.key) {
        case " ":
        case "k":
          return handled(toggle);
        case "j":
          return handled(() => seekBy(-10));
        case "l":
          return handled(() => seekBy(10));
        case "ArrowLeft":
          return handled(() => seekBy(-5));
        case "ArrowRight":
          return handled(() => seekBy(5));
        case "ArrowUp":
          return handled(() => setVolume((v) => Math.min(1, v + 0.1)));
        case "ArrowDown":
          return handled(() => setVolume((v) => Math.max(0, v - 0.1)));
        case "m":
          return handled(() => setMuted((m) => !m));
        case "f":
          return handled(() => void toggleFull());
        case "p":
          return handled(() => void pip());
        case "b":
          return handled(() => void addBookmark());
        case "<":
          return handled(() => setRate((r) => SPEEDS[Math.max(0, SPEEDS.indexOf(r) - 1)] ?? 1));
        case ">":
          return handled(() =>
            setRate((r) => SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(r) + 1)] ?? 1),
          );
        case "Escape":
          if (!document.fullscreenElement) onClose();
          return;
        default:
          if (/^[0-9]$/.test(e.key) && el.duration)
            handled(() => {
              el.currentTime = (el.duration * Number(e.key)) / 10;
            });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekBy, toggleFull, pip, addBookmark, poke, onClose]);

  // ---- the seek bar ----
  const at = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || !length) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * length;
  };
  const scrub = (e: React.PointerEvent) => {
    const el = video.current;
    if (!el) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.currentTime = at(e.clientX);
    const move = (ev: PointerEvent) => {
      el.currentTime = at(ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onSurfaceTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const side =
      e.clientX - rect.left < rect.width / 3
        ? -1
        : e.clientX - rect.left > (rect.width * 2) / 3
          ? 1
          : 0;
    const now = Date.now();
    if (now - lastTap.current.at < 320 && lastTap.current.side === side && side !== 0) {
      seekBy(side * 10);
      lastTap.current = { at: 0, side: 0 };
      return;
    }
    lastTap.current = { at: now, side };
    if (menu) return setMenu(null);
    if (!shown) return poke();
    toggle();
    pulse("center");
  };

  const progress = length ? time / length : 0;
  const levelName = level === -1 ? "Auto" : `${levels[level]?.height ?? "?"}p`;

  return (
    <motion.div
      ref={box}
      role="dialog"
      aria-label={rec ? `Playing ${rec.title}` : "Player"}
      className="scope-dark fixed inset-0 z-[var(--z-player)] select-none bg-black text-paper"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.35, ease: EASE }}
      onPointerMove={poke}
      style={{ cursor: shown ? "default" : "none" }}
    >
      <video
        ref={video}
        playsInline
        className="size-full bg-black object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          setShown(true);
          save();
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => {
          save(true);
          if (upNext[0]) onPlay(upNext[0].id);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setTime(el.currentTime);
          const end = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0;
          setBuffered(end);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          setLength(Number.isFinite(d) ? d : 0);
        }}
      />

      {/* A tap target over the picture; double taps on the sides skip. */}
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onSurfaceTap}
        className="absolute inset-0 cursor-[inherit] bg-transparent"
      />

      <div ref={flash} className="pointer-events-none absolute inset-0">
        <div
          data-flash="left"
          className="absolute left-[12%] top-1/2 grid size-20 -translate-y-1/2 place-items-center rounded-full bg-black/50 opacity-0"
        >
          <Icon name="back10" size={34} />
        </div>
        <div
          data-flash="right"
          className="absolute right-[12%] top-1/2 grid size-20 -translate-y-1/2 place-items-center rounded-full bg-black/50 opacity-0"
        >
          <Icon name="fwd10" size={34} />
        </div>
        <div
          data-flash="center"
          className="absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 opacity-0"
        >
          <Icon name={playing ? "pause" : "play"} size={40} />
        </div>
      </div>

      {waiting && !problem && rec && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-12 animate-spin rounded-full border-2 border-white/25 border-t-accent" />
        </div>
      )}
      {problem && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="text-lg font-semibold">{problem}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg bg-raised px-5 py-2 text-sm font-medium"
            >
              Back to the library
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.p
            key={toast}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-16 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shown && (
          <>
            <motion.div
              key="top"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6"
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close player"
                className="grid size-10 place-items-center rounded-full bg-black/60 hover:bg-black/80"
              >
                <Icon name="close" />
              </button>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold">
                  {rec?.title ?? "Loading…"}
                </p>
                <p className="truncate text-xs text-white/60">
                  {rec?.channelName || (rec?.kind === "download" ? "Download" : "From Kodi")}
                </p>
              </div>
              {live && (
                <span className="ml-auto inline-flex items-center rounded bg-raised px-2.5 py-1 text-xs font-semibold text-paper">
                  Still being saved
                </span>
              )}
            </motion.div>

            <motion.div
              key="bottom"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-14 sm:px-6"
            >
              {/* seek bar */}
              <div
                ref={bar}
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.floor(length)}
                aria-valuenow={Math.floor(time)}
                aria-valuetext={`${clock(time)} of ${clock(length)}`}
                onPointerDown={scrub}
                onPointerMove={(e) => setHover({ x: e.clientX, at: at(e.clientX) })}
                onPointerLeave={() => setHover(null)}
                className="group relative flex h-6 cursor-pointer touch-none items-center"
              >
                <div className="relative h-1 w-full rounded-full bg-white/20 transition-all group-hover:h-1.5">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                    style={{ width: `${length ? (buffered / length) * 100 : 0}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    style={{ width: `${progress * 100}%` }}
                  />
                  {bookmarks.map((b) => (
                    <span
                      key={b.id}
                      title={b.label || clock(b.atS)}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-warn"
                      style={{ left: `${length ? (b.atS / length) * 100 : 0}%` }}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent shadow transition-transform group-hover:scale-100"
                    style={{ left: `${progress * 100}%` }}
                  />
                </div>
                {hover && length > 0 && (
                  <span
                    className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-xs tabular"
                    style={{ left: `${((hover.at / length) * 100).toFixed(2)}%` }}
                  >
                    {clock(hover.at)}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1 sm:gap-2">
                <Control
                  icon={playing ? "pause" : "play"}
                  label={playing ? "Pause (k)" : "Play (k)"}
                  onClick={toggle}
                  big
                />
                <Control icon="back10" label="Back 10 seconds (j)" onClick={() => seekBy(-10)} />
                <Control icon="fwd10" label="Forward 10 seconds (l)" onClick={() => seekBy(10)} />
                <div className="group/vol hidden items-center sm:flex">
                  <Control
                    icon={muted || volume === 0 ? "mute" : "volume"}
                    label="Mute (m)"
                    onClick={() => setMuted((m) => !m)}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={muted ? 0 : volume}
                    aria-label="Volume"
                    onChange={(e) => {
                      setVolume(Number(e.target.value));
                      setMuted(false);
                    }}
                    className="h-1 w-0 cursor-pointer accent-[var(--accent)] opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
                  />
                </div>
                <span className="ml-1 text-xs text-white/80 tabular sm:text-sm">
                  {clock(time)} <span className="text-white/40">/</span>{" "}
                  {live ? "live" : clock(length)}
                </span>

                <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
                  <Control
                    icon="bookmark"
                    label="Bookmark this moment (b)"
                    onClick={() => void addBookmark()}
                  />
                  {upNext.length > 0 && (
                    <Control
                      icon="library"
                      label="Up next"
                      onClick={() => setMenu(menu === "next" ? null : "next")}
                    />
                  )}
                  {levels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMenu(menu === "quality" ? null : "quality")}
                      className="rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/10"
                      aria-label="Quality"
                    >
                      {levelName}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMenu(menu === "speed" ? null : "speed")}
                    className="rounded-lg px-3 py-2 text-xs font-semibold tabular hover:bg-white/10"
                    aria-label="Playback speed"
                  >
                    {rate}×
                  </button>
                  <Control icon="pip" label="Picture in picture (p)" onClick={() => void pip()} />
                  <Control
                    icon={full ? "exitFull" : "full"}
                    label="Fullscreen (f)"
                    onClick={() => void toggleFull()}
                  />
                </div>
              </div>

              <AnimatePresence>
                {menu && (
                  <motion.div
                    key={menu}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={SPRING}
                    className="absolute bottom-20 right-4 max-h-[55dvh] w-64 overflow-y-auto rounded-lg border border-white/10 bg-black/90 p-1.5 sm:right-6"
                  >
                    {menu === "speed" &&
                      SPEEDS.map((s) => (
                        <Choice
                          key={s}
                          on={s === rate}
                          onClick={() => {
                            setRate(s);
                            setMenu(null);
                          }}
                        >
                          {s === 1 ? "Normal" : `${s}×`}
                        </Choice>
                      ))}
                    {menu === "quality" && (
                      <>
                        <Choice
                          on={level === -1}
                          onClick={() => {
                            setLevel(-1);
                            if (hls.current) hls.current.currentLevel = -1;
                            setMenu(null);
                          }}
                        >
                          Auto
                        </Choice>
                        {levels.map((l, i) => (
                          <Choice
                            key={i}
                            on={level === i}
                            onClick={() => {
                              setLevel(i);
                              if (hls.current) hls.current.currentLevel = i;
                              setMenu(null);
                            }}
                          >
                            {l.height ? `${l.height}p` : `Level ${i + 1}`}
                          </Choice>
                        ))}
                      </>
                    )}
                    {menu === "next" &&
                      upNext.map((r) => (
                        <Choice key={r.id} on={false} onClick={() => onPlay(r.id)}>
                          <span className="block truncate">{r.title}</span>
                        </Choice>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Control({
  icon,
  label,
  onClick,
  big = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-lg transition-colors hover:bg-white/10 ${big ? "size-11" : "size-10"}`}
    >
      <Icon name={icon} size={big ? 26 : 22} />
    </button>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-white/10 ${on ? "text-accent" : ""}`}
    >
      <span className="w-4 flex-none">{on && <Icon name="check" size={16} />}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
