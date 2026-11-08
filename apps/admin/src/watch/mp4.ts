import type { CloudClient, CloudRecording } from "@vesper/cloud-client";

const converting = new Set<string>();

/** True while this recording is being converted, so a second press does not start it again. */
export const isConverting = (id: string) => converting.has(id);

/**
 * Converts a finished recording to one MP4 on the server, then hands it to the browser as an
 * ordinary download. The conversion is cached on the server, so asking again is instant.
 */
export async function downloadMp4(
  client: CloudClient,
  rec: CloudRecording,
  media: string | null,
  say: (text: string, tone?: "error") => void,
): Promise<void> {
  if (converting.has(rec.id)) return;
  converting.add(rec.id);
  say("Converting to MP4. A long recording can take a few minutes; keep this page open.");
  try {
    await client.exportRecording(rec.id);
    const link = document.createElement("a");
    link.href = client.exportUrl(rec.id, media ?? "");
    link.download = `${rec.title}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    say("Your download is starting.");
  } catch (e) {
    say(e instanceof Error ? e.message : "Could not convert it.", "error");
  } finally {
    converting.delete(rec.id);
  }
}
