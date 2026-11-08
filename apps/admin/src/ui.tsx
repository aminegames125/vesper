import { motion, useReducedMotion } from "framer-motion";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./icons";
import { EASE, SPRING } from "./motion";

type Variant = "primary" | "soft" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-semibold hover:brightness-110",
  soft: "plate bg-raised text-paper",
  danger: "plate bg-raised text-accent",
  ghost: "plate text-muted",
};

export function Button({
  variant = "soft",
  className = "",
  icon,
  children,
  ...rest
}: {
  variant?: Variant;
  icon?: IconName;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
>) {
  const calm = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileTap={calm ? undefined : { scale: 0.96 }}
      transition={SPRING}
      {...rest}
      className={`inline-flex min-h-[var(--btn-h)] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 text-base font-semibold transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </motion.button>
  );
}

export function IconButton({
  icon,
  label,
  className = "",
  ...rest
}: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`plate inline-flex size-12 items-center justify-center rounded-lg text-muted disabled:opacity-40 ${className}`}
    >
      <Icon name={icon} />
    </button>
  );
}

const CONTROL =
  "w-full min-h-[var(--field-h)] rounded-lg bg-raised px-4 py-2.5 text-base text-paper placeholder:text-muted transition-colors focus:outline-none focus-visible:outline-4";

export function Field({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-base">
      <span className="mb-2 block font-semibold">{label}</span>
      <input {...rest} className={CONTROL} />
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  hint,
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-base">
      <span className="mb-2 block font-semibold">{label}</span>
      <select {...rest} className={CONTROL}>
        {children}
      </select>
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** A switch with a label and a line of help, for settings that are on or off. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 text-base">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-8 w-14 flex-none rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
      >
        <motion.span
          layout
          transition={SPRING}
          className={`absolute top-1 size-6 rounded-full bg-paper ${checked ? "right-1" : "left-1"}`}
        />
      </button>
      <span>
        <b className="block font-medium">{label}</b>
        {hint && <span className="text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Card({
  title,
  children,
  actions,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface mb-5 overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-3 px-[var(--card-pad)] pt-5 pb-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-[length:var(--text-2xl)] font-bold leading-tight">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-base text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg bg-tint px-5 py-3.5 text-base font-medium text-accent"
    >
      {children}
    </p>
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "accent" | "ok" | "warn" | "dusk";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-raised text-muted",
    accent: "bg-tint text-accent",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    dusk: "bg-dusk/15 text-dusk",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  tone = "accent",
}: {
  value: number;
  tone?: "accent" | "ok" | "warn";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 overflow-hidden rounded-full bg-raised"
    >
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: EASE }}
      />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-raised ${className}`} />;
}

/** A row of choices of which exactly one is picked; the highlight glides between them. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  id: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-raised p-1.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative rounded-lg px-5 py-2.5 text-base font-semibold transition-colors ${o.value === value ? "text-on-accent" : "text-muted hover:text-paper"}`}
        >
          {o.value === value && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={SPRING}
              className="absolute inset-0 rounded-md bg-accent"
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A dialog on desktop and a bottom sheet on a phone; it animates both in and out. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true);
  const calm = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  useEffect(() => {
    if (open || calm) return;
    // Give the exit animation time to play, then let the parent unmount us.
    const timer = setTimeout(onClose, 180);
    return () => clearTimeout(timer);
  }, [open, calm, onClose]);

  const close = () => (calm ? onClose() : setOpen(false));

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} overflow-visible bg-transparent p-0 text-paper max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none`}
    >
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: open ? 0.38 : 0.16, ease: EASE }}
        className="flex max-h-[90dvh] flex-col rounded-2xl bg-panel shadow-[var(--shadow-2)] max-sm:rounded-b-none"
      >
        <div className="flex items-center px-7 pt-6 pb-2">
          <h2 className="text-2xl font-bold">{title}</h2>
          <IconButton icon="close" label="Close" onClick={close} className="ml-auto -mr-2" />
        </div>
        <div className="overflow-y-auto px-7 pt-3 pb-7">{children}</div>
      </motion.div>
    </dialog>
  );
}

export const Empty = ({ children }: { children: ReactNode; icon?: IconName }) => (
  <p className="max-w-md px-[var(--card-pad)] py-10 text-base leading-relaxed text-muted">
    {children}
  </p>
);

export const when = (epoch: number | null | undefined) =>
  epoch
    ? new Date(epoch * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "—";

/** Rows that stack on a phone and sit side by side on a wide screen. */
export const ROW = "flex flex-wrap items-center gap-x-5 gap-y-3 px-[var(--card-pad)] py-4";
