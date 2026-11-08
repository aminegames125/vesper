import { type CloudRecording, formatBytes, formatDuration } from "@vesper/cloud-client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { LogoMark } from "../logo";
import { EASE } from "../motion";

/**
 * A recording has three lives, and each gets its own screen:
 * before (waiting for it to start), now (the video itself, with its LIVE plate), and after
 * (what it was, and what to do next). These are the first and the last.
 */

const clockOf = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const dayOf = (epoch: number) => {
  const at = new Date(epoch * 1000);
  const today = new Date();
  const days = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return at.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
};

/** 2d 03:04:05, 03:04:05 or 04:05 — as little as the time left needs. */
function countdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const rest = `${pad(m)}:${pad(s % 60)}`;
  if (d > 0) return `${d}d ${pad(h)}:${rest}`;
  if (h > 0) return `${pad(h)}:${rest}`;
  return rest;
}

function useSeconds() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="scope-dark absolute inset-0 z-20 grid place-items-center overflow-hidden bg-[#0D0D0F] p-6 text-paper"
    >
      {children}
    </div>
  );
}

/** Three scanlines drifting slowly: the mark, enlarged into the room's wallpaper. */
function Scanlines({ tone }: { tone: "wait" | "end" }) {
  const lines = [0, 1, 2];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {lines.map((i) => (
        <motion.span
          key={i}
          className="absolute left-0 h-[3px] w-full origin-left"
          style={{
            top: `${28 + i * 22}%`,
            background:
              i === 0 && tone === "wait"
                ? "var(--accent)"
                : "color-mix(in oklab, var(--paper) 14%, transparent)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease: EASE }}
        />
      ))}
    </div>
  );
}

/** Before: it is scheduled and has not started. Counts down, then waits for the channel. */
export function BeforeScreen({
  rec,
  onClose,
  onExternal,
}: {
  rec: CloudRecording;
  onClose: () => void;
  onExternal: () => void;
}) {
  const now = useSeconds();
  const left = rec.startAt - now;
  const due = left <= 0;
  const length = rec.maxSeconds > 0 ? formatDuration(rec.maxSeconds) : "";
  return (
    <Frame label="Waiting for the recording to start">
      <Scanlines tone="wait" />
      <button
        type="button"
        onClick={onClose}
        className="vp-btn absolute left-5 top-5 sm:left-8"
        style={{ background: "#1E1E22" }}
      >
        Back
      </button>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative z-10 flex max-w-4xl flex-col items-center text-center"
      >
        <LogoMark size={72} animate />
        <h1 className="display mt-8 text-[length:var(--text-hero)] leading-[1.02]">{rec.title}</h1>
        <p className="mt-3 text-xl text-muted">
          {rec.channelName || "Scheduled recording"}
          {length ? ` · ${length}` : ""}
        </p>
        <p
          className="display tabular mt-10 text-[clamp(4rem,14vw,9rem)] leading-none"
          aria-live="off"
        >
          {due ? "Starting" : countdown(left)}
        </p>
        <p className="mt-4 text-xl text-muted">
          {due ? (
            <span className="inline-flex items-center gap-3">
              <span className="size-3 animate-pulse rounded-full bg-accent" />
              Tuning the channel. This opens by itself.
            </span>
          ) : (
            `${dayOf(rec.startAt)} at ${clockOf(rec.startAt)}. This opens by itself when it starts.`
          )}
        </p>
        <button
          type="button"
          onClick={onExternal}
          className="vp-btn mt-8"
          style={{ background: "#1E1E22" }}
        >
          Open in an external player
        </button>
      </motion.div>
    </Frame>
  );
}

/** After: it ended. What it was, and the next press. */
export function AfterScreen({
  rec,
  next,
  onReplay,
  onKeep,
  onDownload,
  onPlay,
  onClose,
}: {
  rec: CloudRecording;
  next: CloudRecording[];
  onReplay: () => void;
  onKeep: () => void;
  onDownload: () => void;
  onPlay: (id: string) => void;
  onClose: () => void;
}) {
  const kept = rec.keepHours === null;
  return (
    <Frame label="Finished">
      <div className="absolute inset-0 bg-black/70" aria-hidden />
      <button
        type="button"
        onClick={onClose}
        className="vp-btn absolute left-5 top-5 sm:left-8"
        style={{ background: "#1E1E22" }}
      >
        Back
      </button>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="relative z-10 flex w-full max-w-4xl gap-6"
      >
        <span className="w-3 flex-none rounded-sm bg-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="display text-[length:var(--text-xl)] text-muted">Finished</p>
          <h1 className="display mt-1 text-[length:var(--text-hero)] leading-[1.02]">
            {rec.title}
          </h1>
          <p className="tabular mt-3 text-xl text-muted">
            {[
              rec.channelName,
              rec.finishedAt ? `Ended ${clockOf(rec.finishedAt)}` : "",
              rec.seconds > 0 ? formatDuration(rec.seconds) : "",
              rec.bytes > 0 ? formatBytes(rec.bytes) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={onReplay} className="vp-btn" data-strong>
              Watch from the start
            </button>
            <button type="button" onClick={onKeep} className="vp-btn" disabled={kept}>
              {kept ? "Kept for good" : "Keep it"}
            </button>
            {rec.kind === "recording" && (
              <button type="button" onClick={onDownload} className="vp-btn">
                Download MP4
              </button>
            )}
          </div>
          {next.length > 0 && (
            <div className="mt-10">
              <p className="display text-3xl">Up next</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {next.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onPlay(r.id)}
                      className="vp-choice h-full"
                      style={{ background: "rgb(30 30 34 / 0.9)" }}
                    >
                      <span className="min-w-0 truncate">{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </Frame>
  );
}

/** Failed: nothing was captured. Says why, in the server's words when it has them. */
export function FailedScreen({ rec, onClose }: { rec: CloudRecording; onClose: () => void }) {
  return (
    <Frame label="Nothing was captured">
      <button
        type="button"
        onClick={onClose}
        className="vp-btn absolute left-5 top-5 sm:left-8"
        style={{ background: "#1E1E22" }}
      >
        Back
      </button>
      <div className="relative z-10 flex max-w-3xl gap-6">
        <span className="w-3 flex-none rounded-sm bg-accent" aria-hidden />
        <div>
          <h1 className="display text-[length:var(--text-hero)] leading-[1.02]">{rec.title}</h1>
          <p className="mt-4 text-2xl font-semibold text-accent">Nothing was captured</p>
          <p className="mt-3 text-xl text-muted">
            {rec.error ||
              "The channel did not answer. Check that it plays in Live TV, then try again."}
          </p>
        </div>
      </div>
    </Frame>
  );
}
