import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import {
  Btn,
  CopyBlock,
  KODI_REPO_ZIP,
  RELEASES,
  REPO,
  Section,
  scheduleRefresh,
  Title,
} from "../ui";

const COMPOSE = `services:
  vesper:
    image: ghcr.io/aminegames125/vesper-server:latest
    restart: unless-stopped
    ports:
      - "8484:8484"
    volumes:
      - ./vesper-data:/data
    environment:
      VESPER_MODE: lite   # no accounts; use "full" for several people`;

const SERVER_TABS = {
  docker: {
    label: "Docker Compose",
    body: (
      <>
        <p>Works on x64 and on arm64 hosts such as a NAS. Save this as docker-compose.yml, then:</p>
        <CopyBlock label="docker-compose.yml" code={COMPOSE} />
        <CopyBlock label="Start it" code="docker compose up -d" />
      </>
    ),
  },
  linux: {
    label: "Linux and Raspberry Pi",
    body: (
      <>
        <p>
          Download the x64 or arm64 build from the{" "}
          <a href={RELEASES} target="_blank" rel="noopener noreferrer">
            latest release
          </a>
          , unpack it and run it. A Raspberry Pi 4 or newer is plenty.
        </p>
        <CopyBlock label="Run it" code="./vesper-server --mode lite" />
        <p className="fine">To start it at boot, use the systemd unit in the server guide.</p>
      </>
    ),
  },
  windows: {
    label: "Windows",
    body: (
      <>
        <p>
          Download the Windows x64 zip from the{" "}
          <a href={RELEASES} target="_blank" rel="noopener noreferrer">
            latest release
          </a>
          , unpack it into a folder of its own and run it. Allow it through the firewall for private
          networks when Windows asks.
        </p>
        <CopyBlock label="Run it" code=".\vesper-server.exe --mode lite" />
        <p className="fine">To start it with Windows, put a shortcut in shell:startup.</p>
      </>
    ),
  },
} as const;
type ST = keyof typeof SERVER_TABS;

function Step1() {
  const [t, setT] = useState<ST>("docker");
  return (
    <div className="step-body">
      <p>Put it on anything that stays on while you are out: a spare PC, a NAS, a mini PC.</p>
      <LayoutGroup id="srv">
        <div className="tabs small" role="tablist" aria-label="Server platform">
          {(Object.keys(SERVER_TABS) as ST[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={t === k}
              className={t === k ? "on" : ""}
              onClick={() => setT(k)}
              data-cursor
            >
              {t === k && (
                <motion.i
                  layoutId="srv-ind"
                  className="tab-ind"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span>{SERVER_TABS[k].label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={t}
          role="tabpanel"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {SERVER_TABS[t].body}
        </motion.div>
      </AnimatePresence>
      <p className="fine">
        It listens on port 8484. Open http://&lt;the machine's address&gt;:8484/admin/ to see the
        admin panel.
      </p>
    </div>
  );
}

function Step2() {
  return (
    <div className="step-body">
      <p>
        The repository installs the add-on and keeps it up to date. Open this address in a browser
        and save the file (on a TV box, use its browser or a USB stick).
      </p>
      <CopyBlock label="Vesper repository zip" code={KODI_REPO_ZIP} />
      <ol className="num">
        <li>
          In Kodi: <b>Settings, System, Add-ons</b>, turn on <b>Unknown sources</b>.
        </li>
        <li>
          <b>Add-ons, Install from zip file</b>, and pick the file. (Or add the address as a source
          in the File manager and pick it from there.)
        </li>
        <li>
          <b>Install from repository, Vesper repository, Video add-ons, Vesper, Install.</b>
        </li>
      </ol>
      <p className="fine">
        You can also install a single plugin.video.vesper zip from the{" "}
        <a href={RELEASES} target="_blank" rel="noopener noreferrer">
          releases
        </a>
        , without automatic updates.
      </p>
    </div>
  );
}

function Step3() {
  return (
    <div className="step-body">
      <p>About 20 seconds after Kodi starts, the add-on does two things by itself:</p>
      <ul className="ticks plain">
        <li>It finds your Vesper server on the network, when there is exactly one.</li>
        <li>
          It hands the playlists in Kodi's PVR IPTV Simple Client to the server, once, and checks
          again every 6 hours.
        </li>
      </ul>
      <p>
        Then open <b>TV, Channels</b> or <b>TV, Guide</b>, hold OK on a channel (or press C on a
        keyboard) and choose <b>Record with Vesper</b>. Watch it under{" "}
        <b>Add-ons, Video add-ons, Vesper</b>.
      </p>
      <p className="fine">
        If nothing is found (a guest network, a VPN or a Docker bridge can block discovery), type
        the address in the add-on's settings.
      </p>
    </div>
  );
}

const STEPS: { t: string; sub: string; el: ReactNode }[] = [
  { t: "Run the server", sub: "On a machine that stays on", el: <Step1 /> },
  { t: "Add Vesper to Kodi", sub: "Repository zip, then install", el: <Step2 /> },
  { t: "Record something", sub: "It connects itself", el: <Step3 /> },
];

export default function Install() {
  const [i, setI] = useState(0);
  useEffect(() => {
    scheduleRefresh();
  }, [i]);
  return (
    <Section id="install" labelledBy="inst-title" className="sheet-b">
      <div className="wrap">
        <div className="sec-head">
          <Title id="inst-title">Two installs, then it just works.</Title>
          <p className="lede">
            Kodi 19 (Matrix) or later, on Android TV, Fire TV, LibreELEC, CoreELEC, Windows, Linux
            or macOS. The server runs on Linux, Windows, Docker and arm64.
          </p>
        </div>
        <div className="stepper">
          <LayoutGroup id="stepper">
            <ol className="step-nav">
              {STEPS.map((s, k) => (
                <li key={s.t}>
                  <button
                    type="button"
                    className={i === k ? "on" : ""}
                    aria-current={i === k ? "step" : undefined}
                    onClick={() => setI(k)}
                    data-cursor
                  >
                    {i === k && (
                      <motion.i
                        layoutId="step-bg"
                        className="step-bg"
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      />
                    )}
                    <span className="sn mono">{k + 1}</span>
                    <span className="st">
                      <b>{s.t}</b>
                      <small>{s.sub}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </LayoutGroup>
          <div className="step-pane" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {STEPS[i]?.el}
              </motion.div>
            </AnimatePresence>
            <div className="step-ctl">
              <motion.button
                type="button"
                className="btn btn-ghost sm"
                onClick={() => setI((v) => Math.max(0, v - 1))}
                disabled={i === 0}
                whileTap={{ scale: 0.95 }}
              >
                <span>Back</span>
              </motion.button>
              {i < STEPS.length - 1 ? (
                <motion.button
                  type="button"
                  className="btn btn-solid sm"
                  onClick={() => setI((v) => v + 1)}
                  whileTap={{ scale: 0.95 }}
                >
                  <span>Next</span>
                </motion.button>
              ) : (
                <Btn href={REPO} ext>
                  Read the docs on GitHub
                </Btn>
              )}
            </div>
          </div>
        </div>

        <div className="notes">
          <h3>Good to know</h3>
          <ul>
            <li>
              <b>Providers.</b> Playlists in PVR IPTV Simple Client work, including Xtream providers
              that give you an M3U link. A playlist that is a file on the device is skipped. Other
              Live TV add-ons do not reveal their stream addresses, so Vesper says it cannot record
              those.
            </li>
            <li>
              <b>Channel names match.</b> Vesper finds the channel by name; case and punctuation do
              not matter. If several match, it asks which one.
            </li>
            <li>
              <b>Live viewing stays Kodi's.</b> It uses one provider connection from the Kodi
              device; recording uses one from the server.
            </li>
            <li>
              <b>Young add-on.</b> It has been tested against a real server with a stand-in for
              Kodi, not yet on every TV and remote. If something is off,{" "}
              <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
                open an issue
              </a>
              .
            </li>
          </ul>
        </div>
      </div>
    </Section>
  );
}
