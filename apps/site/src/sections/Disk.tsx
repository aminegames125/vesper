import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Section, scheduleRefresh, Title } from "../ui";

const TOTAL = 40; // GB, a small illustrative disk
const GUARD = 0.5; // 512 MB, the server's free-space floor
const SIZE = [2.6, 3.1, 2.4, 3.4, 2.9, 3.6, 2.7];
const sizeOf = (d: number) => SIZE[d % SIZE.length] ?? 3;

const KEEP = [
  { k: "1", label: "1 day", days: 1 },
  { k: "3", label: "3 days", days: 3 },
  { k: "7", label: "A week", days: 7 },
  { k: "0", label: "Forever", days: Infinity },
] as const;
const NEWEST = [0, 1, 3, 5, 10] as const;

type Item = { d: number; gb: number; refused?: boolean };

function simulate(
  day: number,
  keepDays: number,
  newest: number,
): { kept: Item[]; refused: Item[] } {
  let list: Item[] = [];
  const refused: Item[] = [];
  for (let d = 1; d <= day; d++) {
    list = list.filter((i) => d - i.d < keepDays);
    const used = list.reduce((a, i) => a + i.gb, 0);
    const gb = sizeOf(d);
    if (TOTAL - used - gb < GUARD) {
      refused.push({ d, gb, refused: true });
      continue;
    }
    list = [...list, { d, gb }];
    if (newest > 0) list = list.slice(-newest);
  }
  return { kept: list, refused };
}

function Seg<T extends string | number>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <LayoutGroup id={name}>
      <div className="seg-ctl" role="radiogroup" aria-label={name}>
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            className={value === o.v ? "on" : ""}
            onClick={() => onChange(o.v)}
            data-cursor
          >
            {value === o.v && (
              <motion.i
                layoutId={`${name}-pill`}
                className="seg-pill"
                transition={{ type: "spring", stiffness: 460, damping: 36 }}
              />
            )}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

export default function Disk() {
  const [day, setDay] = useState(9);
  const [keep, setKeep] = useState<(typeof KEEP)[number]["k"]>("7");
  const [newest, setNewest] = useState<(typeof NEWEST)[number]>(0);
  useEffect(() => {
    scheduleRefresh();
  }, []);

  const keepDays = KEEP.find((k) => k.k === keep)?.days ?? 7;
  const { kept, refused } = useMemo(() => simulate(day, keepDays, newest), [day, keepDays, newest]);
  const used = kept.reduce((a, i) => a + i.gb, 0);
  const free = TOTAL - used;
  const tight = free < 6;

  return (
    <Section id="disk" labelledBy="disk-title" className="sheet-b">
      <div className="wrap disk">
        <div className="sec-head">
          <Title id="disk-title">It tidies up so the disk does not fill.</Title>
          <p className="lede">
            Every recording gets a deletion timer: <strong>a week</strong> by default, changeable
            per recording, or forever. A schedule can also keep only its newest 1, 3, 5 or 10. Try
            it on a pretend 40 GB disk with one recording a day.
          </p>
        </div>

        <div className="disk-grid">
          <div className="disk-ctl">
            <label className="field">
              <span>
                Day <b className="mono">{day}</b>
              </span>
              <input
                type="range"
                min={1}
                max={21}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                aria-label="Days passed"
              />
            </label>
            <div className="field">
              <span>Delete after</span>
              <Seg
                name="Delete after"
                value={keep}
                onChange={setKeep}
                options={KEEP.map((k) => ({ v: k.k, label: k.label }))}
              />
            </div>
            <div className="field">
              <span>Keep only the newest</span>
              <Seg
                name="Keep only the newest"
                value={newest}
                onChange={setNewest}
                options={NEWEST.map((n) => ({ v: n, label: n === 0 ? "All" : String(n) }))}
              />
            </div>
            <p className="fine">
              An illustration with made-up sizes. The real server reports free disk and how many
              days are left at the recent pace.
            </p>
          </div>

          <div className="disk-viz">
            <div
              className="disk-meter"
              role="img"
              aria-label={`${used.toFixed(1)} GB used of ${TOTAL} GB, ${kept.length} recordings kept`}
            >
              <div className="disk-bar">
                <AnimatePresence initial={false} mode="popLayout">
                  {kept.map((i) => (
                    <motion.div
                      key={i.d}
                      layout
                      className="disk-blk"
                      style={{ width: `${(i.gb / TOTAL) * 100}%` }}
                      initial={{ opacity: 0, scaleY: 0.4 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={{ opacity: 0, scaleY: 0.2, y: -14 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <span className="mono">{i.d}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div
                  className="disk-guard"
                  style={{ width: `${(GUARD / TOTAL) * 100}%` }}
                  title="512 MB kept free"
                />
              </div>
              <div className="disk-read">
                <span>
                  <b className="mono">{used.toFixed(1)} GB</b> used
                </span>
                <span>
                  <b className="mono">{free.toFixed(1)} GB</b> free
                </span>
              </div>
            </div>

            <motion.ul className="disk-list" layout>
              <AnimatePresence initial={false} mode="popLayout">
                {[...kept]
                  .reverse()
                  .slice(0, 5)
                  .map((i) => (
                    <motion.li
                      key={i.d}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 24 }}
                    >
                      <span>Recording from day {i.d}</span>
                      <span className="mono">
                        {Number.isFinite(keepDays)
                          ? `deletes in ${Math.max(0, keepDays - (day - i.d))} d`
                          : "kept forever"}
                      </span>
                    </motion.li>
                  ))}
              </AnimatePresence>
            </motion.ul>

            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={refused.length > 0 ? "bad" : tight ? "warn" : "ok"}
                className={`disk-note ${refused.length > 0 ? "bad" : tight ? "warn" : "ok"}`}
                role="status"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {refused.length > 0
                  ? `Disk nearly full: ${refused.length} recording${refused.length > 1 ? "s were" : " was"} refused with a clear reason instead of leaving an empty file.`
                  : tight
                    ? "Getting tight. A recording is refused below 512 MB free."
                    : "Plenty of room."}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Section>
  );
}
