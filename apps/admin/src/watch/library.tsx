import type { CloudClient } from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { Empty, Notice, PageHeader, Segmented, Skeleton } from "../ui";
import { MediaCard, resumable, useMediaToken } from "./media";

type Filter = "all" | "recordings" | "downloads" | "unwatched";

export function Library({ client, onPlay }: { client: CloudClient; onPlay: (id: string) => void }) {
  const { data, error } = useLoad(() => client.listRecordings(), 8000);
  const media = useMediaToken(client);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.recordings ?? []).filter((r) => {
      if (r.status === "failed") return false;
      if (filter === "recordings" && r.kind !== "recording") return false;
      if (filter === "downloads" && r.kind !== "download") return false;
      if (filter === "unwatched" && (r.watched || r.status !== "done")) return false;
      if (folder && r.tag !== folder) return false;
      return !q || `${r.title} ${r.channelName}`.toLowerCase().includes(q);
    });
  }, [data, filter, query, folder]);

  return (
    <div>
      <PageHeader title="Library" lead="Everything the server holds for you, ready to play." />
      <Notice>{error}</Notice>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1 basis-64">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and channels"
            aria-label="Search the library"
            className="min-h-[var(--field-h)] w-full rounded-lg border border-line bg-sunken py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="max-w-full overflow-x-auto">
          <Segmented<Filter>
            id="library-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "recordings", label: "From Kodi" },
              { value: "downloads", label: "Downloaded" },
              { value: "unwatched", label: "Unwatched" },
            ]}
          />
        </div>
      </div>

      {data && data.tags.length > 0 && (
        <div className="rail-scroll mb-6 flex gap-2 overflow-x-auto">
          {["", ...data.tags].map((tag) => (
            <button
              key={tag || "all"}
              type="button"
              onClick={() => setFolder(tag)}
              className={`flex-none rounded-lg px-3.5 py-1.5 text-sm transition-colors ${folder === tag ? "bg-paper text-ink" : "bg-raised text-muted hover:text-paper"}`}
            >
              {tag || "All folders"}
            </button>
          ))}
        </div>
      )}

      {!data && (
        <div className="grid gap-5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => `s${i}`).map((k) => (
            <Skeleton key={k} className="aspect-video" />
          ))}
        </div>
      )}
      {data && shown.length === 0 && (
        <Empty>
          {query || folder || filter !== "all"
            ? "Nothing matches that. Try a different filter."
            : "Your library is empty. Items from Kodi and downloads appear here."}
        </Empty>
      )}
      <motion.div
        layout
        className="grid grid-cols-2 gap-x-4 gap-y-7 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        <AnimatePresence mode="popLayout">
          {shown.map((r) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.28 }}
            >
              <MediaCard rec={r} media={media} client={client} onPlay={onPlay} />
              {resumable(r) && <span className="sr-only">Resume available</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
