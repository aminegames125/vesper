import { useMemo, useState } from "react";
import { ChannelCard, ChannelRow, cleanName } from "../components/cards";
import { IconButton, LayoutGridIcon, ListIcon } from "../components/icons";
import { Paged } from "../components/paged";
import { Notice, PageHeader, Segmented } from "../components/ui";
import { groupBy } from "../lib/m3u";
import { useStore } from "../lib/store";
import { NoSources } from "./no-sources";

type Layout = "grid" | "list";
type Sort = "default" | "az";

const read = <T extends string>(key: string, fallback: T): T => {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
};

/** Two columns: categories on the left, channels on the right. */
export function Live() {
  const channels = useStore((s) => s.channels);
  const favorites = useStore((s) => s.favorites);
  const group = useStore((s) => s.group);
  const setGroup = useStore((s) => s.setGroup);
  const query = useStore((s) => s.query)
    .trim()
    .toLowerCase();
  const [layout, setLayout] = useState<Layout>(() => read("vesper.live.layout", "grid"));
  const [sort, setSort] = useState<Sort>("default");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => groupBy(channels), [channels]);
  const shownGroups = groups.filter(([name]) =>
    name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const visible = useMemo(() => {
    let list = channels;
    if (group) list = list.filter((c) => c.group === group);
    if (onlyFavorites) list = list.filter((c) => favorites.includes(c.id));
    if (query) list = list.filter((c) => c.name.toLowerCase().includes(query));
    if (sort === "az")
      list = [...list].sort((a, b) => cleanName(a.name).localeCompare(cleanName(b.name)));
    return list;
  }, [channels, group, onlyFavorites, favorites, query, sort]);

  if (channels.length === 0) return <NoSources />;

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem("vesper.live.layout", next);
    } catch {
      /* the choice just will not be remembered */
    }
  };

  return (
    <div className="flex gap-8">
      <aside className="sticky top-0 hidden h-[calc(100vh-9rem)] w-56 flex-none flex-col lg:flex">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter categories"
          aria-label="Filter categories"
          className="mb-2 rounded-full border border-line bg-panel px-4 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
          <li>
            <CategoryRow
              label="All channels"
              count={channels.length}
              active={group === ""}
              onClick={() => setGroup("")}
            />
          </li>
          {shownGroups.map(([name, list]) => (
            <li key={name}>
              <CategoryRow
                label={name}
                count={list.length}
                active={group === name}
                onClick={() => setGroup(name)}
              />
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1">
        <PageHeader
          title={group || "Live TV"}
          count={visible.length}
          actions={
            <>
              <select
                aria-label="Category"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="rounded-full border border-line bg-panel px-3 py-2 text-sm lg:hidden"
              >
                <option value="">All channels</option>
                {groups.map(([name]) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <Segmented
                label="Favourites"
                value={onlyFavorites ? "fav" : "all"}
                onChange={(v) => setOnlyFavorites(v === "fav")}
                options={[
                  { value: "all", label: "All" },
                  { value: "fav", label: "Favourites" },
                ]}
              />
              <Segmented
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "default", label: "Provider order" },
                  { value: "az", label: "A–Z" },
                ]}
              />
              <IconButton
                icon={LayoutGridIcon}
                label="Grid view"
                active={layout === "grid"}
                onClick={() => chooseLayout("grid")}
              />
              <IconButton
                icon={ListIcon}
                label="List view"
                active={layout === "list"}
                onClick={() => chooseLayout("list")}
              />
            </>
          }
        />
        {visible.length === 0 ? (
          <Notice title="No channels here">Try another category, or clear the search.</Notice>
        ) : layout === "grid" ? (
          <Paged
            items={visible}
            minWidth="15rem"
            render={(c) => <ChannelCard channel={c} list={visible} />}
          />
        ) : (
          <Paged
            items={visible}
            list
            pageSize={80}
            render={(c) => <ChannelRow channel={c} list={visible} />}
          />
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className="fade flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-raised hover:text-paper aria-[current=true]:bg-tint aria-[current=true]:font-semibold aria-[current=true]:text-accent"
    >
      <span className="truncate">{label}</span>
      <span className="text-xs">{count}</span>
    </button>
  );
}
