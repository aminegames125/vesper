import type { Bookmark, CloudClient, CloudRecording } from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import type Hls from "hls.js";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./player.css";
import { Icon, type IconName } from "../icons";
import { EASE } from "../motion";
import { clock, isPlayable, useMediaToken } from "./media";

type VjsPlayer = ReturnType<typeof videojs>;

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SAVE_EVERY = 10_000;
const PREFS_KEY = "player:prefs";

interface Prefs {
  volume: number;
  rate: number;
}

type Panel = null | "quality" | "bookmarks" | "next";

/**
 * The Vesper player. video.js is the engine and the control bar; hls.js does the HLS (video.js's
 * own HLS engine is left unused). The lower-third plate bottom left is the player's one graphic:
 * what you are watching, where it came from, and whether it is live.
 */
export function Player({
  client,
  id,
  onClose,
  onPlay,
  onRecord,
}: {
  client: CloudClient;
  id: string;
  onClose: () => void;
  onPlay: (id: string) => void;
  /** Given for a live session: keeps what is being watched as a real recording. */
  onRecord?: () => Promise<void>;
}) {
  const media = useMediaToken(client);
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<VjsPlayer | null>(null);
  const hls = useRef<Hls | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const [all, setAll] = useState<CloudRecording[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [panel, setPanel] = useState<Panel>(null);
  const [kept, setKept] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);

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
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2400);
  }, []);

  // ---- the recording, its bookmarks and the account's preferences ----
  useEffect(() => {
    let alive = true;
    void client
      .listRecordings()
      .then(async (r) => {
        // A live session from the Live TV page is hidden from lists; load it by id.
        const own = r.recordings.some((x) => x.id === id)
          ? null
          : await client.getRecording(id).catch(() => null);
        if (alive) setAll(own ? [own, ...r.recordings] : r.recordings);
      })
      .catch((e) => alive && setProblem(e instanceof Error ? e.message : "Could not load."));
    void client
      .bookmarks(id)
      .then((r) => alive && setBookmarks(r.bookmarks))
      .catch(() => {});
    void client
      .syncPull(0)
      .then((r) => {
        const saved = r.items.find((i) => i.key === PREFS_KEY)?.value as Partial<Prefs> | null;
        const p = player.current;
        if (!alive || !saved || !p) return;
        if (typeof saved.volume === "number") p.volume(Math.min(1, Math.max(0, saved.volume)));
        if (typeof saved.rate === "number" && SPEEDS.includes(saved.rate))
          p.playbackRate(saved.rate);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, id]);

  // ---- create the video.js player once ----
  useEffect(() => {
    const holder = mount.current;
    if (!holder) return;
    const el = document.createElement("video");
    el.className = "video-js vjs-vesper";
    el.setAttribute("playsinline", "");
    holder.appendChild(el);
    const p = videojs(el, {
      controls: true,
      fill: true,
      preload: "auto",
      liveui: true,
      inactivityTimeout: 3000,
      playbackRates: SPEEDS,
      userActions: { hotkeys: false, doubleClick: true },
      controlBar: {
        skipButtons: { backward: 10, forward: 10 },
        pictureInPictureToggle: true,
        volumePanel: { inline: false },
        children: [
          "playToggle",
          "skipBackward",
          "skipForward",
          "volumePanel",
          "currentTimeDisplay",
          "timeDivider",
          "durationDisplay",
          "progressControl",
          "liveDisplay",
          "seekToLive",
          "playbackRateMenuButton",
          "pictureInPictureToggle",
          "fullscreenToggle",
        ],
      },
    });
    player.current = p;
    setHost(p.el() as HTMLElement);
    p.on("useractive", () => setActive(true));
    p.on("userinactive", () => setActive(false));
    p.on("play", () => setPaused(false));
    p.on("pause", () => {
      setPaused(true);
      setActive(true);
    });
    return () => {
      hls.current?.destroy();
      hls.current = null;
      p.dispose();
      player.current = null;
      setHost(null);
    };
  }, []);

  // ---- attach the stream: HLS through hls.js, downloads as plain files ----
  useEffect(() => {
    const p = player.current;
    if (!p || !rec || media === null) return;
    if (!isPlayable(rec)) {
      setProblem("This one is not ready to play yet.");
      return;
    }
    setProblem(null);
    const src = client.streamUrl(rec, media);
    let gone = false;
    const resume = rec.status === "done" && !rec.watched && rec.positionS > 15 ? rec.positionS : 0;
    const begin = () => {
      const duration = p.duration();
      if (resume && duration && resume < duration - 10) {
        p.currentTime(resume);
        say(`Resumed at ${clock(resume)}`);
      }
      void p.play()?.catch(() => {});
    };

    p.ready(() => {
      if (gone) return;
      const tech = p.tech(true) as unknown as { el(): HTMLVideoElement } | undefined;
      const el = tech?.el();
      if (!el) return;
      if (rec.kind === "download") {
        p.src({
          src,
          type: rec.fileName?.toLowerCase().endsWith(".mkv") ? "video/x-matroska" : "video/mp4",
        });
        p.one("loadedmetadata", begin);
        return;
      }
      void import("hls.js").then(({ default: HlsLib }) => {
        if (gone) return;
        if (HlsLib.isSupported()) {
          const instance = new HlsLib({ lowLatencyMode: false, backBufferLength: 60 });
          hls.current = instance;
          instance.attachMedia(el);
          instance.loadSource(src);
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
        } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari plays HLS natively.
          p.src({ src, type: "application/x-mpegURL" });
          p.one("loadedmetadata", begin);
        } else {
          setProblem("This browser cannot play HLS video.");
        }
      });
    });
    return () => {
      gone = true;
      hls.current?.destroy();
      hls.current = null;
    };
  }, [rec?.id, rec?.status === "recording", media, client, say]);

  // ---- preferences follow the account ----
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void client
          .syncPush([
            { key: PREFS_KEY, value: { volume: p.volume() ?? 1, rate: p.playbackRate() ?? 1 } },
          ])
          .catch(() => {});
      }, 1500);
    };
    p.on("volumechange", push);
    p.on("ratechange", push);
    return () => {
      clearTimeout(timer);
      p.off("volumechange", push);
      p.off("ratechange", push);
    };
  }, [client]);

  // ---- progress is saved as you watch and when you leave ----
  const save = useCallback(
    (finished = false) => {
      const p = player.current;
      const duration = p?.duration();
      if (!p || !rec || rec.status !== "done" || !duration || !Number.isFinite(duration)) return;
      const at = p.currentTime() ?? 0;
      const done = finished || at / duration > 0.95;
      void client
        .patchRecording(
          rec.id,
          done ? { watched: true, position_s: 0 } : { position_s: Math.floor(at) },
        )
        .catch(() => {});
    },
    [client, rec],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (player.current && !player.current.paused()) save();
    }, SAVE_EVERY);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [save]);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onEnded = () => {
      save(true);
      if (upNext[0]) onPlay(upNext[0].id);
    };
    p.on("ended", onEnded);
    p.on("pause", () => save());
    return () => {
      p.off("ended", onEnded);
    };
  }, [save, upNext, onPlay]);

  // Keep the controls up while a menu is open.
  useEffect(() => {
    if (!panel) return;
    const timer = setInterval(() => player.current?.userActive(true), 1500);
    return () => clearInterval(timer);
  }, [panel]);

  const addBookmark = useCallback(async () => {
    const p = player.current;
    if (!p || !rec) return;
    const at = Math.floor(p.currentTime() ?? 0);
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

  const setQuality = (i: number) => {
    setLevel(i);
    if (hls.current) hls.current.currentLevel = i;
    setPanel(null);
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const p = player.current;
      if (!p) return;
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
        p.userActive(true);
      };
      const seek = (d: number) => {
        const duration = p.duration();
        p.currentTime(
          Math.max(
            0,
            Math.min(
              duration && Number.isFinite(duration) ? duration : Infinity,
              (p.currentTime() ?? 0) + d,
            ),
          ),
        );
      };
      switch (e.key) {
        case " ":
        case "k":
        case "Enter":
          if (target.closest("button")) return;
          return handled(() => (p.paused() ? void p.play() : p.pause()));
        case "j":
          return handled(() => seek(-10));
        case "l":
          return handled(() => seek(10));
        case "ArrowLeft":
          return handled(() => seek(-5));
        case "ArrowRight":
          return handled(() => seek(5));
        case "ArrowUp":
          return handled(() => p.volume(Math.min(1, (p.volume() ?? 1) + 0.1)));
        case "ArrowDown":
          return handled(() => p.volume(Math.max(0, (p.volume() ?? 1) - 0.1)));
        case "m":
          return handled(() => p.muted(!p.muted()));
        case "f":
          return handled(() =>
            p.isFullscreen() ? void p.exitFullscreen() : void p.requestFullscreen(),
          );
        case "b":
          return handled(() => void addBookmark());
        case "<":
          return handled(() =>
            p.playbackRate(SPEEDS[Math.max(0, SPEEDS.indexOf(p.playbackRate() ?? 1) - 1)] ?? 1),
          );
        case ">":
          return handled(() =>
            p.playbackRate(
              SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(p.playbackRate() ?? 1) + 1)] ?? 1,
            ),
          );
        case "Escape":
        case "Backspace":
          if (panel) return handled(() => setPanel(null));
          if (!p.isFullscreen()) onClose();
          return;
        default:
          if (/^[0-9]$/.test(e.key)) {
            const duration = p.duration();
            if (duration && Number.isFinite(duration))
              handled(() => p.currentTime((duration * Number(e.key)) / 10));
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addBookmark, onClose, panel]);

  const levelName = level === -1 ? "Auto" : `${levels[level]?.height ?? "?"}p`;
  const shown = active || paused || panel !== null;

  const overlay = (
    <>
      {/* Top: back, and the actions that belong to this item. */}
      <AnimatePresence>
        {shown && (
          <motion.div
            key="top"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/75 to-transparent px-5 pb-16 pt-5 sm:px-8"
          >
            <PlateButton icon="close" label="Back" onClick={onClose} />
            <div className="ml-auto flex items-center gap-3">
              {onRecord && (
                <PlateButton
                  icon="rec"
                  label={kept ? "Recording" : "Record this"}
                  strong
                  disabled={kept}
                  onClick={() =>
                    void onRecord()
                      .then(() => {
                        setKept(true);
                        say("Recording. It will be in your library.");
                      })
                      .catch(() => say("Could not start the recording."))
                  }
                />
              )}
              <PlateButton
                icon="bookmark"
                label="Bookmarks"
                onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}
              />
              {levels.length > 1 && (
                <PlateButton
                  icon="speed"
                  label={levelName}
                  onClick={() => setPanel(panel === "quality" ? null : "quality")}
                />
              )}
              {upNext.length > 0 && (
                <PlateButton
                  icon="library"
                  label="Up next"
                  onClick={() => setPanel(panel === "next" ? null : "next")}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The lower-third: a coral bar wipes in, then the title. It is the player's one graphic. */}
      <AnimatePresence>
        {shown && rec && (
          <motion.div
            key={`plate-${rec.id}`}
            initial={{ clipPath: "inset(0 100% 0 0)", opacity: 1 }}
            animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
            exit={{ clipPath: "inset(0 100% 0 0)" }}
            transition={{ duration: 0.42, ease: EASE }}
            className="absolute bottom-24 left-5 z-10 flex max-w-[min(46rem,calc(100%-2.5rem))] items-stretch overflow-hidden rounded-lg sm:left-8"
          >
            <span className={`w-3 flex-none ${live ? "bg-accent" : "bg-paper"}`} />
            <div className="min-w-0 bg-black/80 px-6 py-4 backdrop-blur-sm">
              <p className="display truncate text-3xl text-paper sm:text-4xl">{rec.title}</p>
              <p className="mt-1 flex items-center gap-3 text-lg text-paper/75">
                {live && (
                  <span className="inline-flex items-center gap-2 font-semibold text-accent">
                    <span className="size-2.5 animate-pulse rounded-full bg-accent" />
                    LIVE
                  </span>
                )}
                <span className="truncate">
                  {rec.channelName || (rec.kind === "download" ? "Saved download" : "Recording")}
                </span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panel && (
          <motion.div
            key={panel}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="absolute right-5 top-24 z-20 max-h-[60dvh] w-[min(24rem,calc(100%-2.5rem))] overflow-y-auto rounded-xl bg-panel p-2 shadow-[var(--shadow-2)] sm:right-8"
          >
            {panel === "quality" && (
              <>
                <Choice on={level === -1} onClick={() => setQuality(-1)}>
                  Auto
                </Choice>
                {levels.map((l, i) => (
                  <Choice key={`${l.height}-${i}`} on={level === i} onClick={() => setQuality(i)}>
                    {l.height ? `${l.height}p` : `Level ${i + 1}`}
                  </Choice>
                ))}
              </>
            )}
            {panel === "bookmarks" && (
              <>
                <Choice on={false} onClick={() => void addBookmark()}>
                  Bookmark this moment
                </Choice>
                {bookmarks.map((b) => (
                  <Choice
                    key={b.id}
                    on={false}
                    onClick={() => {
                      player.current?.currentTime(b.atS);
                      setPanel(null);
                    }}
                  >
                    <span className="tabular">{clock(b.atS)}</span>
                    {b.label ? ` · ${b.label}` : ""}
                  </Choice>
                ))}
              </>
            )}
            {panel === "next" &&
              upNext.map((r) => (
                <Choice key={r.id} on={false} onClick={() => onPlay(r.id)}>
                  <span className="block truncate">{r.title}</span>
                </Choice>
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.p
            key={toast}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-lg bg-panel px-5 py-3 text-lg font-semibold"
          >
            {toast}
          </motion.p>
        )}
      </AnimatePresence>

      {problem && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6 text-center">
          <div>
            <p className="display text-3xl">{problem}</p>
            <button type="button" onClick={onClose} className="vp-btn mt-6">
              Back
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <motion.div
      data-player
      role="dialog"
      aria-label={rec ? `Playing ${rec.title}` : "Player"}
      className="scope-dark fixed inset-0 z-[var(--z-player)] bg-black text-paper"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div ref={mount} className="size-full" />
      {host && createPortal(overlay, host)}
    </motion.div>
  );
}

function PlateButton({
  icon,
  label,
  onClick,
  strong = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  strong?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-strong={strong || undefined}
      className="vp-btn"
    >
      <Icon name={icon} size={24} />
      <span className="vp-btn-label">{label}</span>
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
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="vp-choice">
      {children}
    </button>
  );
}
