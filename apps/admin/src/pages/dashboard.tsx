import { type CloudClient, formatBytes } from "@vesper/cloud-client";
import { useState } from "react";
import { useLoad } from "../hooks";
import type { Space } from "../router";
import { Badge, Button, Notice, PageHeader, Skeleton, when } from "../ui";

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line/60 py-2.5 text-sm last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="flex-none text-muted sm:w-40">{label}</dt>
      <dd className="min-w-0 flex-1 tabular">{children}</dd>
    </div>
  );
}

export function Dashboard({
  client,
  go,
}: {
  client: CloudClient;
  go: (space: Space, page: string) => void;
}) {
  const { data: stats, error } = useLoad(() => client.admin.stats(), 5000);
  const { data: status } = useLoad(() => client.status(), 15_000);
  const { data: caps } = useLoad(() => client.capabilities());
  const { data: audit } = useLoad(() => client.admin.audit(6), 10_000);
  const [copied, setCopied] = useState(false);

  if (error) return <Notice>{error}</Notice>;
  if (!stats) return <Skeleton className="h-64" />;
  const lite = stats.mode === "lite";
  const address = window.location.origin;
  const total = status?.diskTotal ?? 0;
  const used = total && status?.diskFree != null ? total - status.diskFree : 0;
  const share = total ? used / total : 0;
  const busy = stats.recordings.recording + stats.recordings.scheduled;

  return (
    <div>
      <PageHeader
        title="Overview"
        lead="The state of this server. Recording and scheduling happen in Kodi; the web is for managing and watching."
        actions={
          <>
            <Button onClick={() => go("manage", "downloads")}>Add a download</Button>
            <Button variant="primary" onClick={() => go("watch", "home")}>
              Open the viewer
            </Button>
          </>
        }
      />

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <Section title="Server">
          <dl>
            <Row label="Library">
              {stats.recordings.done} saved
              {stats.recordings.failed > 0 && `, ${stats.recordings.failed} failed`}
              {busy > 0 && `, ${busy} in progress or waiting`}
            </Row>
            <Row label="Storage used">{formatBytes(stats.storageBytes)}</Row>
            <Row label="Disk">
              {total ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    role="progressbar"
                    aria-label="Disk used"
                    aria-valuenow={Math.round(share * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 w-32 overflow-hidden rounded-sm bg-raised"
                  >
                    <span
                      className={`block h-full ${share > 0.9 ? "bg-accent" : "bg-ok"}`}
                      style={{ width: `${share * 100}%` }}
                    />
                  </span>
                  {formatBytes(status?.diskFree ?? 0)} free of {formatBytes(total)}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Room left">
              {status?.daysLeft == null
                ? "no recent pace to estimate from"
                : status.daysLeft > 365
                  ? "over a year at the recent pace"
                  : `about ${status.daysLeft} days at the recent pace`}
            </Row>
            <Row label={lite ? "Mode" : "Accounts"}>
              {lite
                ? "Lite, no accounts"
                : `${stats.users} accounts, ${stats.sessions} signed in, ${stats.suspended} suspended`}
            </Row>
            <Row label="Broken channels">{status ? status.brokenChannels.length : "—"}</Row>
          </dl>
          {status?.updateAvailable && (
            <p className="mt-3 text-sm text-accent">
              A newer Vesper is available: {status.updateAvailable}
            </p>
          )}
        </Section>

        <Section title="Tools">
          <dl>
            <Row label="ffmpeg">
              <Tool
                ok={caps?.ffmpeg}
                on="ready"
                off="missing: no thumbnails, trimming or re-encoding"
              />
            </Row>
            <Row label="yt-dlp">
              <Tool
                ok={caps?.ytdlp.available}
                on={`v${caps?.ytdlp.version}, saves YouTube and other web videos`}
                off="missing: web pages cannot be downloaded"
              />
            </Row>
            <Row label="Encoders">
              {caps
                ? `${caps.encoders.filter((e) => e.available).length} of ${caps.encoders.length} usable, default ${caps.defaultEncoder}`
                : "…"}
            </Row>
          </dl>
        </Section>

        <Section title="Connect a device">
          <p className="mb-3 max-w-prose text-sm text-muted">
            Enter this address in the Vesper Kodi add-on or the app.
            {lite
              ? " Lite mode has no passwords, so keep it on a network you trust."
              : " Sign in with an account from Users, or an invite code."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="selectable min-w-0 flex-1 truncate rounded-lg border border-line bg-sunken px-3.5 py-2.5 font-mono text-sm">
              {address}
            </code>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Section>

        <Section
          title="Latest activity"
          actions={
            <Button variant="ghost" onClick={() => go("manage", "activity")}>
              All activity
            </Button>
          }
        >
          <ul className="text-sm">
            {audit?.slice(0, 5).map((e) => (
              <li
                key={`${e.at}-${e.action}-${e.detail}`}
                className="flex items-baseline gap-3 border-b border-line/60 py-2.5 last:border-0"
              >
                <span className="w-32 flex-none text-xs text-muted tabular">{when(e.at)}</span>
                <Badge tone="dusk">{e.action}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {e.actor}
                  {e.detail ? `: ${e.detail}` : ""}
                </span>
              </li>
            ))}
            {audit && audit.length === 0 && <li className="py-2 text-muted">Nothing yet.</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Tool({ ok, on, off }: { ok: boolean | undefined; on: string; off: string }) {
  if (ok === undefined) return <span className="text-muted">…</span>;
  return <span className={ok ? "" : "text-warn"}>{ok ? on : off}</span>;
}
