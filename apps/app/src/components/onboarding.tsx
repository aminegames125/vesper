import { type ReactNode, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { CURRENT_VERSION, RELEASES } from "../lib/whats-new";
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
    if (el && !el.open) el.showModal();
    return () => el?.close();
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

export function ReleaseList({ limit }: { limit?: number }) {
  return (
    <div className="flex flex-col gap-6">
      {RELEASES.slice(0, limit).map((r) => (
        <section key={r.version}>
          <p className="text-xs text-muted">
            v{r.version} · {r.date}
          </p>
          <h3 className="text-xl font-semibold">{r.title}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
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
