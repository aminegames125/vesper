import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { type AnimIcon, IconButton, SearchIcon, useIconHover, XIcon } from "./icons";

type Variant = "primary" | "soft" | "outline" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110 font-semibold",
  soft: "bg-raised hover:bg-line",
  outline: "border border-line hover:bg-raised",
  ghost: "hover:bg-raised text-muted hover:text-paper",
  danger: "border border-line text-accent hover:bg-tint",
};

export function Button({
  variant = "soft",
  icon: Icon,
  children,
  className = "",
  ...rest
}: {
  variant?: Variant;
  icon?: AnimIcon;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ref, handlers } = useIconHover();
  return (
    <button
      type="button"
      {...handlers}
      {...rest}
      className={`fade inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon ref={ref} size={16} color="currentColor" />}
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  ...rest
}: { active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      {...rest}
      className="fade whitespace-nowrap rounded-full bg-raised px-4 py-1.5 text-sm font-medium hover:bg-line aria-pressed:bg-accent aria-pressed:text-on-accent"
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-raised p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="fade rounded-full px-4 py-1.5 text-sm font-medium text-muted hover:text-paper aria-pressed:bg-accent aria-pressed:text-on-accent"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <label className="relative flex w-full max-w-sm items-center">
      <span className="pointer-events-none absolute left-3.5 text-muted">
        <SearchIcon size={16} color="currentColor" isAnimated={false} />
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-line bg-panel py-2 pl-10 pr-9 text-sm placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <span className="absolute right-1">
          <IconButton
            icon={XIcon}
            label="Clear search"
            size={14}
            className="size-7"
            onClick={() => onChange("")}
          />
        </span>
      )}
    </label>
  );
}

export function PageHeader({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold">
          {title}
          {count !== undefined && (
            <span className="ml-3 align-middle text-sm font-medium text-muted">
              {count.toLocaleString()}
            </span>
          )}
        </h1>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Notice({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-16">
      <span className="size-7 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
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

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="fade relative h-6 w-11 flex-none rounded-full bg-line aria-checked:bg-accent"
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] ${checked ? "left-[1.375rem]" : "left-0.5"}`}
      />
    </button>
  );
}
