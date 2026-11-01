import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "./gsap";
import { KodiScreen, LOGO_GUIDE, LogoGuide } from "./KodiScreen";

const REPO = "https://github.com/aminegames125/vesper";
const RELEASES = `${REPO}/releases/latest`;
const KODI_ZIP = "https://amineos.dev/vesper/kodi/repository.vesper/repository.vesper-1.0.0.zip";

const STEPS = [
  {
    h: "Find it in the guide.",
    p: "Vesper adds one line to Kodi's own menu on a channel or a programme. There is no second app to learn.",
  },
  {
    h: "Choose how often.",
    p: "Once, every week, every day, or every episode. It starts a minute early and stops three minutes late, so you keep the beginning.",
  },
  {
    h: "The server takes over.",
    p: "It runs on a machine that stays on, not on your TV box. If the stream drops, it joins it again and keeps one file.",
  },
  {
    h: "Watch it. Even now.",
    p: "Open a recording in Kodi while it is still recording, and carry on where you stopped.",
  },
];

const STAGES = [
  { w: 100, time: "A few seconds", word: "First", text: "you pick a programme in Kodi's guide." },
  {
    w: 80,
    time: "Until it airs",
    word: "Then",
    text: "the server waits, and starts a minute early.",
  },
  {
    w: 60,
    time: "The whole programme",
    word: "While it airs",
    text: "it records as it arrives, with no re-encoding.",
  },
  {
    w: 40,
    time: "A week, or as you say",
    word: "Afterwards",
    text: "it deletes itself. Keep any one for ever.",
  },
];

const FIELDS = [
  {
    tone: "rec",
    h: "One file, always.",
    p: "If the stream drops, the server joins it again and keeps one recording that plays from start to finish. Audio that arrives separately is joined in too.",
  },
  {
    tone: "paper",
    h: "Watch while recording.",
    p: "Recordings are HLS, so Kodi can open one while it is still being written. Stop, come back tomorrow, and it resumes where you left it.",
  },
  {
    tone: "dark",
    h: "It cleans up.",
    p: "A deletion timer (a week by default), a limit to keep only the newest few episodes, and a refusal to start when the disk is nearly full instead of an empty file.",
  },
  {
    tone: "amber",
    h: "Home or shared.",
    p: "Lite mode has no login and stays on your home network. Full mode adds users, quotas and HTTPS, for a server that several people use.",
  },
];

const FAQ = [
  {
    q: "Which Kodi and which devices?",
    a: "Kodi 19 or later, on Android TV, Fire TV, LibreELEC, Windows, Linux and macOS. The server runs on Linux (x64 and arm64), Windows and in Docker, so a Raspberry Pi or a NAS will do.",
  },
  {
    q: "The add-on cannot find my server.",
    a: "Finding it uses mDNS, which guest Wi-Fi, some VPNs and Docker's default network block. Type the server's address in the add-on settings, for example 192.168.1.20:8484, not localhost.",
  },
  {
    q: "Which IPTV sources work?",
    a: "Channels that come from an M3U link in Kodi's PVR IPTV Simple Client. Vesper reads those links and adds them to the server. Tvheadend, Zattoo and other PVR add-ons do not expose stream addresses, so they cannot be recorded.",
  },
  {
    q: "Can I use it away from home?",
    a: "Yes, with full mode behind an HTTPS reverse proxy. Lite mode has no login and must stay on your home network.",
  },
  {
    q: "Where do the recordings go?",
    a: "Into the server's data folder, as plain segment files with a playlist. Back up that folder and you have backed up everything.",
  },
  {
    q: "Does it come with channels?",
    a: "No. Vesper records only what you add yourself and ships no channels or playlists. Record content you have the right to record.",
  },
];

const COMPOSE = `services:
  vesper:
    image: ghcr.io/aminegames125/vesper-server:latest
    restart: unless-stopped
    ports:
      - "8484:8484"
    volumes:
      - vesper-data:/data
    environment:
      VESPER_MODE: lite

volumes:
  vesper-data:`;

const SERVER_TABS = [
  {
    id: "docker",
    label: "Docker",
    code: COMPOSE,
    file: "docker-compose.yml",
    then: "docker compose up -d",
  },
  {
    id: "linux",
    label: "Linux and Pi",
    code: "./vesper-server --mode lite",
    file: "Unpack the release, then",
    then: "",
  },
  {
    id: "windows",
    label: "Windows",
    code: ".\\vesper-server.exe --mode lite",
    file: "Unpack the zip, then",
    then: "",
  },
];

/* ------------------------------------------------------------------ small parts */

const BARS = [
  { x: 8, w: 48, y: 10 },
  { x: 14, w: 36, y: 21 },
  { x: 20, w: 24, y: 32 },
  { x: 26, w: 12, y: 43 },
];

/** The Vesper mark. As the page scrolls, its bars light up one by one. */
function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`mark ${className}`}
      viewBox="0 0 64 64"
      width="30"
      height="30"
      aria-hidden="true"
      focusable="false"
    >
      {BARS.map((b, i) => (
        <rect className={`mb mb-${i}`} key={b.y} x={b.x} y={b.y} width={b.w} height="7" rx="3.5" />
      ))}
    </svg>
  );
}

function Button({
  href,
  children,
  tone = "rec",
}: {
  href: string;
  children: string;
  tone?: "rec" | "ink";
}) {
  return (
    <motion.a
      className={`btn btn-${tone}`}
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      whileHover={{ y: -3 }}
      whileTap={{ y: 1, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
    >
      {children}
    </motion.a>
  );
}

function Code({ file, code }: { file: string; code: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* The text stays selectable, so copying by hand still works. */
    }
  }, [code]);
  return (
    <div className="code">
      <div className="code-bar">
        <span>{file}</span>
        <button type="button" onClick={copy} aria-live="polite">
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

function Header() {
  return (
    <header className="bar">
      <a className="word" href="#top" aria-label="Vesper, back to the top">
        <Mark />
        Vesper
      </a>
      <nav aria-label="Main">
        <a href="#how">How</a>
        <a href="#install">Install</a>
        <a href="#questions">Questions</a>
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </nav>
      <Button href="#install">Install</Button>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <h1 className="hero-h">
        <span className="hero-a" data-split>
          Record
        </span>
        <span className="hero-frame">
          <LogoGuide />
        </span>
        <span className="hero-b" data-split>
          from Kodi.
        </span>
      </h1>
      <div className="hero-foot">
        <p>
          Pick a programme in Kodi's own Live TV guide. A small server you host does the recording,
          and you watch it back in Kodi, even while it is still recording.
        </p>
        <Button href="#install">Install Vesper</Button>
      </div>
    </section>
  );
}

/** The four bars of the mark are the four steps. The one you are on is pink. */
function StepBars({ step, onPick }: { step: number; onPick: (i: number) => void }) {
  return (
    <div className="stepbars" role="group" aria-label="Steps">
      {STEPS.map((st, i) => (
        <motion.button
          key={st.h}
          type="button"
          className={`sb${i === step ? " is-on" : ""}`}
          style={{ width: `${100 - i * 25}%` }}
          aria-label={`Step ${i + 1}: ${st.h}`}
          aria-current={i === step}
          onClick={() => onPick(i)}
          animate={{
            backgroundColor: i === step ? "#ff4d6d" : "#f3eee6",
            opacity: i === step ? 1 : 0.28,
          }}
          whileHover={{ opacity: 1, scaleY: 1.5 }}
          transition={{ duration: 0.25 }}
        />
      ))}
    </div>
  );
}

function Story() {
  const [step, setStep] = useState(0);
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>("[data-step]", root.current);
      els.forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 58%",
          end: "bottom 58%",
          onToggle: (self) => self.isActive && setStep(i),
        });
      });
    },
    { scope: root },
  );

  const pick = (i: number) => {
    const el = root.current?.querySelectorAll<HTMLElement>("[data-step]")[i];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section className="story" id="how" ref={root}>
      <div className="story-steps">
        {STEPS.map((s, i) => (
          <article className={`step${i === step ? " is-on" : ""}`} data-step key={s.h}>
            <h2 data-split>{s.h}</h2>
            <p>{s.p}</p>
          </article>
        ))}
      </div>
      <div className="story-screen">
        <div className="story-sticky">
          <KodiScreen step={step} />
          <div className="story-foot">
            <p className="cap">
              A picture of Kodi made for this page. The channels and programmes are made up.
            </p>
            <StepBars step={step} onPick={pick} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stages() {
  return (
    <section className="stages">
      <h2 data-split>A recording's life.</h2>
      <div className="stairs" data-ui>
        {STAGES.map((st, i) => (
          <div className={`stair stair-${i}`} style={{ width: `${st.w}%` }} key={st.time}>
            <span className="stair-time">{st.time}</span>
            <span className="stair-text">
              <b>{st.word}</b> {st.text}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Fields() {
  return (
    <>
      {FIELDS.map((f, i) => (
        <section className={`field field-${f.tone}${i % 2 ? " is-flip" : ""}`} key={f.h}>
          <p className="field-p">{f.p}</p>
          <h2 className="field-h" data-split>
            {f.h}
          </h2>
        </section>
      ))}
    </>
  );
}

function Install() {
  const [tab, setTab] = useState("docker");
  const cur =
    SERVER_TABS.find((t) => t.id === tab) ?? (SERVER_TABS[0] as (typeof SERVER_TABS)[number]);
  return (
    <section className="install" id="install">
      <h2 data-split>Two parts. About ten minutes.</h2>
      <div className="install-cols">
        <div className="install-col">
          <h3>The server</h3>
          <p>
            Put it on a machine that stays on. Linux, Windows or Docker, on x64 or arm64.{" "}
            <a href={RELEASES} target="_blank" rel="noopener noreferrer">
              Releases
            </a>{" "}
            has the downloads.
          </p>
          <LayoutGroup id="server-tabs">
            <div className="tabs" role="tablist" aria-label="Where the server runs">
              {SERVER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === tab}
                  className={t.id === tab ? "is-on" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.id === tab && <motion.span className="tab-under" layoutId="tab-under" />}
                </button>
              ))}
            </div>
          </LayoutGroup>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={cur.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Code file={cur.file} code={cur.code} />
              {cur.then && <Code file="Then" code={cur.then} />}
            </motion.div>
          </AnimatePresence>
          <p className="note">
            Shared server or away from home? Run it in full mode instead. The{" "}
            <a href={`${REPO}/blob/main/docs/SERVER.md`} target="_blank" rel="noopener noreferrer">
              server guide
            </a>{" "}
            has Docker Compose, HTTPS and the rest.
          </p>
        </div>
        <div className="install-col">
          <h3>The add-on</h3>
          <p>Download the Vesper repository, so Kodi can update the add-on for you.</p>
          <p>
            <Button href={KODI_ZIP} tone="rec">
              Download the repository
            </Button>
          </p>
          <ol className="kodi-steps">
            <li>
              In Kodi, open Add-ons, then Install from zip file, and pick the file you downloaded.
            </li>
            <li>
              Open Install from repository, then Vesper repository, then Video add-ons, then Vesper.
            </li>
            <li>
              Open the add-on's settings. It finds the server on its own, or type its address.
            </li>
          </ol>
          <p className="note">
            It is a young add-on and has not been tried on every Kodi box. If something is off,{" "}
            <a href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener noreferrer">
              open an issue
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="faq" id="questions">
      <h2 data-split>Questions.</h2>
      <div className="faq-list">
        {FAQ.map((f, i) => {
          const on = open === i;
          return (
            <div className={`qa${on ? " is-open" : ""}`} key={f.q}>
              <button
                type="button"
                className="qa-q"
                aria-expanded={on}
                aria-controls={`qa-${i}`}
                onClick={() => setOpen(on ? null : i)}
              >
                {f.q}
                <span className="chev" aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div
                    id={`qa-${i}`}
                    className="qa-a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p>{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Close() {
  return (
    <section className="close">
      <div className="close-main">
        <h2 data-split>Your guide, on the record.</h2>
        <svg className="big-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          {BARS.map((b, i) => (
            <rect
              className={`bb bb-${i}`}
              key={b.y}
              x={b.x}
              y={b.y}
              width={b.w}
              height="7"
              rx="3.5"
            />
          ))}
        </svg>
      </div>
      <div className="close-foot">
        <p>
          Free, MIT licensed, and yours to host. Nothing leaves your network unless you send it.
        </p>
        <Button href="#install" tone="rec">
          Get Vesper
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot-top">
        <p>Vesper records only what you add yourself and ships no channels or playlists.</p>
        <p>
          <a href="#top">Back to the top</a>
        </p>
      </div>
      <a className="foot-link" href={REPO} target="_blank" rel="noopener noreferrer">
        aminegames125
        <br />
        /vesper
      </a>
      <div className="foot-meta">
        <span>
          <a href={`${REPO}/tree/main/docs`} target="_blank" rel="noopener noreferrer">
            Docs
          </a>
          {" · "}
          <a href={RELEASES} target="_blank" rel="noopener noreferrer">
            Releases
          </a>
          {" · "}
          <a href="https://amineos.dev" target="_blank" rel="noopener noreferrer">
            amineos.dev
          </a>
        </span>
        <span>MIT licence</span>
        <span>Amineos, 2026</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page */

export function App() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        let splits: SplitText[] = [];
        const build = () => {
          // Headlines rise out of a mask, one line at a time.
          gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
            const inHero = !!el.closest(".hero");
            const s = SplitText.create(el, { type: "lines", mask: "lines", linesClass: "ln" });
            splits.push(s);
            gsap.from(s.lines, {
              yPercent: 105,
              duration: inHero ? 1.1 : 0.9,
              ease: "expo.out",
              stagger: 0.08,
              delay: inHero ? 0.15 : 0,
              scrollTrigger: inHero ? undefined : { trigger: el, start: "top 88%", once: true },
            });
          });
        };
        document.fonts.ready.then(build);

        // The mark in the header draws itself, then lights up bar by bar as the page is read.
        gsap.from(".bar .mb", { scaleX: 0, duration: 0.8, ease: "expo.out", stagger: 0.1 });
        const read = gsap.timeline({
          scrollTrigger: {
            trigger: "main",
            start: "top top",
            endTrigger: ".foot",
            end: "top bottom",
            scrub: 0.4,
          },
        });
        read
          .to(".bar .mb-1", { fill: "#ff4d6d", duration: 1 })
          .to(".bar .mb-2", { fill: "#ff4d6d", duration: 1 })
          .to(".bar .mb-3", { fill: "#ff4d6d", duration: 1 });

        // The hero frame starts as the mark. Its four bars become the programme bars of a guide, the
        // first one starts recording, and the guide folds back into the mark.
        const bars = gsap.utils.toArray<HTMLElement>(".lg-bar");
        const guideW = () =>
          (document.querySelector(".lg-in") as HTMLElement | null)?.offsetWidth ?? 0;
        gsap.from(bars, { scaleX: 0, duration: 0.9, ease: "expo.out", stagger: 0.1 });
        const tl = gsap.timeline({ repeat: -1, delay: 1.8 });
        LOGO_GUIDE.forEach((b, i) => {
          const bar = bars[i];
          if (!bar) return;
          const em = bar.querySelector("em");
          tl.to(
            bar,
            { left: `${b.guide[0]}%`, width: `${b.guide[1]}%`, duration: 1, ease: "power3.inOut" },
            i * 0.08,
          );
          tl.to(em, { opacity: 1, duration: 0.5 }, 0.8 + i * 0.08);
        });
        tl.fromTo(".lg-head", { x: 0, autoAlpha: 1 }, { x: guideW, duration: 4, ease: "none" }, 1.6)
          .fromTo(
            ".lg-rec",
            { autoAlpha: 0, scale: 0.6 },
            { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(3)" },
            2.3,
          )
          .addLabel("fold", 6.4)
          .to(".lg-head", { autoAlpha: 0, duration: 0.2 }, "fold")
          .to(".lg-rec", { autoAlpha: 0, duration: 0.2 }, "fold")
          .to(".lg-bar em", { opacity: 0, duration: 0.3 }, "fold");
        LOGO_GUIDE.forEach((b, i) => {
          const bar = bars[i];
          if (bar)
            tl.to(
              bar,
              { left: `${b.logo[0]}%`, width: `${b.logo[1]}%`, duration: 1, ease: "power3.inOut" },
              `fold+=${0.1 + i * 0.08}`,
            );
        });
        tl.to({}, { duration: 1.6 });
        ScrollTrigger.create({
          trigger: ".hero",
          onToggle: (st) => (st.isActive ? tl.play() : tl.pause()),
        });

        // A recording's life is the mark again: four bars that get shorter, drawn from the middle.
        const stairs = gsap.timeline({
          scrollTrigger: { trigger: ".stairs", start: "top 80%", once: true },
        });
        stairs
          .from(".stair", { scaleX: 0, duration: 1.1, ease: "expo.out", stagger: 0.14 })
          .from(
            ".stair span",
            { autoAlpha: 0, y: 14, duration: 0.6, ease: "power3.out", stagger: 0.07 },
            0.5,
          );

        // The closing mark is built bar by bar, then the top one blinks like a recording light.
        gsap
          .timeline({ scrollTrigger: { trigger: ".big-mark", start: "top 80%", once: true } })
          .from(".bb", { scaleX: 0, duration: 1.1, ease: "expo.out", stagger: 0.14 })
          .to(
            ".bb-0",
            { opacity: 0.3, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" },
            1.4,
          );

        // Paragraphs on the colour fields drift in from the opposite corner to the phrase.
        gsap.utils.toArray<HTMLElement>(".field-p").forEach((p) => {
          gsap.from(p, {
            y: 40,
            autoAlpha: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: { trigger: p, start: "top 85%", once: true },
          });
        });
        gsap.from(".install-col", {
          y: 28,
          autoAlpha: 0,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.07,
          scrollTrigger: { trigger: ".install", start: "top 60%", once: true },
        });
        gsap.from(".qa", {
          y: 20,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.06,
          ease: "power3.out",
          scrollTrigger: { trigger: ".faq-list", start: "top 85%", once: true },
        });

        // The closing field flips the page: the page ends on the mark.
        gsap.from(".close-foot", {
          y: 30,
          autoAlpha: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: ".close", start: "top 40%", once: true },
        });

        return () => {
          for (const s of splits) s.revert();
          splits = [];
        };
      });
    },
    { scope: root },
  );

  // Fonts and pictures change the page height, so the triggers measure again once they land.
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    document.fonts.ready.then(refresh);
    return () => window.removeEventListener("load", refresh);
  }, []);

  return (
    <div ref={root}>
      <a className="skip" href="#how">
        Skip to the content
      </a>
      <Header />
      <main>
        <Hero />
        <Story />
        <Stages />
        <Fields />
        <Install />
        <Faq />
        <Close />
      </main>
      <Footer />
    </div>
  );
}
