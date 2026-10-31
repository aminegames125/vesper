import { type ReactNode, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { CURRENT_VERSION, RELEASES, type Release, type ReleaseKind } from "../lib/whats-new";
import { IconButton, XIcon } from "./icons";
import { Button } from "./ui";

/** A modal built on the native <dialog>, which gives focus trapping and Escape for free. */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    // Unmounting removes the element and its backdrop; calling close() here would fire onClose
    // (and mark the notes as seen) when React re-runs the effect in development.
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[88vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-0 text-paper backdrop:bg-black/70"
    >
      <div className="flex items-center gap-4 border-b border-line px-6 py-3">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <IconButton icon={XIcon} label="Close" className="ml-auto" onClick={onClose} />
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}

const KIND_LABEL: Record<ReleaseKind, string> = {
  major: "Major update",
  minor: "Minor update",
  patch: "Patch",
};
const KIND_CHIP: Record<ReleaseKind, string> = {
  major: "bg-accent text-on-accent",
  minor: "bg-accent/15 text-accent",
  patch: "bg-line text-muted",
};
// The bigger the release, the brighter and wider the glow behind its version number.
const KIND_GLOW: Record<ReleaseKind, string> = {
  major: "-right-10 -top-16 size-64 bg-accent/45",
  minor: "-right-12 -top-20 size-56 bg-accent/25",
  patch: "-right-16 -top-24 size-48 bg-accent/10",
};
const GROUP_DOT: Record<string, string> = {
  Added: "bg-accent",
  Fixed: "bg-paper",
  Changed: "bg-muted",
};

/** One release: a banner that says how big it was, then what changed under plain headings. */
function ReleaseCard({ release }: { release: Release }) {
  const counts = [
    release.push ? `Push ${release.push}` : null,
    release.changes ? `${release.changes} ${release.changes === 1 ? "change" : "changes"}` : null,
  ].filter(Boolean);

  return (
    <section>
      <header className="relative isolate overflow-hidden rounded-2xl bg-raised p-5">
        <div
          aria-hidden
          className={`absolute -z-10 rounded-full blur-3xl ${KIND_GLOW[release.kind]}`}
        />
        <div className="flex items-start justify-between gap-4">
          <p className="font-display text-5xl leading-none font-extrabold tabular-nums">
            {release.version}
          </p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${KIND_CHIP[release.kind]}`}
          >
            {KIND_LABEL[release.kind]}
          </span>
        </div>
        <p className="mt-3 text-sm text-muted tabular-nums">
          {[release.date, ...counts].join("  ·  ")}
        </p>
      </header>
      <div className="mt-4 flex flex-col gap-4 px-1">
        {release.groups.map((g) => (
          <div key={g.title}>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden
                className={`size-2 rounded-full ${GROUP_DOT[g.title] ?? "bg-muted"}`}
              />
              {g.title}
            </h4>
            <ul className="mt-1.5 space-y-1 pl-4 text-sm text-muted">
              {g.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReleaseList({ limit }: { limit?: number }) {
  return (
    <div className="flex flex-col gap-8">
      {RELEASES.slice(0, limit).map((r) => (
        <ReleaseCard key={r.version} release={r} />
      ))}
    </div>
  );
}

/** Release notes, shown once per version after the viewer has set up a source. */
export function WhatsNew() {
  const seen = useStore((s) => s.seenVersion);
  const markSeen = useStore((s) => s.markVersionSeen);
  const hasProviders = useStore((s) => s.providers.length > 0);
  if (seen === CURRENT_VERSION || !hasProviders) return null;

  return (
    <Dialog title="What's new" onClose={markSeen}>
      <ReleaseList limit={3} />
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={markSeen}>
          Got it
        </Button>
      </div>
    </Dialog>
  );
}
