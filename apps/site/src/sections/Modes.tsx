import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Section, scheduleRefresh, Title } from "../ui";

const MODES = {
  lite: {
    name: "Lite mode",
    tag: "One home, no login",
    pitch:
      "The default. Start the server and Kodi finds it on your network. One implicit user owns everything.",
    yes: [
      "No accounts and no passwords to type into Kodi",
      "The add-on finds the server by itself (mDNS), or you type 192.168.1.20:8484",
      "Answers only to home-network names; list extra names with --allowed-host",
      "The admin panel at /admin/ opens without a sign-in",
    ],
    warn: "Anyone who can reach the port can record and open the admin panel. Keep it on your home network and never expose it to the internet.",
    cmd: "vesper-server --mode lite",
  },
  full: {
    name: "Full mode",
    tag: "Users, quotas, HTTPS",
    pitch:
      "For a server that is not on your LAN, or shared by a family. Every person signs in with their own account.",
    yes: [
      "Roles: admin, user, and guest (guests watch but cannot record)",
      "Quotas per account: recordings at once, longest recording, storage, how long recordings are kept",
      "Invites with a role and limits, and an admin panel with an activity log",
      "Argon2id password hashes, rate-limited sign-ins; the add-on has a username and password setting",
      "Put Caddy, nginx or Traefik in front for HTTPS, and pass --trust-proxy",
    ],
    warn: "Always use HTTPS when the server is reachable from the internet.",
    cmd: "vesper-server --mode full --bind 127.0.0.1:8484",
  },
} as const;
type Key = keyof typeof MODES;

export default function Modes() {
  const [m, setM] = useState<Key>("lite");
  useEffect(() => {
    scheduleRefresh();
  }, []);
  const cur = MODES[m];
  return (
    <Section id="modes" labelledBy="modes-title" className="sheet-a">
      <div className="wrap">
        <div className="sec-head">
          <Title id="modes-title">At home, or out in the world.</Title>
        </div>
        <LayoutGroup id="modes">
          <div className="tabs" role="tablist" aria-label="Server mode">
            {(Object.keys(MODES) as Key[]).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-selected={m === k}
                aria-controls={`panel-${k}`}
                className={m === k ? "on" : ""}
                onClick={() => setM(k)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                    setM(m === "lite" ? "full" : "lite");
                }}
                data-cursor
              >
                {m === k && (
                  <motion.i
                    layoutId="mode-ind"
                    className="tab-ind"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span>{MODES[k].name}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={m}
              id={`panel-${m}`}
              role="tabpanel"
              aria-labelledby={`tab-${m}`}
              className="mode-panel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div>
                <h3>{cur.tag}</h3>
                <p className="lede">{cur.pitch}</p>
                <p className={`callout ${m === "lite" ? "amber" : ""}`}>{cur.warn}</p>
                <pre className="inline-cmd" tabIndex={0}>
                  <code>{cur.cmd}</code>
                </pre>
              </div>
              <motion.ul
                className="ticks"
                initial="h"
                animate="s"
                variants={{ h: {}, s: { transition: { staggerChildren: 0.06 } } }}
              >
                {cur.yes.map((y) => (
                  <motion.li
                    key={y}
                    variants={{ h: { opacity: 0, x: 16 }, s: { opacity: 1, x: 0 } }}
                  >
                    {y}
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </Section>
  );
}
