import { useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "../gsap";
import { Btn, RELEASES, REPO } from "../ui";

export default function Footer() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".foot-word", {
          yPercent: 40,
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 90%",
            end: "bottom bottom",
            scrub: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <footer className="foot" ref={ref}>
      <div className="wrap">
        <div className="foot-cta">
          <h2 className="foot-h">Next time it is on, it is already recorded.</h2>
          <div className="hero-cta">
            <Btn href="#install">Install the add-on</Btn>
            <Btn href={RELEASES} variant="ghost" ext>
              Download the server
            </Btn>
          </div>
        </div>
        <nav className="foot-links" aria-label="Footer">
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={RELEASES} target="_blank" rel="noopener noreferrer">
            Releases
          </a>
          <a href={`${REPO}/blob/main/docs/KODI.md`} target="_blank" rel="noopener noreferrer">
            Kodi guide
          </a>
          <a href={`${REPO}/blob/main/docs/SERVER.md`} target="_blank" rel="noopener noreferrer">
            Server guide
          </a>
          <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
            Issues
          </a>
        </nav>
        <p className="fine">
          MIT licence. Vesper records streams you are already allowed to watch; bring your own IPTV
          provider. Not affiliated with Kodi.
        </p>
      </div>
      <div className="foot-word" aria-hidden="true">
        Vesper
      </div>
    </footer>
  );
}
