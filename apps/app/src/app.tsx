import { lazy, Suspense, useEffect } from "react";
import { Tips, WhatsNew } from "./components/onboarding";
import { Nav, Toast, TopBar } from "./components/shell";
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => applyTheme(theme), [theme]);
  useRecordingEvents();
  useScheduler();
  useCloudSync();
  useSpatialNav(isTvMode());

  const View = VIEWS[view];

  return (
    <div className="flex h-full">
      <Nav />
      <div className="flex min-w-0 flex-1 flex-col">
        {!detail && <TopBar />}
        <main
          className={`min-h-0 flex-1 overflow-y-auto ${detail ? "" : "px-8 py-6 max-md:px-4 max-md:pb-24"}`}
        >
          {detail ? <Detail /> : <View />}
        </main>
      </div>
      <WhatsNew />
      <Tips />
      <Toast />
      {playing && (
        <Suspense fallback={null}>
          <Player key={playing.id} item={playing} />
        </Suspense>
      )}
    </div>
  );
}
