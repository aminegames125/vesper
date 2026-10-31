import { lazy, Suspense, useEffect, useState } from "react";
import { WhatsNew } from "./components/onboarding";
import { Nav, Toast } from "./components/shell";
import { TvHome, TvShell } from "./components/tv";
import { Welcome } from "./components/welcome";
import { isTvMode, useCloudSync } from "./lib/cloud";
import { useRecordingEvents, useScheduler } from "./lib/recorder";
import { useSpatialNav } from "./lib/spatial-nav";
import { useStore } from "./lib/store";
import { applyTheme } from "./lib/themes";
import { Catalog } from "./views/catalog";
import { Catchup } from "./views/catchup";
import { Detail } from "./views/detail";
import { Favorites } from "./views/favorites";
import { Guide } from "./views/guide";
import { Home } from "./views/home";
import { Live } from "./views/live";
import { Recordings } from "./views/recordings";
import { SearchPage } from "./views/search";
import { Settings } from "./views/settings";
import { Sources } from "./views/sources";

// hls.js is only needed once something plays.
const Player = lazy(() => import("./components/player"));

const VIEWS = {
  home: Home,
  live: Live,
  guide: Guide,
  movies: () => <Catalog kind="movie" />,
  series: () => <Catalog kind="show" />,
  catchup: Catchup,
  favorites: Favorites,
  recordings: Recordings,
  search: SearchPage,
  sources: Sources,
  settings: Settings,
} as const;

export function App() {
  const view = useStore((s) => s.view);
  const detail = useStore((s) => s.detail);
  const playing = useStore((s) => s.playing);
  const theme = useStore((s) => s.theme);
  const refresh = useStore((s) => s.refresh);
  const firstRun = useStore((s) => !s.onboarded && s.providers.length === 0);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => applyTheme(theme), [theme]);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setScrolled(false), [view, detail]);
  useRecordingEvents();
  useScheduler();
  useCloudSync();
  const tv = isTvMode();
  useSpatialNav(tv);

  const View = tv && view === "home" ? TvHome : VIEWS[view];

  const overlays = (
    <>
      <WhatsNew />
      <Toast />
      {firstRun && !tv && <Welcome />}
      {playing && (
        <Suspense fallback={null}>
          <Player key={playing.id} item={playing} />
        </Suspense>
      )}
    </>
  );

  if (tv) {
    return (
      <>
        <TvShell>{detail ? <Detail /> : <View />}</TvShell>
        {overlays}
      </>
    );
  }

  return (
    <div className="relative h-full">
      <Nav solid={scrolled || (view !== "home" && !detail)} />
      <main
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 24)}
        className={`h-full overflow-y-auto ${
          detail || view === "home" ? "" : "px-8 pb-6 pt-20 max-md:px-4 max-md:pb-24"
        }`}
      >
        {detail ? <Detail /> : <View />}
      </main>
      {overlays}
    </div>
  );
}
