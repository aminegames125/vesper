import { type ReactNode, useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { CURRENT_VERSION, RELEASES, TIPS } from "../lib/whats-new";
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

export function ReleaseList() {
  return (
    <div className="flex flex-col gap-6">
      {RELEASES.map((r) => (
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
      <ReleaseList />
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={markSeen}>
          Got it
        </Button>
      </div>
    </Dialog>
  );
}

/** Small dismissible tips card, bottom left. */
export function Tips() {
  const dismissed = useStore((s) => s.tipsDismissed);
  const dismiss = useStore((s) => s.dismissTips);
  const playing = useStore((s) => s.playing);
  const [index, setIndex] = useState(0);
  if (dismissed || playing) return null;

  return (
    <aside
      aria-label="Tip"
      className="surface fixed bottom-5 left-[6.25rem] z-10 w-80 p-4 shadow-xl"
    >
      <p className="min-h-10 text-sm">{TIPS[index]}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-muted">
          {index + 1} / {TIPS.length}
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" onClick={dismiss}>
            Hide
          </Button>
          <Button onClick={() => setIndex((index + 1) % TIPS.length)}>Next</Button>
        </div>
      </div>
    </aside>
  );
}
