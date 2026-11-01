import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Section, scheduleRefresh, Tally, Title } from "../ui";

type Key = "up" | "down" | "left" | "right" | "ok" | "back";
type Chan = {
  id: string;
  n: number;
  name: string;
  now: { t: string; from: string; to: string; blurb: string };
  next: { t: string; start: number; end: number };
};

// Sample channels. Fictional on purpose: the real ones come from the IPTV providers set up in Kodi.
const CHANNELS: Chan[] = [
  {
    id: "harbour",
    n: 1,
    name: "Harbour News",
    now: {
      t: "Evening Bulletin",
      from: "19:30",
      to: "20:00",
      blurb: "The day's headlines from the port.",
    },
    next: { t: "Weather and Tides", start: 20, end: 20.25 },
  },
  {
    id: "arena",
    n: 2,
    name: "Arena Sport",
    now: {
      t: "Cup Replay",
      from: "19:45",
      to: "21:45",
      blurb: "Full replay of last night's final.",
    },
    next: { t: "Post-match Desk", start: 21.75, end: 22.25 },
  },
  {
    id: "docs",
    n: 3,
    name: "Nordic Docs",
    now: {
      t: "The Long Coast",
      from: "19:00",
      to: "20:30",
      blurb: "A boat trip along a very long shore.",
    },
    next: { t: "Ice Roads", start: 20.5, end: 21.5 },
  },
  {
    id: "cinema",
    n: 4,
    name: "Cinema Classics",
    now: {
      t: "Night Train",
      from: "19:30",
      to: "21:30",
      blurb: "A thriller set on the last express.",
    },
    next: { t: "Encore Reel", start: 21.5, end: 22.5 },
  },
  {
    id: "kids",
    n: 5,
    name: "Kids Planet",
    now: { t: "Moon Bakery", from: "19:30", to: "20:00", blurb: "Bread made entirely at night." },
    next: { t: "Robot Choir", start: 20, end: 20.5 },
  },
  {
    id: "music",
    n: 6,
    name: "Music Box",
    now: {
      t: "Live from the Hall",
      from: "19:00",
      to: "21:00",
      blurb: "A full set, recorded in one take.",
    },
    next: { t: "Vinyl Hour", start: 21, end: 22 },
  },
];

const MENU = [
  "Switch to channel",
  "Channel information",
  "Add to favourites",
  "Record with Vesper",
  "Hide channel",
];
const DUR = [
  { k: "30", label: "30 minutes", h: 0.5 },
  { k: "60", label: "1 hour", h: 1 },
  { k: "120", label: "2 hours", h: 2 },
  { k: "stop", label: "Until I stop it", h: 99 },
] as const;

// The strip shows 19:30 to 23:30.
const T0 = 19.5;
const SPAN = 4;
const NOW = 19 + 52 / 60;

type Rec = {
  id: string;
  chan: string;
  title: string;
  start: number;
  end: number;
  kind: "soon" | "now";
};

const fmt = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

type Opt = {
  id: string;
  label: string;
  sub: string;
  group: "Programme in the guide" | "This channel, starting now";
};

function optionsFor(c: Chan): Opt[] {
  return [
    {
      id: `${c.id}-prog`,
      label: c.next.t,
      sub: `${fmt(c.next.start)} to ${fmt(c.next.end)}, a minute early and three late`,
      group: "Programme in the guide",
    },
    ...DUR.map((d) => ({
      id: `${c.id}-${d.k}`,
      label: d.label,
      sub: "Starts now",
      group: "This channel, starting now" as const,
    })),
  ];
}

export default function KodiMock() {
  const [tab, setTab] = useState<"channels" | "recs">("channels");
  const [focus, setFocus] = useState(1);
  const [layer, setLayer] = useState<"none" | "menu" | "dialog">("none");
  const [mi, setMi] = useState(0);
  const [di, setDi] = useState(0);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [toast, setToast] = useState("");
  const [demo, setDemo] = useState(false);
  const timers = useRef<number[]>([]);
  const toastTimer = useRef(0);
  const chan = CHANNELS[focus] ?? CHANNELS[0]!;
  const opts = optionsFor(chan);

  useEffect(() => {
    scheduleRefresh();
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const say = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  const choose = (o: Opt) => {
    if (recs.some((r) => r.id === o.id)) {
      say("Already in Vesper's list");
      setLayer("none");
      return;
    }
    const isProg = o.id.endsWith("-prog");
    const d = DUR.find((x) => o.id.endsWith(`-${x.k}`));
    const rec: Rec = isProg
      ? {
          id: o.id,
          chan: chan.name,
          title: chan.next.t,
          start: chan.next.start - 1 / 60,
          end: chan.next.end + 3 / 60,
          kind: "soon",
        }
      : {
          id: o.id,
          chan: chan.name,
          title: chan.now.t,
          start: NOW,
          end: d && d.h < 99 ? NOW + d.h : T0 + SPAN,
          kind: "now",
        };
    setRecs((r) => [...r, rec]);
    setLayer("none");
    say(
      isProg ? `Scheduled: ${rec.title} at ${fmt(chan.next.start)}` : `Recording ${chan.name} now`,
    );
  };

  const press = useCallback(
    (k: Key) => {
      if (layer === "dialog") {
        if (k === "up") setDi((v) => Math.max(0, v - 1));
        else if (k === "down") setDi((v) => Math.min(opts.length - 1, v + 1));
        else if (k === "back" || k === "left") setLayer("menu");
        else if (k === "ok") {
          const o = opts[di];
          if (o) choose(o);
        }
        return;
      }
      if (layer === "menu") {
        if (k === "up") setMi((v) => Math.max(0, v - 1));
        else if (k === "down") setMi((v) => Math.min(MENU.length - 1, v + 1));
        else if (k === "back" || k === "left") setLayer("none");
        else if (k === "ok") {
          if (mi === 3) {
            setDi(0);
            setLayer("dialog");
          } else {
            say(`"${MENU[mi]}" is Kodi's own. Try Record with Vesper.`);
            setLayer("none");
          }
        }
        return;
      }
      if (tab === "channels") {
        if (k === "up") setFocus((v) => Math.max(0, v - 1));
        else if (k === "down") setFocus((v) => Math.min(CHANNELS.length - 1, v + 1));
        else if (k === "ok") {
          setMi(0);
          setLayer("menu");
        } else if (k === "right") setTab("recs");
      } else if (k === "left" || k === "back") setTab("channels");
    },
    // choose depends on recs/opts/chan which are all derived from the dependencies listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, tab, mi, di, opts, recs, chan],
  );

  const stopDemo = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setDemo(false);
  };

  const runDemo = () => {
    stopDemo();
    setRecs([]);
    setLayer("none");
    setTab("channels");
    setFocus(2);
    setDemo(true);
    const seq: [number, () => void][] = [
      [500, () => setFocus(2)],
      [
        1100,
        () => {
          setMi(0);
          setLayer("menu");
        },
      ],
      [1700, () => setMi(1)],
      [2100, () => setMi(2)],
      [2500, () => setMi(3)],
      [
        3200,
        () => {
          setDi(0);
          setLayer("dialog");
        },
      ],
      [4300, () => setDi(1)],
      [
        5100,
        () => {
          const c = CHANNELS[2]!;
          const o = optionsFor(c)[0]!;
          setDi(0);
          setRecs([
            {
              id: o.id,
              chan: c.name,
              title: c.next.t,
              start: c.next.start - 1 / 60,
              end: c.next.end + 3 / 60,
              kind: "soon",
            },
          ]);
          setLayer("none");
          say(`Scheduled: ${c.next.t} at ${fmt(c.next.start)}`);
        },
      ],
      [6800, () => setDemo(false)],
    ];
    timers.current = seq.map(([t, fn]) => window.setTimeout(fn, t));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, Key> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "ok",
      " ": "ok",
      Escape: "back",
      Backspace: "back",
    };
    const k = map[e.key];
    if (!k) return;
    e.preventDefault();
    if (demo) stopDemo();
    press(k);
  };

  const remote = (k: Key) => {
    if (demo) stopDemo();
    press(k);
  };

  const groups = ["Programme in the guide", "This channel, starting now"] as const;

  return (
    <Section id="try" labelledBy="try-title" className="sheet-a">
      <div className="wrap">
        <div className="sec-head">
          <p className="kicker">
            <Tally /> Try it, in your browser
          </p>
          <Title id="try-title">Kodi's own menu, with one new line.</Title>
          <p className="lede">
            This is a drawn stand-in for Kodi's TV screen. Click the screen (or Tab to it), move
            with the arrow keys, press Enter on a channel and choose{" "}
            <strong>Record with Vesper</strong>. Channels and shows are made up.
          </p>
        </div>

        <div className="kodi-wrap">
          <div className="kodi-frame">
            <div
              className="kodi-screen"
              tabIndex={0}
              role="application"
              aria-label="Simulated Kodi TV screen. Arrow keys move, Enter selects, Escape goes back."
              onKeyDown={onKey}
            >
              <div className="k-top">
                <span className="k-crumb">TV</span>
                <LayoutGroup id="ktabs">
                  <div className="k-tabs" role="tablist">
                    {(
                      [
                        ["channels", "Channels"],
                        ["recs", "Vesper"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        className={tab === id ? "on" : ""}
                        onClick={() => {
                          if (demo) stopDemo();
                          setTab(id);
                        }}
                        type="button"
                        tabIndex={-1}
                      >
                        {tab === id && (
                          <motion.i
                            layoutId="ktab"
                            className="k-tabbg"
                            transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </LayoutGroup>
                <time className="k-clock mono">19:52</time>
              </div>

              <div className="k-body">
                <AnimatePresence mode="wait" initial={false}>
                  {tab === "channels" ? (
                    <motion.div
                      key="ch"
                      className="k-split"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -14 }}
                      transition={{ duration: 0.18 }}
                    >
                      <ul className="k-list" role="listbox" aria-label="Channels">
                        {CHANNELS.map((c, i) => (
                          <li
                            key={c.id}
                            role="option"
                            aria-selected={focus === i}
                            className={focus === i ? "on" : ""}
                          >
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                if (demo) stopDemo();
                                setFocus(i);
                                setMi(0);
                                setLayer("menu");
                              }}
                              onMouseEnter={() => layer === "none" && setFocus(i)}
                            >
                              {focus === i && (
                                <motion.i
                                  layoutId="kfocus"
                                  className="k-focus"
                                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                                />
                              )}
                              <span className="k-num mono">{c.n}</span>
                              <span className="k-name">{c.name}</span>
                              <span className="k-show">{c.now.t}</span>
                              {recs.some((r) => r.chan === c.name) && <Tally size={8} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="k-info">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={chan.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                          >
                            <p className="k-dim">
                              Now, {chan.now.from} to {chan.now.to}
                            </p>
                            <h3>{chan.now.t}</h3>
                            <p className="k-blurb">{chan.now.blurb}</p>
                            <p className="k-dim">Next, {fmt(chan.next.start)}</p>
                            <p className="k-next">{chan.next.t}</p>
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="rc"
                      className="k-recs"
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                      transition={{ duration: 0.18 }}
                    >
                      <h3>Continue watching</h3>
                      <div className="k-rec">
                        <span>Cup Replay</span>
                        <i className="bar">
                          <b style={{ width: "43%" }} />
                        </i>
                        <span className="k-dim mono">Resume at 23:41</span>
                      </div>
                      <h3>Recording now and coming up</h3>
                      <AnimatePresence initial={false}>
                        {recs.length === 0 && (
                          <motion.p
                            key="empty"
                            className="k-dim"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            Nothing yet. Go back to Channels and record something.
                          </motion.p>
                        )}
                        {recs.map((r) => (
                          <motion.div
                            key={r.id}
                            className="k-rec"
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                          >
                            <span>
                              {r.kind === "now" && <Tally size={8} />} {r.title}{" "}
                              <small>{r.chan}</small>
                            </span>
                            <span className="k-dim mono">
                              {r.kind === "now"
                                ? "Recording, watch from the start"
                                : `Starts ${fmt(r.start)}`}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="k-vesper">
                <div className="k-vh">
                  <b>
                    <Tally size={8} /> Vesper
                  </b>
                  <span className="k-dim">coming up on the server</span>
                </div>
                <div className="k-axis" aria-hidden="true">
                  {[20, 21, 22, 23].map((h) => (
                    <span key={h} style={{ left: `${((h - T0) / SPAN) * 100}%` }} className="mono">
                      {h}:00
                    </span>
                  ))}
                  <i className="k-now" style={{ left: `${((NOW - T0) / SPAN) * 100}%` }} />
                </div>
                <div className="k-lane">
                  <AnimatePresence>
                    {recs.map((r, i) => {
                      const l = clampPct(((r.start - T0) / SPAN) * 100);
                      const w = clampPct(((r.end - T0) / SPAN) * 100) - l;
                      return (
                        <motion.div
                          key={r.id}
                          layoutId={`rec-${r.id}`}
                          className={`k-block ${r.kind}`}
                          style={{
                            left: `${l}%`,
                            width: `${Math.max(w, 6)}%`,
                            top: `${(i % 2) * 50}%`,
                          }}
                          transition={{ type: "spring", stiffness: 260, damping: 28 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <span>{r.title}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${r.title}`}
                            onClick={() => setRecs((all) => all.filter((x) => x.id !== r.id))}
                            tabIndex={-1}
                          >
                            x
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {recs.length === 0 && <p className="k-dim k-hint">Your recordings land here.</p>}
                </div>
              </div>

              <AnimatePresence>
                {layer !== "none" && (
                  <motion.div
                    key="scrim"
                    className="k-scrim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setLayer("none")}
                  />
                )}
                {layer === "menu" && (
                  <motion.div
                    key="menu"
                    className="k-menu"
                    role="menu"
                    aria-label={`${chan.name} menu`}
                    initial={{ opacity: 0, scale: 0.94, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.08 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  >
                    <h4>{chan.name}</h4>
                    {MENU.map((m, i) => (
                      <button
                        key={m}
                        role="menuitem"
                        type="button"
                        tabIndex={-1}
                        className={`${mi === i ? "on" : ""} ${i === 3 ? "vs" : ""}`}
                        onMouseEnter={() => setMi(i)}
                        onClick={() => {
                          setMi(i);
                          if (i === 3) {
                            setDi(0);
                            setLayer("dialog");
                          } else {
                            say(`"${m}" is Kodi's own. Try Record with Vesper.`);
                            setLayer("none");
                          }
                        }}
                      >
                        {i === 3 && <Tally size={8} />} {m}
                      </button>
                    ))}
                  </motion.div>
                )}
                {layer === "dialog" && (
                  <motion.div
                    key="dialog"
                    className="k-dialog"
                    role="dialog"
                    aria-label="Record with Vesper"
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    <h4>
                      <Tally size={9} /> Record with Vesper <small>{chan.name}</small>
                    </h4>
                    {groups.map((g) => (
                      <div key={g}>
                        <p className="k-dim">{g}</p>
                        {opts
                          .filter((o) => o.group === g)
                          .map((o) => {
                            const idx = opts.indexOf(o);
                            return (
                              <motion.button
                                key={o.id}
                                layoutId={`rec-${o.id}`}
                                type="button"
                                tabIndex={-1}
                                className={`k-opt ${di === idx ? "on" : ""}`}
                                onMouseEnter={() => setDi(idx)}
                                onClick={() => choose(o)}
                                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                              >
                                <span>{o.label}</span>
                                <small>{o.sub}</small>
                              </motion.button>
                            );
                          })}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {toast && (
                  <motion.div
                    key={toast}
                    className="k-toast"
                    role="status"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                  >
                    <Tally size={8} /> {toast}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="remote" aria-label="Remote control for the demo">
            <div className="dpad">
              {(
                [
                  ["up", "Up", "▲"],
                  ["left", "Left", "◀"],
                  ["ok", "OK", "OK"],
                  ["right", "Right", "▶"],
                  ["down", "Down", "▼"],
                ] as [Key, string, string][]
              ).map(([k, l, g]) => (
                <motion.button
                  key={k}
                  type="button"
                  className={`rb rb-${k}`}
                  aria-label={l}
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.06 }}
                  onClick={() => remote(k)}
                  data-cursor
                >
                  {g}
                </motion.button>
              ))}
            </div>
            <motion.button
              type="button"
              className="rb back"
              whileTap={{ scale: 0.92 }}
              onClick={() => remote("back")}
              data-cursor
            >
              Back
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-ghost demo"
              whileTap={{ scale: 0.96 }}
              onClick={demo ? stopDemo : runDemo}
              data-cursor
            >
              <span>{demo ? "Stop demo" : "Play it for me"}</span>
            </motion.button>
            <p className="fine">Keyboard: arrows, Enter, Esc.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}
