import { PlusIcon, TvIcon } from "../components/icons";
import { LogoMark } from "../components/logo";
import { Button, Notice, Spinner } from "../components/ui";
import { useStore } from "../lib/store";

export const DEMO_URL = "https://iptv-org.github.io/iptv/countries/us.m3u";

export function addDemoSource() {
  const { addProvider, notify } = useStore.getState();
  void addProvider({
    id: crypto.randomUUID(),
    name: "Free public channels",
    kind: "m3u",
    url: DEMO_URL,
    addedAt: Date.now(),
  }).then(() => notify("Loaded free public channels"));
}

/** Shown on any page that needs a library before one exists. */
export function NoSources({ what = "channels" }: { what?: string }) {
  const status = useStore((s) => s.status);
  const errors = useStore((s) => s.errors);
  const providers = useStore((s) => s.providers.length);
  const setView = useStore((s) => s.setView);

  if (status === "loading") return <Spinner label="Loading your library" />;

  if (providers === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
        <LogoMark size={72} />
        <h1 className="mt-6 text-4xl font-bold">Welcome to Vesper</h1>
        <p className="mt-3 text-muted">
          A fast, light player for the TV you already have the right to watch. Add an Xtream login
          or an M3U link to begin.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="primary" icon={PlusIcon} onClick={() => setView("sources")}>
            Add a source
          </Button>
          <Button icon={TvIcon} onClick={addDemoSource}>
            Try free public channels
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Notice
      title={`No ${what} found`}
      action={
        <Button variant="primary" onClick={() => setView("sources")}>
          Manage sources
        </Button>
      }
    >
      {errors[0] ?? "Your sources loaded, but nothing matched here."}
    </Notice>
  );
}
