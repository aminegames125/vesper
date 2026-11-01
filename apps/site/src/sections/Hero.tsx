import { motion } from "framer-motion";
import { useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "../gsap";
import { Btn, REPO, Tally, useSplitReveal } from "../ui";

type Prog = { t: string; from: number; to: number; rec?: boolean; pad?: boolean };

// A made-up evening of listings, drawn as a strip. 0..100 is 19:00 to 23:00.
const ROWS: { ch: string; progs: Prog[] }[] = [
  {
    ch: "Harbour News",
    progs: [
      { t: "Bulletin", from: 0, to: 20 },
      { t: "Weather and Tides", from: 20, to: 29, rec: true },
      { t: "Late Edition", from: 29, to: 58 },
      { t: "Night Desk", from: 58, to: 100 },
    ],
  },
  {
    ch: "Nordic Docs",
    progs: [
      { t: "The Long Coast", from: 0, to: 38, rec: true },
      { t: "Ice Roads", from: 38, to: 70 },
      { t: "Salt and Stone", from: 70, to: 100, rec: true },
    ],
  },
  {
    ch: "Cinema Classics",
    progs: [
      { t: "Short Reels", from: 0, to: 14 },
      { t: "Night Train", from: 14, to: 62, rec: true },
      { t: "Encore", from: 62, to: 100 },
    ],
  },
];

function Strip() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const head = root.querySelector<HTMLElement>(".ph");
        const time = root.querySelector<HTMLElement>(".ph-time");
        if (!head) return;
        const D = 14;
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2 });
        tl.fromTo(
          head,
          { x: 0 },
          {
            x: () => root.querySelector<HTMLElement>(".strip-track")!.offsetWidth,
            duration: D,
            ease: "none",
          },
          0,
        );
        const counter = { v: 0 };
        tl.fromTo(
          counter,
          { v: 0 },
          {
            v: 100,
            duration: D,
            ease: "none",
            onUpdate: () => {
              if (!time) return;
              const mins = Math.floor((counter.v / 100) * 240);
              time.textContent = `${String(19 + Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
            },
          },
          0,
        );
        root.querySelectorAll<HTMLElement>("[data-rec]").forEach((b) => {
          const from = Number(b.dataset.from);
          const to = Number(b.dataset.to);
          const fill = b.querySelector<HTMLElement>(".fill");
          if (!fill) return;
          tl.fromTo(
            fill,
            { scaleX: 0 },
            { scaleX: 1, duration: ((to - from) / 100) * D, ease: "none" },
            (from / 100) * D,
          );
        });
        tl.progress(0.18);
        return () => tl.kill();
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div
      className="strip"
      ref={ref}
      role="img"
      aria-label="An evening of TV listings. Programmes marked for recording fill with red as the clock passes them."
    >
      <div className="strip-head">
        <span>
          <Tally /> <b>Vesper</b> records while you are away
        </span>
        <span className="mono ph-time">19:00</span>
      </div>
      <div className="strip-grid">
        {ROWS.map((r) => (
          <div className="strip-row" key={r.ch}>
            <span className="strip-ch">{r.ch}</span>
            <div className="strip-track">
              {r.progs.map((p) => (
                <div
                  key={p.t}
                  className={`prog ${p.rec ? "is-rec" : ""}`}
                  style={{ left: `${p.from}%`, width: `${p.to - p.from}%` }}
                  {...(p.rec ? { "data-rec": "", "data-from": p.from, "data-to": p.to } : {})}
                >
                  {p.rec && <i className="fill" />}
                  <em>{p.t}</em>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="ph" aria-hidden="true" />
      </div>
    </div>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  useSplitReveal(h1, { onLoad: true });

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_OK}`, () => {
        gsap.from(".hero-in", {
          y: 28,
          autoAlpha: 0,
          duration: 1,
          stagger: 0.12,
          ease: "expo.out",
          delay: 0.55,
        });
        // Glow follows the pointer a little; the headline drifts up as the page scrolls.
        const gx = gsap.quickTo(".hero-glow", "x", { duration: 1.2, ease: "power3" });
        const gy = gsap.quickTo(".hero-glow", "y", { duration: 1.2, ease: "power3" });
        const move = (e: PointerEvent) => {
          gx((e.clientX / window.innerWidth - 0.5) * 120);
          gy((e.clientY / window.innerHeight - 0.5) * 80);
        };
        window.addEventListener("pointermove", move);
        gsap.to(".hero-title-wrap", {
          yPercent: -12,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
        gsap.to(".hero-glow-wrap", {
          yPercent: 30,
          scale: 1.2,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
        return () => window.removeEventListener("pointermove", move);
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <header className="hero" ref={root} id="top">
      <div className="hero-glow-wrap" aria-hidden="true">
        <div className="hero-glow" />
      </div>
      <div className="wrap">
        <p className="hero-in hero-kicker">
          <Tally size={9} /> A Kodi add-on and a small recording server
        </p>
        <div className="hero-title-wrap">
          <h1 ref={h1} className="hero-title split">
            Record IPTV <span className="nb">from Kodi.</span>
          </h1>
        </div>
        <div className="hero-cols">
          <p className="lede hero-in">
            Press <strong>Record with Vesper</strong> in Kodi's own Live TV channels and guide. A
            tiny server on a machine that stays on does the recording. You watch it back in Kodi,
            with resume, even while it is still recording.
          </p>
          <div className="hero-cta hero-in">
            <Btn href="#install">Install the add-on</Btn>
            <Btn href={REPO} variant="ghost" ext>
              View on GitHub
            </Btn>
            <motion.p className="fine" initial={false}>
              Free, MIT licence, self-hosted. Your IPTV provider stays yours.
            </motion.p>
          </div>
        </div>
        <div className="hero-in">
          <Strip />
        </div>
      </div>
    </header>
  );
}
