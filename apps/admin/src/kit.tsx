import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./icons";
import { EASE } from "./motion";
import { Button, IconButton, Modal } from "./ui";

/** One fact: what it is, its value, a note. Not a tile; it sits on the page under a hairline. */
export function Stat({
  label,
  value,
  hint,
  tone = "paper",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: "paper" | "accent" | "ok" | "warn";
}) {
  const color = { paper: "text-paper", accent: "text-accent", ok: "text-ok", warn: "text-warn" }[
    tone
  ];
  return (
    <div className="border-t border-line pt-4" data-reveal>
      <p className="text-lg text-muted">{label}</p>
      <p className={`display mt-1 text-4xl leading-none tabular ${color}`}>{value}</p>
      {hint && <p className="mt-2 text-base text-muted">{hint}</p>}
    </div>
  );
}

/** A friendly empty state: an icon, a short title, one line of help and optionally an action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-start gap-4 px-[var(--card-pad)] py-10 sm:px-10">
      <Icon name={icon} size={36} className="text-accent" />
      <p className="display text-4xl">{title}</p>
      {children && <p className="max-w-xl text-xl leading-relaxed text-muted">{children}</p>}
      {action}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: IconName;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A "more" button that opens a small list of actions under it. */
export function ActionMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <IconButton
        icon="more"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute right-0 top-full z-[var(--z-sheet)] mt-1.5 min-w-52 origin-top-right rounded-xl border border-line bg-panel p-1.5 shadow-[var(--shadow-2)]"
          >
            {items.map((item) => (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-raised disabled:opacity-40 ${item.danger ? "text-accent" : "text-paper"}`}
                >
                  {item.icon && <Icon name={item.icon} size={17} />}
                  {item.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Asks before something that cannot be undone. */
export function Confirm({
  title,
  body,
  confirm = "Delete",
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirm?: string;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              onClose();
            }
          }}
        >
          {busy ? "Working…" : confirm}
        </Button>
      </div>
    </Modal>
  );
}

type Toast = { id: number; text: string; tone: "ok" | "error" };
type Say = (text: string, tone?: Toast["tone"]) => void;
const ToastContext = createContext<Say>(() => {});

/** Wrap the app once; any component then calls `useToast()("Saved")`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Say>((text, tone = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === "error" ? 6000 : 3200,
    );
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+1rem)] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.28, ease: EASE }}
              className={`bg-raised pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-[var(--shadow-2)] ${t.tone === "error" ? "border-accent/50 text-accent" : "border-line text-paper"}`}
            >
              <Icon name={t.tone === "error" ? "close" : "check"} size={16} />
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
