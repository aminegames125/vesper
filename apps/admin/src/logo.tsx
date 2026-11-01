import { useRef } from "react";
import { gsap, reduced, useGSAP } from "./motion";

/** Top to bottom: x, y, width of each scanline bar. Together they form a V. */
const BARS = [
  [8, 10, 48],
  [14, 21, 36],
  [20, 32, 24],
  [26, 43, 12],
] as const;

/**
 * The Vesper mark. The top bar is the accent; the rest follow the surrounding text colour.
 * With `animate`, the bars sweep in one after another, the way a scanline draws a frame.
 */
export function LogoMark({ size = 28, animate = false }: { size?: number; animate?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (!animate || reduced()) return;
      const bars = gsap.utils.toArray<SVGRectElement>("rect", ref.current);
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(bars, {
          scaleX: 0,
          transformOrigin: "0% 50%",
          duration: 0.7,
          stagger: 0.11,
        })
        .from(bars, { opacity: 0, duration: 0.35, stagger: 0.11 }, 0)
        .to(
          bars.slice(0, 1),
          { filter: "drop-shadow(0 0 6px var(--accent))", duration: 0.5, yoyo: true, repeat: 1 },
          0.5,
        );
    },
    { scope: ref },
  );

  return (
    <svg ref={ref} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Vesper">
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

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display text-xl font-bold tracking-tight">Vesper</span>
    </span>
  );
}
