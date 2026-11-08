import { type CloudClient, type CloudRecording, formatBytes } from "@vesper/cloud-client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { useLoad } from "../hooks";
import { Icon } from "../icons";
import { ActionMenu, Confirm, EmptyState, type MenuItem, useToast } from "../kit";
import { EASE, useReveal } from "../motion";
import { Button, Field, Modal, Notice, PageHeader, Segmented, Skeleton } from "../ui";
import { MediaCard, resumable, useMediaToken } from "./media";
import { downloadMp4 } from "./mp4";

type Filter = "all" | "now" | "unwatched" | "downloads";

export function Library({ client, onPlay }: { client: CloudClient; onPlay: (id: string) => void }) {
  const { data, error, reload } = useLoad(() => client.listRecordings(), 6000);
  const media = useMediaToken(client);
  const say = useToast();
  const page = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [renaming, setRenaming] = useState<CloudRecording | null>(null);
  const [moving, setMoving] = useState<CloudRecording | null>(null);
  const [deleting, setDeleting] = useState<CloudRecording | null>(null);
  useReveal(page, data ? "ready" : "loading");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.recordings ?? []).filter((r) => {
      if (r.status === "failed") return false;
      if (filter === "now" && r.status !== "recording" && r.status !== "scheduled") return false;
      if (filter === "unwatched" && (r.watched || r.status !== "done")) return false;
      if (filter === "downloads" && r.kind !== "download") return false;
      if (folder && r.tag !== folder) return false;
      return !q || `${r.title} ${r.channelName}`.toLowerCase().includes(q);
    });
  }, [data, filter, query, folder]);
  const failed = (data?.recordings ?? []).filter((r) => r.status === "failed");

  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      say(done);
      await reload();
    } catch (e) {
      say(e instanceof Error ? e.message : "That did not work.", "error");
    }
  };

  const menu = (r: CloudRecording): MenuItem[] => {
    const items: MenuItem[] = [];
    if (r.status === "recording")
      items.push({
        label: "Stop recording",
        icon: "pause",
        onClick: () => void act(() => client.stopRecording(r.id), `Stopped ${r.title}`),
      });
    items.push(
      { label: "Rename", icon: "settings", onClick: () => setRenaming(r) },
      { label: "Move to a folder", icon: "library", onClick: () => setMoving(r) },
    );
    if (r.status === "done") {
      items.push({
        label: r.watched ? "Mark as not watched" : "Mark as watched",
        icon: "check",
        onClick: () =>
          void act(
            () => client.patchRecording(r.id, { watched: !r.watched, position_s: 0 }),
            r.watched ? "Marked as not watched" : "Marked as watched",
          ),
      });
      if (r.kind === "recording")
        items.push({
          label: "Download as MP4",
          icon: "download",
          onClick: () => void downloadMp4(client, r, media, say),
        });
      items.push({
        label: r.keepHours === null ? "Delete automatically again" : "Keep forever",
        icon: "bookmark",
        onClick: () =>
          void act(
            () => client.keepRecording(r.id, r.keepHours === null ? 168 : 0),
            r.keepHours === null ? "Will be cleaned up after a week" : "Kept forever",
          ),
      });
    }
    items.push({ label: "Delete", icon: "trash", danger: true, onClick: () => setDeleting(r) });
    return items;
  };

  const all = data?.recordings ?? [];
  const anyContent = all.length > 0;

  return (
    <div ref={page}>
      <PageHeader
        title="Library"
        lead="Everything recorded or saved on this server."
        actions={
          data && data.storageLimit > 0 ? (
            <p className="text-lg text-muted tabular">
              {formatBytes(data.storageUsed)} of {formatBytes(data.storageLimit)} used
            </p>
          ) : undefined
        }
      />
      <Notice>{error}</Notice>

      {anyContent && (
        <div data-reveal className="mb-8 flex flex-wrap items-center gap-4">
          <div className="relative min-w-60 flex-1 basis-72">
            <Icon
              name="search"
              size={22}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and channels"
              aria-label="Search the library"
              className="min-h-[var(--field-h)] w-full rounded-lg bg-raised py-2.5 pl-12 pr-4 text-lg placeholder:text-muted"
            />
          </div>
          <div className="max-w-full overflow-x-auto">
            <Segmented<Filter>
              id="library-filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "now", label: "Recording" },
                { value: "unwatched", label: "Unwatched" },
                { value: "downloads", label: "Saved" },
              ]}
            />
          </div>
        </div>
      )}

      {data && data.tags.length > 0 && (
        <div data-reveal className="mb-8 flex flex-wrap gap-3">
          {["", ...data.tags].map((t) => (
            <button
              key={t || "all"}
              type="button"
              aria-pressed={folder === t}
              onClick={() => setFolder(t)}
              className={`plate rounded-lg px-5 py-2.5 text-lg font-semibold ${folder === t ? "bg-paper text-ink" : "bg-raised text-muted"}`}
            >
              {t || "All folders"}
            </button>
          ))}
        </div>
      )}

      {!data && !error && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-video" />
          ))}
        </div>
      )}

      {data && !anyContent && (
        <EmptyState icon="film" title="Your library is empty">
          Record a channel from Live TV or the guide, or save a movie from Movies & shows. It shows
          up here the moment it starts.
        </EmptyState>
      )}
      {data && anyContent && shown.length === 0 && (
        <EmptyState icon="search" title="Nothing matches">
          Try another search, filter or folder.
        </EmptyState>
      )}

      <motion.ul layout className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {shown.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="relative"
            >
              <MediaCard rec={r} media={media} client={client} onPlay={onPlay} />
              <div className="absolute right-2 top-2 rounded-lg bg-black/70">
                <ActionMenu items={menu(r)} label={`Actions for ${r.title}`} />
              </div>
              {(r.status === "scheduled" || r.status === "queued" || r.status === "recording") && (
                <p className="mt-1 text-base font-semibold text-accent">
                  {r.status === "recording" ? "Recording now" : "Waiting to start"}
                </p>
              )}
              {resumable(r) && (
                <p className="mt-1 text-base text-muted">Resume where you left off</p>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {failed.length > 0 && (
        <section className="mt-14">
          <div className="mb-3 flex items-center gap-4">
            <h2 className="text-3xl">Failed</h2>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() =>
                void act(() => client.clearFailedRecordings(), "Cleared the failed recordings")
              }
            >
              Clear all
            </Button>
          </div>
          <ul className="surface overflow-hidden">
            {failed.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-5 px-[var(--card-pad)] py-4 not-last:border-b not-last:border-line/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-semibold">{r.title}</p>
                  <p className="truncate text-base text-muted">{r.error || "It did not record."}</p>
                </div>
                <Button variant="danger" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {renaming && (
        <TextModal
          title="Rename"
          label="Title"
          initial={renaming.title}
          onClose={() => setRenaming(null)}
          onSave={(title) => act(() => client.patchRecording(renaming.id, { title }), "Renamed")}
        />
      )}
      {moving && (
        <TextModal
          title="Move to a folder"
          label="Folder"
          hint="Leave empty to take it out of its folder."
          initial={moving.tag}
          suggestions={data?.tags}
          allowEmpty
          onClose={() => setMoving(null)}
          onSave={(tag) => act(() => client.patchRecording(moving.id, { tag }), "Moved")}
        />
      )}
      {deleting && (
        <Confirm
          title={`Delete “${deleting.title}”?`}
          body="The recording and its file are removed from the server. This cannot be undone."
          onClose={() => setDeleting(null)}
          onConfirm={() => act(() => client.deleteRecording(deleting.id), "Deleted")}
        />
      )}
    </div>
  );
}

function TextModal({
  title,
  label,
  hint,
  initial,
  suggestions,
  allowEmpty = false,
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  hint?: string;
  initial: string;
  suggestions?: string[];
  allowEmpty?: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ok = allowEmpty || value.trim().length > 0;
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          await onSave(value.trim());
          onClose();
        }}
        className="space-y-5"
      >
        <Field
          label={label}
          hint={hint}
          value={value}
          autoFocus
          list={suggestions ? "folder-suggestions" : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        {suggestions && (
          <datalist id="folder-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ok || busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
