import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

type Variant = "primary" | "soft" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-semibold hover:brightness-110",
  soft: "bg-raised hover:bg-line",
  danger: "border border-line text-accent hover:bg-tint",
  ghost: "text-muted hover:bg-raised hover:text-paper",
};

export function Button({
  variant = "soft",
  className = "",
  ...rest
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        {...rest}
        className="w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        {...rest}
        className="w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 focus:border-accent focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="surface mb-6">
      {(title || actions) && (
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "accent" | "ok";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-raised text-muted",
    accent: "bg-tint text-accent",
    ok: "bg-raised text-paper",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Modal({
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-panel p-0 text-paper backdrop:bg-black/70"
    >
      <div className="flex items-center border-b border-line px-6 py-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ml-auto rounded-full px-2 text-2xl leading-none text-muted hover:text-paper"
        >
          ×
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>
);

export const when = (epoch: number | null | undefined) =>
  epoch
    ? new Date(epoch * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "—";
