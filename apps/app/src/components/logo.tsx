/** Top to bottom: x, y, width of each scanline bar. Together they form a V. */
const BARS = [
  [8, 10, 48],
  [14, 21, 36],
  [20, 32, 24],
  [26, 43, 12],
] as const;

/** The Vesper mark. The top bar is the accent; the rest follow the surrounding text colour. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Vesper">
      {BARS.map(([x, y, width], i) => (
        <rect
          key={y}
          x={x}
          y={y}
          width={width}
          height={7}
          rx={3.5}
          className={i === 0 ? "fill-accent" : undefined}
          fill={i === 0 ? undefined : "currentColor"}
        />
      ))}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-bold tracking-tight">Vesper</span>
    </span>
  );
}
