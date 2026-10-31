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
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RefreshCwIcon,
  ServerIcon,
  SettingsIcon,
  SunIcon,
  TvIcon,
  useIconHover,
} from "./icons";
import { LogoMark } from "./logo";
import { SearchBox } from "./ui";

const MAIN: { view: View; label: string; icon: AnimIcon }[] = [
  { view: "home", label: "Home", icon: HouseIcon },
  { view: "live", label: "Live TV", icon: TvIcon },
  { view: "guide", label: "Guide", icon: CalendarDaysIcon },
  { view: "movies", label: "Movies", icon: FilmIcon },
  { view: "series", label: "Series", icon: ClapperboardIcon },
  { view: "catchup", label: "Catch-up", icon: HistoryIcon },
  { view: "favorites", label: "Favourites", icon: HeartIcon },
  { view: "recordings", label: "Recordings", icon: CircleDotIcon },
];

const FOOT: { view: View; label: string; icon: AnimIcon }[] = [
  { view: "sources", label: "Sources", icon: ServerIcon },
  { view: "settings", label: "Settings", icon: SettingsIcon },
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

const COLLAPSE_KEY = "vesper.nav.collapsed";

function NavItem({
  view,
  label,
  icon: Icon,
  wide,
}: {
  view: View;
  label: string;
  icon: AnimIcon;
  wide: boolean;
}) {
  const current = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const { ref, handlers } = useIconHover();
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      aria-current={current === view ? "page" : undefined}
      title={wide ? undefined : label}
      {...handlers}
      className={`fade relative flex w-full items-center rounded-xl font-medium text-muted hover:bg-raised hover:text-paper aria-[current=page]:bg-tint aria-[current=page]:text-accent max-md:min-w-[4.25rem] max-md:flex-none max-md:flex-col max-md:gap-1 max-md:py-1.5 max-md:text-[11px] ${
        wide
          ? "flex-row gap-3.5 px-3.5 py-2.5 text-sm md:justify-start"
          : "flex-col gap-1 py-2.5 text-[11px]"
      }`}
    >
      <Icon ref={ref} size={22} color="currentColor" />
      {label}
    </button>
  );
}

/**
 * The app's main places. It follows the window: a bottom bar on phones, an icon rail on small
 * windows, and a labelled sidebar on wide ones that can be folded back into the rail.
 */
export function Nav() {
  const setView = useStore((s) => s.setView);
  const roomy = useMedia("(min-width: 1280px)");
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const wide = roomy && !collapsed;
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <nav
      aria-label="Main"
      className={`flex flex-none flex-col gap-1 border-r border-line bg-panel px-2 py-3 transition-[width] duration-200 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-t max-md:px-1 max-md:py-1 ${
        wide ? "w-56" : "w-[5.25rem]"
      }`}
    >
      <div
        className={`mb-3 flex items-center max-md:hidden ${wide ? "justify-between pl-1.5" : "flex-col gap-2"}`}
      >
        <button
          type="button"
          onClick={() => setView("home")}
          aria-label="Vesper home"
          className="fade flex items-center gap-3 rounded-xl p-2 hover:bg-raised"
        >
          <LogoMark size={30} />
          {wide && <span className="font-display text-lg font-bold">Vesper</span>}
        </button>
        {roomy && (
          <IconButton
            icon={wide ? PanelLeftCloseIcon : PanelLeftOpenIcon}
            label={wide ? "Fold the sidebar" : "Unfold the sidebar"}
            onClick={toggle}
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden">
        {MAIN.map((item) => (
          <NavItem key={item.view} {...item} wide={wide} />
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-2 max-md:flex-row max-md:border-0 max-md:pt-0">
        {FOOT.map((item) => (
          <NavItem key={item.view} {...item} wide={wide} />
        ))}
      </div>
    </nav>
  );
}

/** Search, refresh and theme, always within reach. Ctrl+K jumps to search from anywhere. */
export function TopBar() {
  const query = useStore((s) => s.query);
  const view = useStore((s) => s.view);
  const status = useStore((s) => s.status);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const refresh = useStore((s) => s.refresh);
  const hasSources = useStore((s) => s.providers.length > 0);
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
    const { setView, setQuery } = useStore.getState();
    // Pages with their own list filter in place; everywhere else the query opens search.
    if (value && !["live", "movies", "series", "catchup", "search", "favorites"].includes(view)) {
      setView("search");
    }
    setQuery(value);
  };

  const dark =
    theme === "dark" ||
    (theme === "system" && !window.matchMedia("(prefers-color-scheme: light)").matches);

  return (
    <div className="flex items-center gap-3 border-b border-line px-8 py-3 max-md:px-4">
      <div ref={inputWrap} className="flex-1">
        <SearchBox
          value={query}
          onChange={onSearch}
          placeholder="Search channels, movies, series  (Ctrl+K)"
        />
      </div>
      {status === "loading" && <span className="text-xs text-muted">Loading library…</span>}
      <IconButton
        icon={RefreshCwIcon}
        label="Refresh sources"
        disabled={!hasSources || status === "loading"}
        onClick={() => void refresh()}
      />
      <IconButton
        icon={dark ? SunIcon : MoonIcon}
        label={dark ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => setTheme(dark ? "light" : "dark")}
      />
    </div>
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
