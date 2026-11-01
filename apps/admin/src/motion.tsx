import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type RefObject, useEffect, useRef } from "react";

gsap.registerPlugin(useGSAP);

/** The easing every animation shares; it matches `--ease-out` in the tokens. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
export const SOFT_SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

/** Framer Motion variants for a page changing under the shell. */
export const PAGE = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16 } },
};

export const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades the children marked `data-reveal` in, one after another, whenever `key` changes.
 * GSAP owns this one because a stagger over a list of unknown length is its strength.
 */
export function useReveal(scope: RefObject<HTMLElement | null>, key: unknown = 0) {
  useGSAP(
    () => {
      const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", scope.current);
      if (!items.length || reduced()) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: { each: 0.05, from: "start" },
          clearProps: "transform,opacity",
        },
      );
    },
    { scope, dependencies: [key], revertOnUpdate: true },
  );
}

/** A number that counts up to `value` when it appears and glides to each new value. */
export function CountUp({
  value,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef({ n: 0 });
  const formatter = useRef(format);
  formatter.current = format;

  useGSAP(
    () => {
      const paint = () => {
        if (ref.current) ref.current.textContent = formatter.current(shown.current.n);
      };
      if (reduced()) {
        shown.current.n = value;
        paint();
        return;
      }
      gsap.to(shown.current, {
        n: value,
        duration: 1.1,
        ease: "power3.out",
        onUpdate: paint,
      });
    },
    { dependencies: [value] },
  );

  return (
    <span ref={ref} className={`tabular ${className ?? ""}`}>
      {format(0)}
    </span>
  );
}

/** Runs `effect` with a GSAP timeline that is killed on unmount. */
export function useTimeline(effect: (tl: gsap.core.Timeline) => void, deps: unknown[] = []) {
  const ref = useRef<gsap.core.Timeline | null>(null);
  useEffect(() => {
    if (reduced()) return;
    const tl = gsap.timeline();
    ref.current = tl;
    effect(tl);
    return () => {
      tl.kill();
    };
  }, deps);
  return ref;
}

export { gsap, useGSAP };
