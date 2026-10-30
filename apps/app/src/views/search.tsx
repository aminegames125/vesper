import { useMemo } from "react";
import { ChannelCard, PosterCard, Rail } from "../components/cards";
import { Notice, PageHeader } from "../components/ui";
import { useStore } from "../lib/store";

/** Searches channels, movies and series at once. The query lives in the top bar. */
export function SearchPage() {
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const channels = useStore((s) => s.channels);
  const movies = useStore((s) => s.movies);
  const shows = useStore((s) => s.shows);

  const found = useMemo(() => {
    if (!query) return null;
    const match = (name: string) => name.toLowerCase().includes(query);
    return {
      channels: channels.filter((c) => match(c.name)),
      movies: movies.filter((m) => match(m.name)),
      shows: shows.filter((s) => match(s.name)),
    };
  }, [query, channels, movies, shows]);

  if (!found) {
    return (
      <div>
        <PageHeader title="Search" />
        <Notice title="Find anything">
          Type in the search box above. Ctrl+K gets you there from anywhere.
        </Notice>
      </div>
    );
  }

  const total = found.channels.length + found.movies.length + found.shows.length;

  return (
    <div>
      <PageHeader title="Search" count={total} />
      {total === 0 && (
        <Notice title="No matches">Nothing in your library matches that search.</Notice>
      )}
      {found.channels.length > 0 && (
        <Rail title={`Channels · ${found.channels.length}`}>
          {found.channels.slice(0, 30).map((c) => (
            <div key={c.id} className="w-60 flex-none">
              <ChannelCard channel={c} list={found.channels} />
            </div>
          ))}
        </Rail>
      )}
      {found.movies.length > 0 && (
        <Rail title={`Movies · ${found.movies.length}`}>
          {found.movies.slice(0, 30).map((m) => (
            <div key={m.id} className="w-40 flex-none">
              <PosterCard kind="movie" item={m} />
            </div>
          ))}
        </Rail>
      )}
      {found.shows.length > 0 && (
        <Rail title={`Series · ${found.shows.length}`}>
          {found.shows.slice(0, 30).map((s) => (
            <div key={s.id} className="w-40 flex-none">
              <PosterCard kind="show" item={s} />
            </div>
          ))}
        </Rail>
      )}
    </div>
  );
}
