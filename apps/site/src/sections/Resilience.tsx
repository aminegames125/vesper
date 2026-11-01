import { LayoutGroup, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Section, scheduleRefresh, Tally, Title } from "../ui";

type Cell = { id: number; c: "ok" | "gap" };
let uid = 0;
const mk = (c: "ok" | "gap"): Cell => ({ id: ++uid, c });
type Phase = "live" | "retry" | "back";
const MAX = 34;

function StreamDemo() {
  const [cells, setCells] = useState<Cell[]>(() => Array.from({ length: 14 }, () => mk("ok")));
  const [phase, setPhase] = useState<Phase>("live");
  const [tries, setTries] = useState(0);
  const [joins, setJoins] = useState(0);
  const timers = useRef<number[]>([]);
  const push = (c: "ok" | "gap") => setCells((all) => [...all, mk(c)].slice(-MAX));

  useEffect(() => {
    if (phase === "retry") return;
    const id = window.setInterval(() => push("ok"), 190);
    return () => window.clearInterval(id);
  }, [phase]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const drop = () => {
    if (phase === "retry") return;
    setPhase("retry");
    setTries(0);
    // Growing pauses between attempts, as the server does.
    const waits = [450, 900, 1500];
    let at = 0;
    waits.forEach((w, i) => {
      at += w;
      timers.current.push(
        window.setTimeout(() => {
          push("gap");
          setTries(i + 1);
        }, at),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setPhase("back");
        setJoins((j) => j + 1);
        timers.current.push(window.setTimeout(() => setPhase("live"), 900));
      }, at + 700),
    );
  };

  const label =
    phase === "retry"
      ? `Stream lost. Joining again (attempt ${Math.max(1, tries)})`
      : phase === "back"
        ? "Joined again. Same file."
        : "Recording";

  return (
    <div className="demo-card">
      <div className="demo-top">
        <span className={`pill ${phase === "retry" ? "bad" : "good"}`}>
          <Tally size={8} /> <span aria-live="polite">{label}</span>
        </span>
        <motion.button
          type="button"
          className="btn btn-solid sm"
          onClick={drop}
          disabled={phase === "retry"}
          whileTap={{ scale: 0.95 }}
          data-cursor
        >
          <span>Drop the stream</span>
        </motion.button>
      </div>
      <div className="cells" aria-hidden="true">
        {cells.map((cell) => (
          <motion.i
            key={cell.id}
            className={`cell ${cell.c}`}
            initial={{ scaleY: 0.2, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.18 }}
          />
        ))}
      </div>
      <dl className="stats">
        <div>
          <dt>Files on disk</dt>
          <dd className="mono">1</dd>
        </div>
        <div>
          <dt>Times joined again</dt>
          <dd className="mono">{joins}</dd>
        </div>
        <div>
          <dt>Gaps you will notice</dt>
          <dd className="mono">a short skip</dd>
        </div>
      </dl>
    </div>
  );
}

function AudioDemo() {
  const [joined, setJoined] = useState(false);
  const spring = { type: "spring", stiffness: 260, damping: 26 } as const;
  const lanes = (
    <>
      <motion.div layoutId="lane-v" transition={spring} className="lane-v">
        <span>Video, index.m3u8</span>
      </motion.div>
      <motion.div layoutId="lane-a" transition={spring} className="lane-a">
        <span>Audio, its own playlist</span>
      </motion.div>
    </>
  );
  return (
    <div className="demo-card">
      <div className="demo-top">
        <span className="pill good">
          {joined ? "One playable recording" : "Sound lives in a separate playlist"}
        </span>
        <motion.button
          type="button"
          className="btn btn-ghost sm"
          onClick={() => setJoined((j) => !j)}
          whileTap={{ scale: 0.95 }}
          data-cursor
          aria-pressed={joined}
        >
          <span>{joined ? "Split again" : "Join the audio"}</span>
        </motion.button>
      </div>
      <LayoutGroup>
        <div className={`audio ${joined ? "joined" : ""}`}>
          {joined ? (
            <motion.div layout transition={spring} className="merged">
              {lanes}
            </motion.div>
          ) : (
            lanes
          )}
        </div>
      </LayoutGroup>
      <p className="fine">
        Some HLS channels keep the sound in a separate rendition. The recorder fetches both and
        joins them so Kodi plays one recording with sound.
      </p>
    </div>
  );
}

export default function Resilience() {
  useEffect(() => {
    scheduleRefresh();
  }, []);
  return (
    <Section id="reliable" labelledBy="rel-title" className="sheet-a">
      <div className="wrap">
        <div className="sec-head">
          <Title id="rel-title">Streams drop. The recording should not care.</Title>
          <p className="lede">
            IPTV is not famous for staying up. The recorder is built around that: it reconnects,
            joins the pieces and keeps one file, and it tells you before the disk runs out instead
            of leaving an empty file.
          </p>
        </div>
        <div className="demo-grid">
          <StreamDemo />
          <AudioDemo />
        </div>
        <ul className="facts">
          <li>
            <b>Up to 8 reconnects</b> with growing pauses, then one clean recording.
          </li>
          <li>
            <b>Backup address:</b> after three failed reconnects in a row it switches to a second
            source for the channel.
          </li>
          <li>
            <b>Padding</b> of up to an hour before and after, so you keep the start.
          </li>
          <li>
            <b>Disk guard:</b> a recording is refused when less than 512 MB is free, with a clear
            reason.
          </li>
        </ul>
      </div>
    </Section>
  );
}
