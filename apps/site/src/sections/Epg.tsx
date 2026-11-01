import { useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "../gsap";
import { Section, scheduleRefresh, Tally, Title } from "../ui";

const H0 = 17; // 17:00
const H1 = 25; // 01:00
const HOURS = H1 - H0;

type P = {
  t: string;
  s: number;
  e: number;
  rec?: { before: number; after: number; tag?: string; over?: number };
};
const ROWS: { ch: string; p: P[] }[] = [
  {
    ch: "Harbour News",
    p: [
      { t: "Morning Replay", s: 17, e: 18.5 },
      { t: "Market Close", s: 18.5, e: 19.5 },
      { t: "Evening Bulletin", s: 19.5, e: 20, rec: { before: 1, after: 3, tag: "Every weekday" } },
      { t: "Weather and Tides", s: 20, e: 20.25 },
      { t: "Late Edition", s: 20.25, e: 22 },
      { t: "Night Desk", s: 22, e: 25 },
    ],
  },
  {
    ch: "Nordic Docs",
    p: [
      { t: "Salt and Stone", s: 17, e: 19 },
      { t: "The Long Coast", s: 19, e: 20.5, rec: { before: 1, after: 3 } },
      { t: "Ice Roads", s: 20.5, e: 21.5 },
      { t: "Reindeer Year", s: 21.5, e: 23.5 },
      { t: "Quiet Rivers", s: 23.5, e: 25 },
    ],
  },
  {
    ch: "Cinema Classics",
    p: [
      { t: "Short Reels", s: 17, e: 18.75 },
      { t: "Harbour Lights", s: 18.75, e: 20 },
      { t: "Night Train", s: 20, e: 22, rec: { before: 1, after: 3, tag: "Keeps the newest 3" } },
      { t: "Encore Reel", s: 22, e: 23.5 },
      { t: "Silent Hour", s: 23.5, e: 25 },
    ],
  },
  {
    ch: "Arena Sport",
    p: [
      { t: "Pre-match", s: 17, e: 19 },
      { t: "Cup Replay", s: 19, e: 21 },
      { t: "Studio Talk", s: 21, e: 22 },
      {
        t: "Cup Final",
        s: 22,
        e: 24,
        rec: { before: 1, after: 3, over: 0.5, tag: "Follows the guide if it runs over" },
      },
      { t: "Highlights", s: 24, e: 25 },
    ],
  },
];

const CLASH = { s: 19.98, e: 20.5 };
const clock = (h: number) => {
  const m = Math.max(0, Math.round(h * 60));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default function Epg() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        el.classList.add("pin-mode");
        const view = el.querySelector<HTMLElement>(".epg-view")!;
        const track = el.querySelector<HTMLElement>(".epg-track")!;
        const clockEl = el.querySelector<HTMLElement>(".epg-clock")!;
        const clash = el.querySelector<HTMLElement>(".epg-clash")!;
        const count = el.querySelector<HTMLElement>(".epg-count")!;
        const blocks = gsap.utils.toArray<HTMLElement>(".rec-block", el).map((b) => ({
          fill: b.querySelector<HTMLElement>(".fill")!,
          s: Number(b.dataset.s),
          e: Number(b.dataset.e),
          b,
        }));
        const total = () => track.scrollWidth - view.clientWidth;
        const hourW = () => track.scrollWidth / HOURS;
        const phX = () => view.clientWidth * 0.3;
        const update = () => {
          const x = Number(gsap.getProperty(track, "x"));
          const t = H0 + (phX() - x) / hourW();
          clockEl.textContent = clock(t);
          let active = 0;
          for (const r of blocks) {
            const p = gsap.utils.clamp(0, 1, (t - r.s) / (r.e - r.s));
            gsap.set(r.fill, { scaleX: p });
            if (p > 0 && p < 1) active++;
          }
          count.textContent = `${active} recording${active === 1 ? "" : "s"} at once`;
          gsap.set(clash, { autoAlpha: t > CLASH.s && t < CLASH.e ? 1 : 0.0 });
        };
        gsap.set(track, { x: 0 });
        gsap.to(track, {
          x: () => -total(),
          ease: "none",
          scrollTrigger: {
            trigger: el.querySelector(".epg-pin"),
            start: "top top",
            end: () => `+=${total() * 1.1}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: update,
            onRefresh: update,
          },
        });
        update();
        return () => {
          el.classList.remove("pin-mode");
        };
      });
      scheduleRefresh();
      return () => mm.revert();
    },
    { scope: root },
  );

  const pct = (h: number) => `${((h - H0) / HOURS) * 100}%`;

  return (
    <Section id="schedule" labelledBy="epg-title" className="sheet-c epg">
      <div ref={root} className="epg-root">
        <div className="epg-pin">
          <div className="wrap">
            <div className="sec-head tight">
              <Title id="epg-title">Your guide, recording itself.</Title>
              <p className="lede">
                Scroll the evening. Programmes you marked turn red as the clock reaches them, with
                padding on each side, a warning if two collide and a programme that overruns kept
                for you.
              </p>
            </div>
          </div>
          <div
            className="epg-view"
            tabIndex={0}
            role="group"
            aria-label="A scrolling evening of TV listings with four recordings. Scroll sideways."
          >
            <div className="epg-track" style={{ ["--hours" as string]: HOURS }}>
              <div className="epg-hours" aria-hidden="true">
                {Array.from({ length: HOURS }, (_, i) => (
                  <span key={i} className="mono" style={{ left: pct(H0 + i) }}>
                    {clock(H0 + i)}
                  </span>
                ))}
              </div>
              {ROWS.map((r) => (
                <div className="epg-row" key={r.ch}>
                  {r.p.map((p) => {
                    const rec = p.rec;
                    return (
                      <div
                        key={p.t}
                        className={`epg-p ${rec ? "rec-block" : ""}`}
                        style={{ left: pct(p.s), width: `${((p.e - p.s) / HOURS) * 100}%` }}
                        {...(rec
                          ? { "data-s": p.s - rec.before / 60, "data-e": p.e + rec.after / 60 }
                          : {})}
                      >
                        {rec && (
                          <>
                            <i
                              className="pad before"
                              style={{ width: `${(rec.before / 60 / (p.e - p.s)) * 100}%` }}
                            />
                            <i
                              className="pad after"
                              style={{ width: `${(rec.after / 60 / (p.e - p.s)) * 100}%` }}
                            />
                            {rec.over && (
                              <i
                                className="pad over"
                                style={{ width: `${(rec.over / (p.e - p.s)) * 100}%` }}
                              />
                            )}
                            <i className="fill" />
                          </>
                        )}
                        <span className="epg-t">{p.t}</span>
                        <span className="epg-s mono">
                          {clock(p.s)} to {clock(p.e)}
                        </span>
                        {rec?.tag && (
                          <span className="epg-tag">
                            <Tally size={7} /> {rec.tag}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div
                className="epg-clashband"
                style={{ left: pct(CLASH.s), width: `${((CLASH.e - CLASH.s) / HOURS) * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="epg-head" aria-hidden="true">
              {ROWS.map((r, i) => (
                <span className="epg-ch" key={r.ch} style={{ ["--i" as string]: i }}>
                  {r.ch}
                </span>
              ))}
              <div className="epg-line" />
              <div className="epg-hud">
                <span className="mono epg-clock">17:00</span>
                <span className="epg-count">0 recordings at once</span>
              </div>
            </div>
            <div className="epg-clash" role="status">
              <b>Clash.</b> Three recordings overlap around 20:00. Vesper flags it when you save,
              before it costs you a show.
            </div>
          </div>
          <div className="wrap">
            <p className="fine epg-note">
              Repeating schedules are made in the Vesper admin panel. Listings shown are made up.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
