import { AnimatePresence, motion } from "framer-motion";

/**
 * A picture of Kodi made in HTML, so it stays sharp at any size. Everything inside is sample
 * data: the channels and programmes are made up. Sizes are in cqw so the whole screen scales
 * as one piece.
 */

const CHANNELS = [
  {
    name: "News One",
    shows: [
      { t: "Morning Desk", from: 0, to: 30 },
      { t: "Evening News", from: 30, to: 62, pick: true },
      { t: "Weather and Sport", from: 62, to: 100 },
    ],
  },
  {
    name: "Film Four",
    shows: [
      { t: "The Long Harbour", from: 0, to: 48 },
      { t: "Night Train", from: 48, to: 100 },
    ],
  },
  {
    name: "Nature HD",
    shows: [
      { t: "Reef Life", from: 0, to: 22 },
      { t: "Dry Country", from: 22, to: 70 },
      { t: "Reef Life", from: 70, to: 100 },
    ],
  },
  {
    name: "Sport 2",
    shows: [
      { t: "Match of the Night", from: 0, to: 85 },
      { t: "Replay", from: 85, to: 100 },
    ],
  },
] as const;

function Guide({ dim }: { dim?: boolean }) {
  return (
    <div className={`k-guide${dim ? " is-dim" : ""}`}>
      <div className="k-times">
        <span>19:30</span>
        <span>20:00</span>
        <span>20:30</span>
        <span>21:00</span>
      </div>
      {CHANNELS.map((c) => (
        <div className="k-row" key={c.name}>
          <b className="k-chan">{c.name}</b>
          <div className="k-track">
            {c.shows.map((s) => (
              <span
                key={s.t + s.from}
                className={`k-show${"pick" in s && s.pick ? " is-focus" : ""}`}
                style={{ left: `${s.from}%`, width: `${s.to - s.from}%` }}
              >
                {s.t}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, items, focus }: { title: string; items: string[]; focus: number }) {
  return (
    <div className="k-panel">
      <p className="k-panel-title">{title}</p>
      {items.map((it, i) => (
        <p key={it} className={`k-item${i === focus ? " is-focus" : ""}`}>
          {it}
        </p>
      ))}
    </div>
  );
}

const SCREENS = [
  // The extra line in Kodi's own context menu.
  <div className="k-screen" key="menu">
    <Guide dim />
    <Panel
      title="Evening News"
      items={["Play channel", "Information", "Add to favourites", "Record with Vesper"]}
      focus={3}
    />
  </div>,
  // What Vesper asks.
  <div className="k-screen" key="choose">
    <Guide dim />
    <Panel
      title="Record with Vesper"
      items={[
        "Record this programme",
        "Record every week at this time",
        "Record every day at this time",
        "Record every episode",
      ]}
      focus={0}
    />
    <p className="k-toast">Evening News, 20:00 on News One, is on the list.</p>
  </div>,
  // What the server is doing.
  <div className="k-screen" key="server">
    <p className="k-head">Vesper</p>
    <div className="k-list">
      <p className="k-line is-rec">
        <span className="k-rec">REC</span>
        <b>Evening News</b>
        <i>News One · 00:12:48</i>
      </p>
      <p className="k-line">
        <b>Night Train</b>
        <i>Film Four · starts at 21:00</i>
      </p>
      <p className="k-line">
        <b>Reef Life, every episode</b>
        <i>Nature HD · next Thursday</i>
      </p>
    </div>
    <p className="k-foot">212 GB free, about 31 days of room</p>
  </div>,
  // Watching it.
  <div className="k-screen" key="watch">
    <p className="k-head">Recordings</p>
    <div className="k-list">
      <p className="k-line is-rec">
        <span className="k-rec">REC</span>
        <b>Evening News</b>
        <i>Still recording. Play from the start.</i>
      </p>
      <p className="k-line">
        <b>Match of the Night</b>
        <i>Resume at 41:10</i>
        <span className="k-bar">
          <span style={{ width: "38%" }} />
        </span>
      </p>
      <p className="k-line">
        <b>Dry Country</b>
        <i>Watched · deletes in 5 days</i>
      </p>
    </div>
  </div>,
];

export function KodiScreen({ step }: { step: number }) {
  return (
    <div className="kodi" data-ui>
      <div className="k-top">
        <span>Live TV</span>
        <span>19:42</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="k-stage"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {SCREENS[step]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const GUIDE_BARS = [
  { t: "Evening News", logo: [0, 100], guide: [0, 58] },
  { t: "Night Train", logo: [12.5, 75], guide: [22, 78] },
  { t: "Match of the Night", logo: [25, 50], guide: [0, 84] },
  { t: "Dry Country", logo: [37.5, 25], guide: [40, 60] },
] as const;

export const LOGO_GUIDE = GUIDE_BARS;

/**
 * The Vesper mark, four bars that get shorter, scaled up into a frame. A script turns the bars into
 * the programme bars of a guide and back again, and the first one starts recording.
 */
export function LogoGuide() {
  return (
    <div className="lg" data-ui aria-hidden="true">
      <div className="lg-in">
        {GUIDE_BARS.map((b, i) => (
          <span
            className={`lg-bar lg-${i}`}
            key={b.t}
            style={{ top: `${i * 27}%`, left: `${b.logo[0]}%`, width: `${b.logo[1]}%` }}
          >
            <em>{b.t}</em>
            {i === 0 && <strong className="lg-rec">REC</strong>}
          </span>
        ))}
        <span className="lg-head" />
      </div>
    </div>
  );
}
