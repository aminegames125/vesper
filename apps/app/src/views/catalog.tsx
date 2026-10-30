import { useMemo, useState } from "react";
import { PosterCard } from "../components/cards";
import { Paged } from "../components/paged";
import { Chip, Notice, PageHeader, Segmented } from "../components/ui";
import { groupBy } from "../lib/m3u";
import { useStore } from "../lib/store";
import type { Movie, Show } from "../lib/types";
import { NoSources } from "./no-sources";

type Sort = "popular" | "new" | "az";

/** Movies and series share one poster-grid page. */
export function Catalog({ kind }: { kind: "movie" | "show" }) {
  const items: (Movie | Show)[] = useStore((s) => (kind === "movie" ? s.movies : s.shows));
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [sort, setSort] = useState<Sort>("popular");

  const groups = useMemo(() => groupBy(items), [items]);
  const visible = useMemo(() => {
    let list = items;
    if (group) list = list.filter((i) => i.group === group);
    if (query) list = list.filter((i) => i.name.toLowerCase().includes(query));
    const sorted = [...list];
    if (sort === "popular") sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => ((b as Movie).addedAt ?? 0) - ((a as Movie).addedAt ?? 0));
    return sorted;
  }, [items, group, query, sort]);

  const label = kind === "movie" ? "Movies" : "Series";
  if (items.length === 0) return <NoSources what={label.toLowerCase()} />;

  return (
    <div>
      <PageHeader
        title={group || label}
        count={visible.length}
        actions={
          <Segmented
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "popular", label: "Popular" },
              ...(kind === "movie" ? [{ value: "new" as const, label: "New" }] : []),
              { value: "az", label: "A–Z" },
            ]}
          />
        }
      >
        <Chip active={!group} onClick={() => setGroup("")}>
          All
        </Chip>
        {groups.slice(0, 24).map(([name]) => (
          <Chip
            key={name}
            active={group === name}
            onClick={() => setGroup(group === name ? "" : name)}
          >
            {name}
          </Chip>
        ))}
      </PageHeader>

      {visible.length === 0 ? (
        <Notice title="Nothing here">Try another category or clear the search.</Notice>
      ) : (
        <Paged
          items={visible}
          minWidth="11rem"
          render={(item) => (
            <PosterCard
              kind={kind}
              item={item}
              rank={
                sort === "popular" && visible.indexOf(item) < 9
                  ? visible.indexOf(item) + 1
                  : undefined
              }
            />
          )}
        />
      )}
    </div>
  );
}
