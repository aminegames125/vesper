import { AnimatePresence, motion, type Variants } from "framer-motion";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { FEATURES, GROUPS, type Group, LINKS, SHOTS } from "./data";
import { gsap, MOTION_OK, useGSAP } from "./gsap";
import { asset } from "./Mark";

type Shot = { src: string; alt: string };

function Frame({ shot, lazy = true }: { shot: Shot; lazy?: boolean }) {
  return (
    <div className="frame" data-reveal>
      <div className="frame-bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="frame-body">
        <img
          src={asset(shot.src)}
          alt={shot.alt}
          width={800}
          height={500}
          loading={lazy ? "lazy" : undefined}
          decoding="async"
        />
      </div>
    </div>
  );
}

const tap = { scale: 0.96 };

/* Features: filter with a shared pill, cards animate by layout. */
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: (i % 6) * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  }),
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.2 } },
};

export function Features() {
  const [group, setGroup] = useState<Group | "all">("all");
  const list = FEATURES.filter((f) => group === "all" || f.group === group);

  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <h2 id="features-title" className="display">
            Everything a recorder should do.
          </h2>
          <p className="lede">
            Schedules, a guide, space control and apps to watch it all. Filter by what you care
            about.
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Feature groups">
          {GROUPS.map((g) => (
            <motion.button
              key={g.id}
              type="button"
              role="tab"
              id={`tab-${g.id}`}
              aria-selected={group === g.id}
              aria-controls="feature-panel"
              className="tab"
              onClick={() => setGroup(g.id)}
              whileTap={tap}
            >
              {group === g.id && (
                <motion.span
                  layoutId="feature-pill"
                  className="pill"
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                />
              )}
              {g.label}
            </motion.button>
          ))}
        </div>
        <motion.ul
          layout
          className="cards"
          role="tabpanel"
          id="feature-panel"
          aria-labelledby={`tab-${group}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((f, i) => (
              <motion.li
                key={f.id}
                layout
                className="card"
                variants={cardVariants}
                custom={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                exit="exit"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.985 }}
              >
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>
    </section>
  );
}

export function Guide() {
  return (
    <section className="section" id="guide" aria-labelledby="guide-title">
      <div className="wrap">
        <div className="split">
          <div data-reveal>
            <h2 id="guide-title" className="display">
              Record the show, not the time slot.
            </h2>
            <p className="lede">
              Vesper reads your TV guide (XMLTV). Pick a programme and it is scheduled. Make a
              series rule once and every episode is recorded.
            </p>
            <ul className="points">
              <li>When a show runs long, the recording follows the guide.</li>
              <li>Download movies and series. They are saved on the server.</li>
              <li>A backup channel URL and retries cover a stream that drops.</li>
            </ul>
          </div>
          <div className="stack">
            <Frame shot={SHOTS.guide} />
            <Frame shot={SHOTS.movies} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* Space control: a per-item deletion timer you can really toggle. */
type Keep = "default" | "month" | "forever";
const KEEPS: { id: Keep; label: string }[] = [
  { id: "default", label: "7 days (default)" },
  { id: "month", label: "30 days" },
  { id: "forever", label: "Keep forever" },
];
const KEEP_VIEW: Record<Keep, { text: string; fill: number }> = {
  default: { text: "Deletes in 5 days", fill: 0.71 },
  month: { text: "Deletes in 28 days", fill: 0.93 },
  forever: { text: "Kept until you delete it", fill: 1 },
};

function KeepItem({ title }: { title: string }) {
  const [keep, setKeep] = useState<Keep>("default");
  const view = KEEP_VIEW[keep];
  return (
    <li className="keep-item">
      <div className="keep-top">
        <strong>{title}</strong>
        <motion.span
          key={keep}
          className="keep-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {view.text}
        </motion.span>
      </div>
      <div className="meter" aria-hidden="true">
        <motion.i
          initial={false}
          animate={{ scaleX: view.fill }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
        />
      </div>
      <div className="seg" role="radiogroup" aria-label={`Deletion timer for ${title}`}>
        {KEEPS.map((k) => (
          <motion.button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={keep === k.id}
            onClick={() => setKeep(k.id)}
            whileTap={tap}
          >
            {keep === k.id && (
              <motion.span
                layoutId={`keep-${title}`}
                className="pill"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            {k.label}
          </motion.button>
        ))}
      </div>
    </li>
  );
}

export function Space() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".forecast .used, .forecast .plan", {
          scaleX: 0,
          stagger: 0.4,
          ease: "none",
          scrollTrigger: { trigger: ".forecast", start: "top 90%", end: "top 45%", scrub: 0.5 },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="section" id="space" aria-labelledby="space-title">
      <div className="wrap">
        <div className="split">
          <div data-reveal>
            <h2 id="space-title" className="display">
              Your disk stays under control.
            </h2>
            <p className="lede">
              Every recording gets a deletion timer, 7 days by default. Change it per item, or keep
              it forever. A disk-space forecast shows where you are heading.
            </p>
          </div>
          <div className="panel" data-reveal>
            <h3>Try the timer</h3>
            <ul className="keep-list">
              <KeepItem title="Evening news" />
              <KeepItem title="Football match" />
              <KeepItem title="Documentary" />
            </ul>
            <div className="forecast">
              <h3>Disk-space forecast</h3>
              <div
                className="meter"
                role="img"
                aria-label="Illustration: disk used and planned recordings"
              >
                <div className="used" />
                <div className="plan" />
              </div>
              <div className="legend">
                <span>
                  <b style={{ background: "var(--mark)" }} />
                  Used
                </span>
                <span>
                  <b style={{ background: "var(--accent)" }} />
                  Scheduled recordings
                </span>
              </div>
            </div>
            <p className="caption">Illustration with example recordings.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Watch and cast: a quality selector that really toggles. */
type Mode = "phone" | "cast";
const QUALITY = [
  { id: "auto", label: "Follows my connection", badge: "Auto quality" },
  { id: "1080", label: "Cap at 1080p", badge: "Up to 1080p" },
  { id: "720", label: "Cap at 720p", badge: "Up to 720p" },
] as const;

export function Watch() {
  const [mode, setMode] = useState<Mode>("phone");
  const [q, setQ] = useState<(typeof QUALITY)[number]["id"]>("auto");
  const current = QUALITY.find((o) => o.id === q) ?? QUALITY[0];

  return (
    <section className="section" id="watch" aria-labelledby="watch-title">
      <div className="wrap">
        <div className="split">
          <div className="watch-stage order-first" data-reveal>
            <Frame shot={SHOTS.live} />
            <AnimatePresence mode="wait">
              <motion.span
                key={`${mode}-${q}`}
                className="badge"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                style={{ bottom: 16 }}
              >
                {mode === "cast" ? "Casting. " : ""}
                {current.badge}
              </motion.span>
            </AnimatePresence>
          </div>
          <div data-reveal>
            <h2 id="watch-title" className="display">
              Watch on the phone. Or on the big screen.
            </h2>
            <div className="opt-label" id="mode-label">
              Where to watch
            </div>
            <div className="seg" role="tablist" aria-labelledby="mode-label">
              {(
                [
                  ["phone", "Android app"],
                  ["cast", "Chromecast"],
                ] as const
              ).map(([id, label]) => (
                <motion.button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  whileTap={tap}
                >
                  {mode === id && (
                    <motion.span
                      layoutId="mode-pill"
                      className="pill"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  {label}
                </motion.button>
              ))}
            </div>
            <div className="mode-text">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={mode}
                  className="lede"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22 }}
                >
                  {mode === "phone"
                    ? "Watch live channels or your recordings in the Android app. Pick the picture quality that suits you."
                    : "Cast a channel straight from the phone. The TV gets the link directly, so it works for streams the TV app cannot play."}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="opt-label" id="q-label">
              Picture quality
            </div>
            <div className="seg" role="radiogroup" aria-labelledby="q-label">
              {QUALITY.map((o) => (
                <motion.button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={q === o.id}
                  onClick={() => setQ(o.id)}
                  whileTap={tap}
                >
                  {q === o.id && (
                    <motion.span
                      layoutId="quality-pill"
                      className="pill"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  {o.label}
                </motion.button>
              ))}
            </div>
            <p className="caption">Lower caps are available too. Demo selector.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Android TV: arrow keys move a focus ring that glides between tiles. */
const TV_TILES = [
  "Continue watching",
  "Live TV",
  "Recordings",
  "Guide",
  "Bookmarks",
  "Shared links",
];
const COLS = 3;

export function TvHome() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    setActive(to);
    refs.current[to]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = TV_TILES.length - 1;
    const next: Record<string, number> = {
      ArrowRight: Math.min(active + 1, last),
      ArrowLeft: Math.max(active - 1, 0),
      ArrowDown: active + COLS <= last ? active + COLS : active,
      ArrowUp: active - COLS >= 0 ? active - COLS : active,
    };
    const to = next[e.key];
    if (to !== undefined) {
      e.preventDefault();
      move(to);
    }
  };

  return (
    <section className="section" id="tv" aria-labelledby="tv-title">
      <div className="wrap">
        <div className="split">
          <div data-reveal>
            <h2 id="tv-title" className="display">
              A real TV home screen.
            </h2>
            <p className="lede">
              Vesper on Android TV has its own home screen, built for the D-pad on your remote. Try
              it: use the arrow keys.
            </p>
          </div>
          <div
            className="tv"
            role="group"
            aria-label="Android TV home demo. Use the arrow keys to move focus."
            onKeyDown={onKey}
            data-reveal
          >
            {TV_TILES.map((t, i) => (
              <motion.button
                key={t}
                type="button"
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="tv-tile"
                tabIndex={active === i ? 0 : -1}
                onClick={() => move(i)}
                onFocus={() => setActive(i)}
                animate={{ scale: active === i ? 1.06 : 1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ zIndex: active === i ? 1 : 0 }}
              >
                {active === i && (
                  <motion.span
                    layoutId="tv-focus"
                    className="tv-focus"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                {t}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function SelfHost() {
  return (
    <section className="section" id="host" aria-labelledby="host-title">
      <div className="wrap">
        <div className="split">
          <div className="order-first">
            <Frame shot={SHOTS.admin} />
          </div>
          <div data-reveal>
            <h2 id="host-title" className="display">
              Yours to host. Yours to keep.
            </h2>
            <p className="lede">
              You run the server yourself, so your provider logins stay on your machine. One Rust
              binary and SQLite: Windows, Linux, Docker or a NAS.
            </p>
            <ul className="points">
              <li>An admin web panel with users, invites, an audit log and storage.</li>
              <li>Lite mode, with cross-site protection.</li>
              <li>Bookmarks, continue watching and shared links.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Honest() {
  return (
    <section className="section" aria-labelledby="honest-title">
      <div className="wrap">
        <div className="honest" data-reveal>
          <h2 id="honest-title">An honest note.</h2>
          <p className="lede">
            Chromecast and TV remote behaviour is tested on emulators and in unit tests, not on
            every device. If something misbehaves on yours, please tell us on GitHub.
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({ href, title, text }: { href: string; title: string; text: string }): ReactNode {
  return (
    <motion.a
      className="link-row"
      href={href}
      whileHover={{ x: 6 }}
      whileTap={{ scale: 0.985 }}
      data-reveal
    >
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <span className="arrow" aria-hidden="true">
        →
      </span>
    </motion.a>
  );
}

export function Install() {
  return (
    <section className="section" id="install" aria-labelledby="install-title">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <h2 id="install-title" className="display">
            Set it up in an evening.
          </h2>
          <p className="lede">
            Start the server, add your playlist, open the app. The README walks you through it.
          </p>
        </div>
        <div className="links">
          <Row href={LINKS.readme} title="Read the README" text="Install and first steps" />
          <Row href={LINKS.releases} title="Download a release" text="Builds on GitHub Releases" />
          <Row href={LINKS.docs} title="Browse the docs" text="Guide, server and architecture" />
        </div>
      </div>
    </section>
  );
}
