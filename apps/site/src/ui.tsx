import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { gsap, MOTION_OK, ScrollTrigger, SplitText, useGSAP } from "./gsap";

export const REPO = "https://github.com/aminegames125/vesper";
export const RELEASES = `${REPO}/releases/latest`;
export const KODI_REPO_ZIP =
  "https://amineos.dev/vesper/kodi/repository.vesper/repository.vesper-1.0.0.zip";

let refreshTimer = 0;
/** Debounced ScrollTrigger.refresh, called after lazy sections mount and fonts load. */
export function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);
}

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Headline line-reveal with SplitText (GSAP). Static text when motion is reduced. */
export function useSplitReveal(
  ref: React.RefObject<HTMLElement | null>,
  opts: { onLoad?: boolean } = {},
) {
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        SplitText.create(el, {
          type: "lines,words",
          mask: "lines",
          autoSplit: true,
          onSplit(self) {
            gsap.set(el, { visibility: "visible" });
            return gsap.from(self.lines, {
              yPercent: 115,
              rotate: 2,
              duration: 1.1,
              stagger: 0.09,
              ease: "expo.out",
              delay: opts.onLoad ? 0.15 : 0,
              scrollTrigger: opts.onLoad
                ? undefined
                : { trigger: el, start: "top 88%", once: true },
            });
          },
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
}

export function Title({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useSplitReveal(ref);
  return (
    <h2 id={id} ref={ref} className={`title split ${className}`}>
      {children}
    </h2>
  );
}

export function Section({
  id,
  labelledBy,
  className = "",
  children,
}: {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`sheet ${className}`}>
      {children}
    </section>
  );
}

/** Pulls a button slightly toward the pointer (GSAP quickTo), fine pointers only. */
export function useMagnetic<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_OK} and (pointer: fine)`, () => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * strength);
          yTo((e.clientY - (r.top + r.height / 2)) * strength);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        return () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        };
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return ref;
}

export function Btn({
  href,
  children,
  variant = "solid",
  ext = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "solid" | "ghost";
  ext?: boolean;
}) {
  const ref = useMagnetic<HTMLAnchorElement>();
  return (
    <motion.a
      ref={ref}
      href={href}
      className={`btn btn-${variant}`}
      data-cursor
      whileTap={{ scale: 0.96 }}
      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <span>{children}</span>
    </motion.a>
  );
}

export function CopyBlock({ label, code }: { label: string; code: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1800);
  };
  return (
    <figure className="code">
      <figcaption>
        <span>{label}</span>
        <motion.button
          type="button"
          onClick={copy}
          className="copy"
          data-cursor
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.93 }}
          aria-label={`Copy ${label}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={done ? "ok" : "copy"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14 }}
            >
              {done ? "Copied" : "Copy"}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </figcaption>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span className="sr-only" role="status" aria-live="polite">
        {done ? "Copied to clipboard" : ""}
      </span>
    </figure>
  );
}

/** Ring that trails the pointer (desktop with a fine pointer, motion allowed). */
export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ring.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(`${MOTION_OK} and (pointer: fine) and (hover: hover)`, () => {
      gsap.set(el, { xPercent: -50, yPercent: -50, autoAlpha: 0 });
      const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3" });
      const move = (e: PointerEvent) => {
        xTo(e.clientX);
        yTo(e.clientY);
        gsap.to(el, { autoAlpha: 1, duration: 0.2, overwrite: "auto" });
        const hot = (e.target as Element | null)?.closest(
          "a,button,[data-cursor],input,[role=option]",
        );
        el.classList.toggle("hot", !!hot);
      };
      const out = () => gsap.to(el, { autoAlpha: 0, duration: 0.2 });
      window.addEventListener("pointermove", move);
      document.addEventListener("pointerleave", out);
      return () => {
        window.removeEventListener("pointermove", move);
        document.removeEventListener("pointerleave", out);
      };
    });
    return () => mm.revert();
  });
  return <div ref={ring} className="cursor" aria-hidden="true" />;
}

export function Tally({ size = 10 }: { size?: number }) {
  return <span className="tally" style={{ width: size, height: size }} aria-hidden="true" />;
}
