import { type ReactNode, useState } from "react";
import { FolderOpenIcon } from "../components/icons";
import { Dialog, ReleaseList } from "../components/onboarding";
import { Button, Segmented, Toggle } from "../components/ui";
import { isTvMode } from "../lib/cloud";
import { canRecord, openRecordingsFolder } from "../lib/recorder";
import { useStore } from "../lib/store";
import type { ThemeMode } from "../lib/themes";
import { CURRENT_VERSION } from "../lib/whats-new";
import { CloudSettings } from "./cloud-settings";

export const HOME_ROWS = [
  { id: "billboard", label: "Featured banner" },
  { id: "continue", label: "Continue watching" },
  { id: "recent", label: "Recently watched" },
  { id: "favourites", label: "Favourite channels" },
  { id: "live", label: "Live now" },
  { id: "top10", label: "Top 10" },
  { id: "movies", label: "New movies" },
  { id: "series", label: "Top series" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="surface divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Settings() {
  const hidden = useStore((s) => s.hiddenRows);
  const toggleRow = useStore((s) => s.toggleRow);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const recordMinutes = useStore((s) => s.recordMinutes);
  const setRecordMinutes = useStore((s) => s.setRecordMinutes);
  const providers = useStore((s) => s.providers.length);
  const channels = useStore((s) => s.channels.length);
  const movies = useStore((s) => s.movies.length);
  const shows = useStore((s) => s.shows.length);
  const setView = useStore((s) => s.setView);
  const notify = useStore((s) => s.notify);
  const [notes, setNotes] = useState(false);

  const reset = () => {
    if (
      !window.confirm(
        "Remove all sources, favourites, history and recordings from Vesper? Files already recorded stay on disk.",
      )
    )
      return;
    try {
      localStorage.removeItem("vesper");
    } catch {
      /* nothing stored */
    }
    window.location.reload();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-8 text-3xl font-bold">Settings</h1>

      <Section title="Appearance">
        <Row label="Theme" hint="System follows your Windows setting.">
          <Segmented<ThemeMode>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
            ]}
          />
        </Row>
        <Row
          label="TV mode"
          hint="Remote-friendly focus for Android TV. Turns on by itself on TV devices."
        >
          <Toggle
            label="TV mode"
            checked={isTvMode()}
            onChange={(on) => {
              try {
                localStorage.setItem("vesper.tv", on ? "1" : "0");
              } catch {
                /* the choice will not be remembered */
              }
              window.location.reload();
            }}
          />
        </Row>
      </Section>

      <Section title="Home screen">
        {HOME_ROWS.map((r) => (
          <Row key={r.id} label={r.label}>
            <Toggle
              label={r.label}
              checked={!hidden.includes(r.id)}
              onChange={() => toggleRow(r.id)}
            />
          </Row>
        ))}
      </Section>

      <Section title="Recording">
        <Row label="Default length" hint="Used by the record button in the player.">
          <Segmented
            label="Default recording length"
            value={String(recordMinutes)}
            onChange={(v) => setRecordMinutes(Number(v))}
            options={[30, 60, 120, 180].map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </Row>
        {canRecord() && (
          <Row label="Recordings folder" hint="Videos\Vesper">
            <Button
              icon={FolderOpenIcon}
              onClick={() => void openRecordingsFolder().catch((e) => notify(String(e)))}
            >
              Open
            </Button>
          </Row>
        )}
      </Section>

      <Section title="Cloud">
        <CloudSettings />
      </Section>

      <Section title="Library">
        <Row
          label="Sources"
          hint={`${providers} source${providers === 1 ? "" : "s"} · ${channels.toLocaleString()} channels · ${movies.toLocaleString()} movies · ${shows.toLocaleString()} series`}
        >
          <Button onClick={() => setView("sources")}>Manage</Button>
        </Row>
        <Row label="Reset Vesper" hint="Clears sources, favourites, history and settings.">
          <Button variant="danger" onClick={reset}>
            Reset
          </Button>
        </Row>
      </Section>

      <Section title="About">
        <Row label="Vesper" hint={`Version ${CURRENT_VERSION} · MIT licence · built with Tauri`}>
          <Button onClick={() => setNotes(true)}>What's new</Button>
        </Row>
      </Section>

      {notes && (
        <Dialog title="What's new" onClose={() => setNotes(false)}>
          <ReleaseList />
        </Dialog>
      )}
    </div>
  );
}
