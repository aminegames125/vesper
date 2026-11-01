import { useRef } from "react";
import { gsap, useGSAP } from "../gsap";
import { Section, scheduleRefresh, Tally, Title } from "../ui";

const SEGS = 18;

function SceneMenu() {
  return (
    <div className="scene scene-menu" aria-hidden="true">
      <div className="mini-menu">
        <p>Harbour News</p>
        <span>Switch to channel</span>
        <span>Channel information</span>
        <span>Add to favourites</span>
        <span className="vs sel">
          <Tally size={8} /> Record with Vesper
        </span>
        <span>Hide channel</span>
      </div>
      <div className="mini-guide">
        <i style={{ left: "0%", width: "30%" }}>Bulletin</i>
        <i className="pick" style={{ left: "30%", width: "22%" }}>
          Tides
        </i>
        <i style={{ left: "52%", width: "48%" }}>Late Edition</i>
      </div>
    </div>
  );
}

function SceneRecord() {
  return (
    <div className="scene scene-rec" aria-hidden="true">
      <div className="rec-head">
        <span>
          <Tally /> REC
        </span>
        <span className="mono tc">00:00:00</span>
      </div>
      <div className="segs">
        {Array.from({ length: SEGS }, (_, i) => (
          <i key={i} className="seg" />
        ))}
      </div>
      <p className="mono file">recordings/harbour-news/index.m3u8</p>
      <div className="stat-row">
        <span>
          Free disk <b className="mono">ok</b>
        </span>
        <span>
          Padding <b className="mono">-1 / +3 min</b>
        </span>
      </div>
    </div>
  );
}

function SceneSurvive() {
  return (
    <div className="scene scene-surv" aria-hidden="true">
      <div className="lane-label">Stream from the provider</div>
      <div className="lane">
        <i className="a" />
        <i className="gap" />
        <i className="b" />
      </div>
      <div className="lane-label">What lands on disk</div>
      <div className="lane">
        <i className="one" />
      </div>
      <p className="mono note">
        Dropped. Joined again. <b>1 recording</b>.
      </p>
    </div>
  );
}

function SceneWatch() {
  return (
    <div className="scene scene-watch" aria-hidden="true">
      <div className="player">
        <div className="player-top">
          <span>Weather and Tides</span>
          <span className="live">
            <Tally size={8} /> still recording
          </span>
        </div>
        <div className="player-bar">
          <i className="played" />
          <i className="head" />
          <i className="edge" />
        </div>
        <div className="player-foot mono">
          <span>Resume from 00:23:41?</span>
          <span>Yes</span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    t: "Pick it where you already watch.",
    p: "Open Kodi's Live TV channels or guide, press the menu button on a channel or a programme and choose Record with Vesper. A channel starts now for 30 minutes, 1 or 2 hours, or until you stop it. A programme in the guide is scheduled, a minute early and three late.",
    s: <SceneMenu />,
  },
  {
    t: "A server you own does the recording.",
    p: "The add-on hands your Kodi IPTV providers to the Vesper server once. From then on it pulls the stream itself and saves it as HLS: a folder of .ts segments and an index.m3u8. Your phone, TV and Kodi can all be off.",
    s: <SceneRecord />,
  },
  {
    t: "A dropped stream is still one file.",
    p: "When the provider cuts out, the server joins it again with growing pauses and keeps writing the same recording. A channel with a backup address switches to it after repeated failures. You get one recording to play start to finish.",
    s: <SceneSurvive />,
  },
  {
    t: "Watch it in Kodi, even before it ends.",
    p: "Recordings appear under the Vesper add-on in Kodi, with folders and Continue watching. Where you stopped is saved on the server, so any Kodi picks up from the same place. A recording in progress opens from the start.",
    s: <SceneWatch />,
  },
];

export default function Flow() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 861px) and (prefers-reduced-motion: no-preference)", () => {
        const el = root.current;
        if (!el) return;
        el.classList.add("pin-mode");
        const steps = gsap.utils.toArray<HTMLElement>(".fstep", el);
        const dots = gsap.utils.toArray<HTMLElement>(".fdot", el);
        const bar = el.querySelector<HTMLElement>(".fbar i");
        const tc = el.querySelector<HTMLElement>(".tc");
        const segs = gsap.utils.toArray<HTMLElement>(".seg", el);
        const state = { t: 0 };

        gsap.set(steps, { autoAlpha: 0, y: 40 });
        gsap.set(steps[0]!, { autoAlpha: 1, y: 0 });
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: el.querySelector(".flow-pin"),
            start: "top top",
            end: "+=320%",
            scrub: 0.7,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        // Step 1: the menu row lights up.
        tl.fromTo(
          ".mini-menu .sel",
          { x: -12, opacity: 0.4 },
          { x: 0, opacity: 1, duration: 0.6, ease: "power2.out" },
          0.1,
        );
        tl.fromTo(
          ".mini-guide .pick",
          { scaleY: 0.4 },
          { scaleY: 1, duration: 0.6, ease: "power2.out" },
          0.2,
        );
        for (let i = 1; i < steps.length; i++) {
          const at = i;
          tl.to(
            steps[i - 1]!,
            { autoAlpha: 0, y: -40, duration: 0.35, ease: "power2.in" },
            at - 0.1,
          );
          tl.fromTo(
            steps[i]!,
            { autoAlpha: 0, y: 40 },
            { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
            at + 0.15,
          );
        }
        // Step 2: segments pile up and the timecode runs.
        tl.fromTo(
          segs,
          { scaleY: 0, opacity: 0.2 },
          { scaleY: 1, opacity: 1, stagger: 0.04, duration: 0.2, ease: "power2.out" },
          1.2,
        );
        tl.fromTo(
          state,
          { t: 0 },
          {
            t: 5400,
            duration: 0.9,
            onUpdate: () => {
              if (!tc) return;
              const s = Math.floor(state.t);
              tc.textContent = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
            },
          },
          1.2,
        );
        // Step 3: the gap closes into one bar.
        tl.fromTo(
          ".lane .gap",
          { scaleX: 0, opacity: 0 },
          { scaleX: 1, opacity: 1, duration: 0.3, transformOrigin: "left" },
          2.1,
        );
        tl.fromTo(
          ".lane .one",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.8, transformOrigin: "left" },
          2.3,
        );
        tl.fromTo(".scene-surv .note", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 2.9);
        // Step 4: the playhead resumes while the recording edge keeps moving.
        tl.fromTo(
          ".player-bar .played",
          { scaleX: 0.1 },
          { scaleX: 0.42, duration: 0.8, transformOrigin: "left" },
          3.15,
        );
        tl.fromTo(
          ".player-bar .edge",
          { scaleX: 0.5 },
          { scaleX: 0.78, duration: 0.8, transformOrigin: "left" },
          3.15,
        );
        // Progress rail and step dots follow the same scroll.
        if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 3.6 }, 0.2);
        dots.forEach((d, i) =>
          tl.fromTo(
            d,
            { opacity: 0.35, scale: 0.8 },
            { opacity: 1, scale: 1, duration: 0.2 },
            i + 0.1,
          ),
        );
        tl.to({}, { duration: 0.3 }); // hold the last step
        return () => {
          el.classList.remove("pin-mode");
        };
      });
      scheduleRefresh();
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <Section id="how" labelledBy="how-title" className="sheet-b flow">
      <div ref={root} className="flow-root">
        <div className="flow-pin">
          <div className="wrap flow-wrap">
            <div className="sec-head tight">
              <Title id="how-title">From one button to one file.</Title>
            </div>
            <div className="fsteps">
              {STEPS.map((s, i) => (
                <article className="fstep" key={s.t}>
                  <div className="fstep-text">
                    <p className="fnum mono">
                      {i + 1} / {STEPS.length}
                    </p>
                    <h3>{s.t}</h3>
                    <p>{s.p}</p>
                  </div>
                  <div className="fstep-art">{s.s}</div>
                </article>
              ))}
            </div>
            <div className="frail" aria-hidden="true">
              <div className="fbar">
                <i />
              </div>
              <div className="fdots">
                {STEPS.map((s) => (
                  <span className="fdot" key={s.t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
