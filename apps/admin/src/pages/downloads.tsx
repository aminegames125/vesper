import {
  type CloudClient,
  type CloudRecording,
  type DownloadQuality,
  formatBytes,
  formatDuration,
} from "@vesper/cloud-client";
import { type FormEvent, useState } from "react";
import { useAction, useLoad } from "../hooks";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Notice,
  PageHeader,
  Progress,
  ROW,
  Select,
} from "../ui";

const QUALITY_LABEL: Record<DownloadQuality, string> = {
  best: "Best available",
  "2160": "Up to 4K",
  "1080": "Up to 1080p",
  "720": "Up to 720p",
  "480": "Up to 480p",
  audio: "Audio only (MP3)",
};

const PAGE_HINT = /^https?:\/\/(?!.*\.(mp4|mkv|avi|mov|m4v|webm|ts)(\?|#|$))/i;

export function DownloadsPage({ client }: { client: CloudClient }) {
  const { data: caps } = useLoad(() => client.capabilities());
  const { data, error, reload } = useLoad(() => client.listRecordings({ kind: "download" }), 3000);
  const [message, setMessage] = useState<string | null>(null);
  const run = useAction(reload, setMessage);

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [quality, setQuality] = useState<DownloadQuality>("best");
  const [encoder, setEncoder] = useState("");
  const [engine, setEngine] = useState<"auto" | "direct" | "ytdlp">("auto");
  const [busy, setBusy] = useState(false);

  const ytdlp = caps?.ytdlp.available ?? false;
  const isPage = PAGE_HINT.test(url.trim());
  const usesYtdlp = engine === "ytdlp" || (engine === "auto" && isPage && ytdlp);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await client.createDownload({
        url: url.trim(),
        title: title.trim() || url.trim().slice(0, 80),
        engine,
        quality,
        ...(encoder ? { encoder } : {}),
      });
      setUrl("");
      setTitle("");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start the download.");
    } finally {
      setBusy(false);
    }
  };

  const downloads = data?.recordings ?? [];

  return (
    <div>
      <PageHeader
        title="Downloads"
        lead="Save a movie, an episode or a web video straight to the server."
      />
      <Notice>{error ?? message}</Notice>

      <Card title="New download">
        <form onSubmit={submit} className="grid gap-4 p-[var(--card-pad)] md:grid-cols-2">
          <div className="md:col-span-2">
            <Field
              label="Address"
              required
              type="url"
              placeholder="https://www.youtube.com/watch?v=… or a link to a movie file"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              hint={
                usesYtdlp
                  ? "yt-dlp will read this page, so YouTube, Twitch, Vimeo and many other sites work."
                  : url
                    ? "This looks like a file, so it is fetched directly and resumes if the connection drops."
                    : undefined
              }
            />
          </div>
          <Field
            label="Title"
            placeholder="Shown in your library"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select
            label="Method"
            value={engine}
            onChange={(e) => setEngine(e.target.value as typeof engine)}
          >
            <option value="auto">Automatic</option>
            <option value="direct">Direct file</option>
            <option value="ytdlp" disabled={!ytdlp}>
              yt-dlp (web pages){ytdlp ? "" : " — not installed"}
            </option>
          </Select>
          <Select
            label="Encoder"
            value={encoder}
            onChange={(e) => setEncoder(e.target.value)}
            hint="Re-encoding takes time and a lot of CPU. Original keeps the file untouched."
          >
            <option value="">Server default ({caps?.defaultEncoder ?? "copy"})</option>
            {caps?.encoders.map((enc) => (
              <option key={enc.id} value={enc.id} disabled={!enc.available}>
                {enc.label}
                {enc.available ? "" : " — not available"}
              </option>
            ))}
          </Select>
          <Select
            label="Quality"
            value={quality}
            disabled={!usesYtdlp}
            onChange={(e) => setQuality(e.target.value as DownloadQuality)}
            hint={usesYtdlp ? undefined : "Quality choices apply to pages read by yt-dlp."}
          >
            {(caps?.qualities ?? ["best"]).map((q) => (
              <option key={q} value={q}>
                {QUALITY_LABEL[q]}
              </option>
            ))}
          </Select>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary" disabled={busy || !url.trim()}>
              {busy ? "Starting…" : "Start download"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={`${downloads.length} downloads`}>
        {data && downloads.length === 0 && (
          <Empty>Nothing downloaded yet. Paste an address above to begin.</Empty>
        )}
        <ul className="divide-y divide-line">
          {downloads.map((d) => (
            <DownloadRow key={d.id} d={d} client={client} run={run} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function DownloadRow({
  d,
  client,
  run,
}: {
  d: CloudRecording;
  client: CloudClient;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const active = d.status === "recording" || d.status === "queued";
  const share = d.totalBytes ? d.bytes / d.totalBytes : 0;
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="truncate">{d.title}</span>
          <Badge tone={d.status === "failed" ? "accent" : d.status === "done" ? "ok" : "muted"}>
            {d.status === "recording" ? "downloading" : d.status}
          </Badge>
          <Badge tone="dusk">{d.engine === "ytdlp" ? "yt-dlp" : "direct"}</Badge>
          {d.encoder !== "copy" && <Badge>{d.encoder}</Badge>}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {formatBytes(d.bytes)}
          {d.totalBytes ? ` of ${formatBytes(d.totalBytes)}` : ""}
          {active ? ` · ${formatDuration(d.seconds)} elapsed` : ""}
        </p>
        {d.status === "recording" && d.totalBytes ? (
          <div className="mt-2 max-w-md">
            <Progress value={share} />
          </div>
        ) : null}
        {d.error && <p className="mt-0.5 text-sm text-accent">{d.error}</p>}
      </div>
      {active && <Button onClick={() => void run(() => client.stopRecording(d.id))}>Stop</Button>}
      <Button
        variant="danger"
        onClick={() => {
          if (window.confirm(`Delete "${d.title}"?`)) void run(() => client.deleteRecording(d.id));
        }}
      >
        Delete
      </Button>
    </li>
  );
}
