import { lazy, Suspense, useEffect, useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "./gsap";
import { Hero } from "./sections/Hero";
import { Cursor, REPO, scheduleRefresh } from "./ui";

const KodiMock = lazy(() => import("./sections/KodiMock"));
const Flow = lazy(() => import("./sections/Flow"));
const Epg = lazy(() => import("./sections/Epg"));
const Resilience = lazy(() => import("./sections/Resilience"));
const Disk = lazy(() => import("./sections/Disk"));
const Architecture = lazy(() => import("./sections/Architecture"));
const Modes = lazy(() => import("./sections/Modes"));
const Install = lazy(() => import("./sections/Install"));
const Footer = lazy(() => import("./sections/Footer"));

const PLATFORMS = [
  "Android TV",
  "Fire TV",
  "LibreELEC",
  "CoreELEC",
  "Windows",
  "Linux",
  "macOS",
  "Docker",
  "Raspberry Pi and NAS (arm64)",
];

function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
      <rect x="8" y="10" width="48" height="7" rx="3.5" fill="var(--rec)" />
      <rect x="14" y="21" width="36" height="7" rx="3.5" fill="currentColor" />
      <rect x="20" y="32" width="24" height="7" rx="3.5" fill="currentColor" />
      <rect x="26" y="43" width="12" height="7" rx="3.5" fill="currentColor" />
    </svg>
  );
}

function Nav() {
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(
        bar.current,
        { scaleX: 0 },
        { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } },
      );
    });
    return () => mm.revert();
  });
  return (
    <>
      <a className="skip" href="#try">
        Skip to content
      </a>
      <div className="progress" aria-hidden="true">
        <div ref={bar} className="progress-bar" />
      </div>
      <nav className="nav" aria-label="Main">
        <a href="#top" className="brand" aria-label="Vesper, back to top">
          <Mark />
          <span>Vesper</span>
        </a>
        <ul>
          <li>
            <a href="#try">Try it</a>
          </li>
          <li>
            <a href="#how">How</a>
          </li>
          <li>
            <a href="#schedule">Schedule</a>
          </li>
          <li>
            <a href="#modes">Modes</a>
          </li>
          <li>
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </li>
        </ul>
        <a href="#install" className="nav-cta">
          Install
        </a>
      </nav>
    </>
  );
}

function Band() {
  const row = [...PLATFORMS, ...PLATFORMS];
  return (
    <section className="band" aria-label="Where it runs">
      <div className="band-track" aria-hidden="true">
        {row.map((p, i) => (
          <span key={i}>{p}</span>
        ))}
      </div>
      <p className="sr-only">
        Kodi on {PLATFORMS.slice(0, 7).join(", ")}. The server runs on Linux, Windows, Docker and
        arm64.
      </p>
    </section>
  );
}

export function App() {
  useEffect(() => {
    const done = () => scheduleRefresh();
    window.addEventListener("load", done);
    document.fonts?.ready.then(done);
    return () => window.removeEventListener("load", done);
  }, []);
  return (
    <>
      <Nav />
      <Cursor />
      <main id="main">
        <Hero />
        <Band />
        <Suspense fallback={<div className="ph-sec" />}>
          <KodiMock />
          <Flow />
          <Epg />
          <Resilience />
          <Disk />
          <Architecture />
          <Modes />
          <Install />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
