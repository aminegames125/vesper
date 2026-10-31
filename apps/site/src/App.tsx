import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { type ReactNode, useRef } from "react";
import { LINKS, SHOTS } from "./data";
import { gsap, MOTION_OK, ScrollTrigger, SplitText, useGSAP } from "./gsap";
import { asset, BARS, Mark } from "./Mark";
import { Features, Guide, Honest, Install, SelfHost, Space, TvHome, Watch } from "./sections";

const MOBILE = "(max-width: 860px)";
const DESKTOP = "(min-width: 861px)";

export function App() {
  const root = useRef<HTMLDivElement>(null);

  // Page-level motion: progress rail, bar dividers and section reveals.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(".rail", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
        });

        for (const el of gsap.utils.toArray<HTMLElement>(".divider")) {
          gsap.from(el.children, {
            scaleX: 0,
            stagger: 0.12,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top 92%", end: "bottom 55%", scrub: 0.5 },
          });
        }

        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
        gsap.set(items, { opacity: 0, y: 28 });
        ScrollTrigger.batch(items, {
          start: "top 90%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: "power3.out",
              stagger: 0.08,
              overwrite: true,
            }),
        });
      });
    },
    { scope: root },
  );

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root}>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="rail" aria-hidden="true" />
        <Header />
        <main id="main">
          <Hero />
          <Showcase />
          <Divider />
          <How />
          <Features />
          <Guide />
          <Space />
          <Watch />
          <TvHome />
          <SelfHost />
          <Honest />
          <Divider />
          <Install />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

function Header() {
  const brand = useRef<HTMLAnchorElement>(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const el = brand.current;
      if (!el || !contextSafe) return;
      const bars = el.querySelectorAll(".bar");
      const wiggle = contextSafe(() => {
        gsap.fromTo(
          bars,
          { scaleX: 0.35 },
          { scaleX: 1, duration: 0.7, stagger: 0.07, ease: "elastic.out(1, 0.6)", overwrite: true },
        );
      });
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        el.addEventListener("pointerenter", wiggle);
        el.addEventListener("focus", wiggle);
        return () => {
          el.removeEventListener("pointerenter", wiggle);
          el.removeEventListener("focus", wiggle);
        };
      });
    },
    { scope: brand },
  );

  return (
    <header className="top">
      <div className="wrap">
        <a ref={brand} className="brand" href="#top" aria-label="Vesper, back to top">
          <Mark />
          Vesper
        </a>
        <nav className="nav" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#guide">Guide</a>
          <a href="#space">Space</a>
          <a href="#watch">Watch</a>
          <a href="#host">Self-host</a>
          <motion.a
            className="btn small"
            href="#install"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            Install
          </motion.a>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    (_ctx, contextSafe) => {
      const el = root.current;
      if (!el || !contextSafe) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const bars = gsap.utils.toArray<SVGRectElement>(".hero-mark .bar", el);

        // Intro: bars slide out of the left edge, then breathe like an equaliser.
        gsap.set(bars, { scaleX: 0 });
        // Created after the intro, so the breathing starts from the full-width bars.
        let idle: gsap.core.Timeline | undefined;
        const breathe = () => {
          idle = gsap.timeline();
          bars.forEach((b, i) => {
            idle?.to(
              b,
              {
                scaleX: 0.8 + i * 0.04,
                duration: 1.3 + i * 0.35,
                ease: "sine.inOut",
                yoyo: true,
                repeat: -1,
              },
              0,
            );
          });
        };

        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        intro.to(bars, { scaleX: 1, duration: 1.3, stagger: 0.12 }, 0.1);
        intro.from(
          ".hero .lede, .hero .cta-row",
          { opacity: 0, y: 24, duration: 0.9, stagger: 0.1 },
          0.7,
        );
        intro.add(breathe);

        const split = SplitText.create(".hero h1", {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, { yPercent: 110, duration: 1.1, stagger: 0.1, ease: "expo.out" }),
        });

        // Bars follow the pointer, each by a different amount.
        const xTo = bars.map((b) => gsap.quickTo(b, "x", { duration: 0.9, ease: "power3.out" }));
        const onMove = contextSafe((e: PointerEvent) => {
          if (e.pointerType === "touch") return;
          const n = (e.clientX / window.innerWidth - 0.5) * 2;
          xTo.forEach((to, i) => {
            to(n * (i + 1) * 1.4);
          });
        });
        el.addEventListener("pointermove", onMove);

        // Scrolling away pulls the bars apart.
        gsap.to(bars, {
          y: (i) => -(i + 1) * 3,
          opacity: 0.25,
          ease: "none",
          stagger: 0,
          scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
        });

        // Only breathe while the hero is on screen.
        const io = ScrollTrigger.create({
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => {
            if (!idle) return;
            if (self.isActive) idle.play();
            else idle.pause();
          },
        });

        return () => {
          el.removeEventListener("pointermove", onMove);
          split.revert();
          io.kill();
          idle?.kill();
        };
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="hero" id="top" aria-labelledby="hero-title">
      <div className="wrap">
        <div>
          <h1 id="hero-title" className="display">
            It records while you are away.
          </h1>
          <p className="lede">
            Pick a channel, a time and a length. A small server written in Rust records it, even
            with your phone off.
          </p>
          <div className="cta-row">
            <motion.a
              className="btn"
              href="#install"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              Get Vesper
            </motion.a>
            <motion.a
              className="btn ghost"
              href={LINKS.repo}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
            >
              View on GitHub
            </motion.a>
          </div>
        </div>
        <Mark className="hero-mark" title="The Vesper mark: four rounded bars, the first in pink" />
      </div>
    </section>
  );
}

function Showcase() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.35], [0.92, 1]);
  const y = useTransform(scrollYProgress, [0, 1], ["-5%", "5%"]);

  return (
    <section className="showcase" aria-label="Screenshot">
      <div className="wrap">
        <motion.div ref={ref} className="frame" style={reduce ? undefined : { scale }}>
          <div className="frame-bar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="frame-body">
            <motion.img
              src={asset(SHOTS.home.src)}
              alt={SHOTS.home.alt}
              width={800}
              height={500}
              decoding="async"
              style={reduce ? undefined : { y, scale: 1.12 }}
            />
          </div>
        </motion.div>
        <p className="caption" style={{ textAlign: "center" }}>
          The Vesper app, with demo data.
        </p>
      </div>
    </section>
  );
}

export function Divider() {
  return (
    <div className="wrap" aria-hidden="true">
      <div className="divider">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

const STEPS = [
  { t: "Choose a channel", p: "Pick it from your list, or from the TV guide." },
  {
    t: "Set a time and a length",
    p: "Add repeats and padding so the start and end are never clipped.",
  },
  { t: "Leave", p: "The server records it while you are away, even with your phone off." },
];

function How() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      mm.add(`${MOTION_OK} and ${DESKTOP}`, () => {
        el.classList.add("is-pinned");
        const bars = gsap.utils.toArray<SVGRectElement>(".how-viz .bar", el);
        const steps = gsap.utils.toArray<HTMLElement>(".how-step", el);
        const rec = el.querySelector(".rec");
        const [b0, b1, b2, b3] = bars;
        const [s0, s1, s2] = steps;
        if (!(b0 && b1 && b2 && b3 && s0 && s1 && s2 && rec)) return;

        gsap.set([b1, b2, b3], { opacity: 0.2 });
        gsap.set([s1, s2], { opacity: 0, y: 28 });
        gsap.set(rec, { x: 22, scaleX: 0, transformOrigin: "0% 50%" });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut", duration: 1 },
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=2400",
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
          },
        });

        tl.to({}, { duration: 0.4 })
          // 2. the bar becomes a block on a timeline
          .to(s0, { opacity: 0, y: -28 }, 1)
          .to(s1, { opacity: 1, y: 0 }, 1.2)
          .to(b0, { scaleX: 0.45, x: 22 }, 1)
          .to(b1, { scaleX: 0.35, x: 0, opacity: 0.55 }, 1.05)
          .to(b2, { scaleX: 0.5, x: 14, opacity: 0.55 }, 1.1)
          .to(b3, { scaleX: 0.8, x: 2, opacity: 0.55 }, 1.15)
          // 3. the block fills as it records
          .to(s1, { opacity: 0, y: -28 }, 2.3)
          .to(s2, { opacity: 1, y: 0 }, 2.5)
          .to(rec, { opacity: 0.35, scaleX: 0.45, duration: 1.2, ease: "none" }, 2.4)
          .to({}, { duration: 0.5 });

        return () => el.classList.remove("is-pinned");
      });

      mm.add(`${MOTION_OK} and ${MOBILE}`, () => {
        const steps = gsap.utils.toArray<HTMLElement>(".how-step", el);
        gsap.set(steps, { opacity: 0, y: 28 });
        ScrollTrigger.batch(steps, {
          start: "top 90%",
          once: true,
          onEnter: (b) =>
            gsap.to(b, { opacity: 1, y: 0, stagger: 0.12, duration: 0.8, ease: "power3.out" }),
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="how" id="how" aria-labelledby="how-title">
      <div className="wrap how-stage">
        <h2 id="how-title" className="display">
          Three steps. Then walk away.
        </h2>
        <div className="how-grid">
          <svg className="how-viz" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            {BARS.map((b, i) => (
              <rect
                key={b.y}
                className={i === 0 ? "bar bar-accent" : "bar"}
                x={b.x}
                y={b.y}
                width={b.w}
                height={7}
                rx={3.5}
              />
            ))}
            <rect className="rec" x={8} y={10} width={48} height={7} rx={3.5} />
          </svg>
          <ol className="how-steps">
            {STEPS.map((s, i) => (
              <li className="how-step" key={s.t}>
                <h3>
                  <span className="n">{i + 1}.</span> {s.t}
                </h3>
                <p>{s.p}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Footer(): ReactNode {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-mark">
          <Mark />
          Vesper
        </div>
        <div className="foot-row">
          <p>MIT licensed. Made to be hosted by you.</p>
          <p>
            <a href={LINKS.repo}>GitHub</a>
            <a href={LINKS.releases}>Releases</a>
            <a href={LINKS.docs}>Docs</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
