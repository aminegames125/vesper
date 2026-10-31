import { useState } from "react";
import { PlusIcon, RefreshCwIcon, TrashIcon } from "../components/icons";
import { addDemoSource, SourceForm } from "../components/source-form";
import { Button, Chip } from "../components/ui";
import { useStore } from "../lib/store";
import type { Provider } from "../lib/types";

const ADD = "add";

/**
 * Sources as a two-pane manager: the list on the left, the selected source (or the add form)
 * on the right. Nothing here looks like the rest of the app's pages on purpose; it is a tool.
 */
export function Sources() {
  const providers = useStore((s) => s.providers);
  const [selected, setSelected] = useState<string>(providers[0]?.id ?? ADD);
  const current = providers.find((p) => p.id === selected);
  const adding = selected === ADD || !current;

  return (
    <div className="grid min-h-[32rem] grid-cols-[18rem_minmax(0,1fr)] gap-8 max-md:grid-cols-1">
      <aside className="flex flex-col gap-1">
        <h1 className="mb-3 text-2xl font-bold">Sources</h1>
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-current={p.id === selected ? "true" : undefined}
            onClick={() => setSelected(p.id)}
            className="fade flex flex-col rounded-xl px-3.5 py-2.5 text-left hover:bg-raised aria-[current=true]:bg-tint"
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="text-xs text-muted">
              {p.kind === "xtream" ? "Xtream" : "Playlist"}
            </span>
          </button>
        ))}
        <button
          type="button"
          aria-current={adding ? "true" : undefined}
          onClick={() => setSelected(ADD)}
          className="fade mt-2 flex items-center gap-2 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-sm text-muted hover:text-paper aria-[current=true]:border-accent aria-[current=true]:text-accent"
        >
          <PlusIcon size={16} color="currentColor" /> Add a source
        </button>
      </aside>

      <section className="min-w-0 rounded-3xl bg-panel p-8">
        {adding ? (
          <AddPane onAdded={(p) => setSelected(p.id)} first={providers.length === 0} />
        ) : (
          <SourcePane key={current.id} provider={current} onRemoved={() => setSelected(ADD)} />
        )}
      </section>
    </div>
  );
}

function AddPane({ onAdded, first }: { onAdded: (p: Provider) => void; first: boolean }) {
  const [kind, setKind] = useState<Provider["kind"]>("xtream");
  return (
    <div className="max-w-md">
      <h2 className="text-3xl font-bold">{first ? "Add your first source" : "Add a source"}</h2>
      <div className="mb-6 mt-5 flex gap-2">
        <Chip active={kind === "xtream"} onClick={() => setKind("xtream")}>
          Xtream login
        </Chip>
        <Chip active={kind === "m3u"} onClick={() => setKind("m3u")}>
          Playlist link
        </Chip>
      </div>
      <SourceForm kind={kind} onAdded={onAdded} />
      <Button variant="ghost" className="mt-6" onClick={() => void addDemoSource()}>
        Or load free public channels
      </Button>
    </div>
  );
}

function SourcePane({ provider, onRemoved }: { provider: Provider; onRemoved: () => void }) {
  const status = useStore((s) => s.status);
  const refresh = useStore((s) => s.refresh);
  const removeProvider = useStore((s) => s.removeProvider);
  const allChannels = useStore((s) => s.channels);
  const allMovies = useStore((s) => s.movies);
  const allShows = useStore((s) => s.shows);
  const [confirm, setConfirm] = useState(false);
  const channels = allChannels.filter((c) => c.providerId === provider.id).length;
  const movies = allMovies.filter((m) => m.providerId === provider.id).length;
  const shows = allShows.filter((x) => x.providerId === provider.id).length;
  const account = provider.account;
  const expires = account?.expires ? new Date(account.expires * 1000).toLocaleDateString() : null;

  return (
    <div>
      <h2 className="text-3xl font-bold">{provider.name}</h2>
      <p className="mt-1 truncate text-sm text-muted">
        {provider.kind === "xtream" ? provider.xtream?.host : provider.url}
      </p>

      <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
        {[
          ["Channels", channels],
          ["Movies", movies],
          ["Series", shows],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-raised px-4 py-3">
            <dd className="text-2xl font-bold tabular-nums">{Number(value).toLocaleString()}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      {account && (
        <p className="mt-6 text-sm text-muted">
          <span className={account.active ? "text-paper" : "text-accent"}>
            {account.active ? "Active" : "Inactive"}
          </span>
          {account.trial && " · trial"}
          {expires && ` · expires ${expires}`} · {account.activeConnections}/
          {account.maxConnections} connections
        </p>
      )}

      <div className="mt-10 flex items-center gap-3">
        <Button icon={RefreshCwIcon} disabled={status === "loading"} onClick={() => void refresh()}>
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </Button>
        {confirm ? (
          <>
            <Button
              variant="danger"
              icon={TrashIcon}
              onClick={() => {
                removeProvider(provider.id);
                onRemoved();
              }}
            >
              Remove for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" icon={TrashIcon} onClick={() => setConfirm(true)}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
