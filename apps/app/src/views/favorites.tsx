import { useMemo, useState } from "react";
import { ChannelCard, PosterCard } from "../components/cards";
import { Paged } from "../components/paged";
import { Notice, PageHeader, Segmented } from "../components/ui";
import { useStore } from "../lib/store";

type Tab = "channels" | "movies" | "series";

export function Favorites() {
  const favorites = useStore((s) => s.favorites);
  const channels = useStore((s) => s.channels);
  const movies = useStore((s) => s.movies);
  const shows = useStore((s) => s.shows);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [tab, setTab] = useState<Tab>("channels");

  const lists = useMemo(() => {
    const match = (name: string) => !query || name.toLowerCase().includes(query);
    return {
      channels: channels.filter((c) => favorites.includes(c.id) && match(c.name)),
      movies: movies.filter((m) => favorites.includes(m.id) && match(m.name)),
      series: shows.filter((s) => favorites.includes(s.id) && match(s.name)),
    };
  }, [favorites, channels, movies, shows, query]);

  return (
    <div>
      <PageHeader
        title="Favourites"
        actions={
          <Segmented
            label="Type"
            value={tab}
            onChange={setTab}
            options={[
              { value: "channels", label: `Channels · ${lists.channels.length}` },
              { value: "movies", label: `Movies · ${lists.movies.length}` },
              { value: "series", label: `Series · ${lists.series.length}` },
            ]}
          />
        }
      />
      {lists[tab].length === 0 ? (
        <Notice title="Nothing here yet">
          Tap the heart on any channel, movie or series to keep it here.
        </Notice>
      ) : tab === "channels" ? (
        <Paged
          items={lists.channels}
          minWidth="15rem"
          render={(c) => <ChannelCard channel={c} list={lists.channels} />}
        />
      ) : tab === "movies" ? (
        <Paged
          items={lists.movies}
          minWidth="11rem"
          render={(m) => <PosterCard kind="movie" item={m} />}
        />
      ) : (
        <Paged
          items={lists.series}
          minWidth="11rem"
          render={(s) => <PosterCard kind="show" item={s} />}
        />
      )}
    </div>
  );
}
