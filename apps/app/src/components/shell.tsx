import { useEffect, useRef, useState } from "react";
import { useStore, type View } from "../lib/store";
import {
  type AnimIcon,
  CalendarDaysIcon,
  CircleDotIcon,
  ClapperboardIcon,
  FilmIcon,
  HeartIcon,
  HistoryIcon,
  HouseIcon,
  IconButton,
  LayoutGridIcon,
  ServerIcon,
  SettingsIcon,
  TvIcon,
  useIconHover,
} from "./icons";
import { LogoMark } from "./logo";
import { SearchBox } from "./ui";

const TABS: { view: View; label: string; icon: AnimIcon }[] = [
  { view: "home", label: "Home", icon: HouseIcon },
  { view: "live", label: "Live TV", icon: TvIcon },
  { view: "movies", label: "Movies", icon: FilmIcon },
  { view: "series", label: "Series", icon: ClapperboardIcon },
];

/** Everything else, one click behind "More". */
const LIBRARY: { view: View; label: string; icon: AnimIcon }[] = [
  { view: "guide", label: "Guide", icon: CalendarDaysIcon },
  { view: "favorites", label: "Favourites", icon: HeartIcon },
  { view: "recordings", label: "Recordings", icon: CircleDotIcon },
  { view: "catchup", label: "Catch-up", icon: HistoryIcon },
  { view: "sources", label: "Sources", icon: ServerIcon },
];

/** Reads a media query and follows it as the window is resized. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}

function Tab({ view, label }: { view: View; label: string }) {
  const current = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      aria-current={current === view ? "page" : undefined}
      className="fade rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:text-paper aria-[current=page]:bg-paper aria-[current=page]:text-ink"
    >
      {label}
    </button>
  );
}

function MoreMenu({ up = false }: { up?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = LIBRARY.some((l) => l.view === view);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        setOpen(false);
        trigger.current?.focus();
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(!open)}
        className={
          up
            ? "fade flex min-w-[4.25rem] flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium text-muted aria-[current=page]:text-accent"
            : "fade rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:text-paper aria-[current=page]:bg-paper aria-[current=page]:text-ink"
        }
      >
        {up ? (
          <>
            <LayoutGridIcon size={22} color="currentColor" />
            More
          </>
        ) : (
          "More"
        )}
      </button>
      {open && (
        <ul
          className={`glass absolute z-40 w-52 rounded-2xl border border-line p-1.5 shadow-xl ${
            up ? "bottom-full right-0 mb-2" : "left-1/2 top-full mt-2 -translate-x-1/2"
          }`}
        >
          {LIBRARY.map(({ view: v, label, icon: Icon }) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => {
                  setView(v);
                  setOpen(false);
                }}
                className="fade flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-raised"
              >
                <Icon size={18} color="currentColor" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BottomItem({ view, label, icon: Icon }: { view: View; label: string; icon: AnimIcon }) {
  const current = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const { ref, handlers } = useIconHover();
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      aria-current={current === view ? "page" : undefined}
      {...handlers}
      className="fade flex min-w-[4.25rem] flex-none flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium text-muted aria-[current=page]:text-accent"
    >
      <Icon ref={ref} size={22} color="currentColor" />
      {label}
    </button>
  );
}

/**
 * The top bar: the mark on the left, four places and "More" in the middle, search and settings on the right.
 * On a phone-width window it becomes a bottom bar instead.
 */
export function Nav({ solid }: { solid: boolean }) {
  const setView = useStore((s) => s.setView);
  const query = useStore((s) => s.query);
  const view = useStore((s) => s.view);
  const status = useStore((s) => s.status);
  const inputWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputWrap.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSearch = (value: string) => {
    const { setView: go, setQuery } = useStore.getState();
    // Pages with their own list filter in place; everywhere else the query opens search.
    if (value && !["live", "movies", "series", "catchup", "search", "favorites"].includes(view)) {
      go("search");
    }
    setQuery(value);
  };

  return (
    <>
      <header
        className={`absolute inset-x-4 top-3 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full border px-4 py-1.5 backdrop-blur-xl transition-[background-color,border-color] duration-300 max-md:inset-x-3 max-md:grid-cols-[auto_1fr] max-md:px-3 ${
          solid ? "border-line bg-ink/85" : "scope-dark border-white/10 bg-black/45"
        }`}
      >
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label="Vesper home"
          className="fade flex items-center gap-2.5 justify-self-start rounded-xl p-1"
        >
          <LogoMark size={28} />
          <span className="font-display text-lg font-bold max-lg:hidden">Vesper</span>
        </button>

        <nav aria-label="Main" className="flex items-center gap-1 max-md:hidden">
          {TABS.map((t) => (
            <Tab key={t.view} view={t.view} label={t.label} />
          ))}
          <MoreMenu />
        </nav>

        <div className="flex items-center justify-end gap-1.5">
          <div ref={inputWrap} className="w-full max-w-64">
            <SearchBox value={query} onChange={onSearch} placeholder="Search  (Ctrl+K)" />
          </div>
          {status === "loading" && <span className="text-xs text-muted">Loading…</span>}
          <IconButton icon={SettingsIcon} label="Settings" onClick={() => setView("settings")} />
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-3 z-30 hidden justify-around gap-1 rounded-3xl border border-line bg-panel/95 px-1 py-1 backdrop-blur-xl max-md:flex"
      >
        {TABS.map((t) => (
          <BottomItem key={t.view} {...t} />
        ))}
        <MoreMenu up />
      </nav>
    </>
  );
}

/** Short message at the bottom of the window, used for recording and favourite feedback. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="glass pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line px-5 py-2.5 text-sm shadow-xl"
    >
      {toast}
    </div>
  );
}
