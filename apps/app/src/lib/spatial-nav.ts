import { useEffect } from "react";

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

type Direction = "left" | "right" | "up" | "down";

const KEYS: Record<string, Direction> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < innerHeight &&
    r.left < innerWidth
  );
};

/** Picks the nearest focusable element in the direction pressed, the way a TV remote expects. */
function nearest(
  from: DOMRect,
  direction: Direction,
  candidates: HTMLElement[],
): HTMLElement | null {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const along =
      direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    if (along <= 1) continue;
    const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** Arrow keys move focus between controls. Enabled for Android TV and anywhere TV mode is on. */
export function useSpatialNav(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.dataset.tv = "true";

    const onKey = (e: KeyboardEvent) => {
      const direction = KEYS[e.key];
      if (!direction || e.defaultPrevented) return;
      // The player and text fields use the arrow keys themselves.
      if (document.querySelector("[data-player]")) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active?.matches(
          'input[type="text"], input[type="search"], input[type="password"], input[type="url"], input[type="range"], textarea, select',
        )
      )
        return;

      const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
      if (all.length === 0) return;
      const from = active && active !== document.body ? active : null;
      const target = from
        ? nearest(
            from.getBoundingClientRect(),
            direction,
            all.filter((el) => el !== from),
          )
        : all[0];
      if (!target) return;
      e.preventDefault();
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete document.documentElement.dataset.tv;
    };
  }, [enabled]);
}
