import type { SVGProps } from "react";

// The four bars of the Vesper mark, on a 64 box.
export const BARS = [
  { x: 8, y: 10, w: 48 },
  { x: 14, y: 21, w: 36 },
  { x: 20, y: 32, w: 24 },
  { x: 26, y: 43, w: 12 },
] as const;

export function Mark({ title, ...rest }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {BARS.map((b, i) => (
        <rect
          key={b.y}
          className={i === 0 ? "bar bar-accent" : "bar"}
          x={b.x}
          y={b.y}
          width={b.w}
          height={7}
          rx={3.5}
        />
      ))}
    </svg>
  );
}

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
