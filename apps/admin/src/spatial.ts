import { useEffect } from "react";

/**
 * Remote-control navigation. Arrow keys move focus to the nearest control in that direction, the
 * way a TV remote's D-pad does; Enter activates (native); Backspace goes back. It stays out of the
 * way of text fields, selects, the video player (which has its own keys) and anything that opts out
 * with `data-no-spatial`.
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Dir = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
};

function candidates(): HTMLElement[] {
  // An open dialog traps navigation inside itself.
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  const root: ParentNode = dialog ?? document;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => visible(el) && !el.closest("[data-no-spatial]"),
  );
}

function pick(from: HTMLElement, dir: Dir, all: HTMLElement[]): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const horizontal = dir === "ArrowLeft" || dir === "ArrowRight";
    const forward = horizontal ? (dir === "ArrowRight" ? dx : -dx) : dir === "ArrowDown" ? dy : -dy;
    if (forward <= 1) continue;
    const across = Math.abs(horizontal ? dy : dx);
    // Rows and columns first: a control that overlaps on the cross axis beats a nearer diagonal.
    const overlap = horizontal
      ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0
      : Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
    const score = forward + across * (overlap ? 0.5 : 3);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function useSpatialNavigation() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[data-player]")) return;
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        (target.tagName === "INPUT" &&
          !["button", "checkbox", "radio", "submit"].includes((target as HTMLInputElement).type));

      if (e.key === "Backspace" && !typing) {
        e.preventDefault();
        window.history.back();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      if (typing) return;
      if (target.closest("[data-no-spatial]")) return;

      const all = candidates();
      if (!all.length) return;
      const here = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const next =
        here && here !== document.body && all.includes(here)
          ? pick(here, e.key as Dir, all)
          : (all.find((el) => el.closest("main")) ?? all[0]);
      if (!next) return;
      e.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
