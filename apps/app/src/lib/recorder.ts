import { useEffect } from "react";
import { isDesktop } from "./fetch-text";
import { useStore } from "./store";
import type { Channel } from "./types";

interface Finished {
  id: string;
  ok: boolean;
  bytes: number;
  error: string | null;
}

interface Progress {
  id: string;
  bytes: number;
  elapsed: number;
}

/** Recording runs in the desktop app; the browser build cannot write files. */
export const canRecord = isDesktop;

const invoke = async <T>(command: string, args?: Record<string, unknown>) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
};

export const stopRecording = (id: string) => invoke<void>("stop_recording", { id });
export const revealRecording = (path: string) => invoke<void>("reveal_recording", { path });
export const openRecordingsFolder = () => invoke<void>("open_recordings_folder");
export const deleteRecordingFile = (path: string) =>
  invoke<void>("delete_recording_file", { path });

/** Starts a recording and adds it to the list. Resolves with an error message, or null on success. */
export async function beginRecording(
  title: string,
  channelName: string,
  url: string,
  seconds: number,
): Promise<string | null> {
  const { addRecording, notify } = useStore.getState();
  const id = crypto.randomUUID();
  try {
    const path = await invoke<string>("start_recording", { id, url, title, seconds });
    addRecording({
      id,
      title,
      channelName,
      startedAt: Date.now(),
      seconds,
      path,
      status: "recording",
    });
    notify(`Recording “${title}”`);
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    notify(`Could not record: ${message}`);
    return message;
  }
}

/** Keeps recording statuses in sync with the desktop shell, wherever the user is in the app. */
export function useRecordingEvents() {
  useEffect(() => {
    if (!canRecord()) return;
    const unlisten: (() => void)[] = [];
    let alive = true;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const done = await listen<Finished>("recording-finished", ({ payload }) => {
        const { updateRecording, notify, recordings } = useStore.getState();
        updateRecording(payload.id, {
          status: payload.ok ? "done" : "failed",
          bytes: payload.bytes,
          error: payload.error ?? undefined,
        });
        const title = recordings.find((r) => r.id === payload.id)?.title ?? "Recording";
        notify(
          payload.ok
            ? `Saved “${title}”`
            : `Recording failed: ${payload.error ?? "nothing was captured"}`,
        );
      });
      const progress = await listen<Progress>("recording-progress", ({ payload }) =>
        useStore.getState().updateRecording(payload.id, { bytes: payload.bytes }),
      );
      if (alive) unlisten.push(done, progress);
      else {
        done();
        progress();
      }
    })();
    return () => {
      alive = false;
      for (const fn of unlisten) fn();
    };
  }, []);
}

/** Starts scheduled recordings when their time comes, as long as the app is open. */
export function useScheduler() {
  useEffect(() => {
    if (!canRecord()) return;
    const timer = setInterval(() => {
      const { scheduled, removeScheduled } = useStore.getState();
      const now = Date.now() / 1000;
      for (const entry of scheduled) {
        if (entry.start > now) continue;
        removeScheduled(entry.id);
        if (entry.end <= now) continue;
        const seconds = Math.ceil(entry.end - now) + 60;
        void beginRecording(
          entry.title,
          (entry.channel as Channel).name,
          entry.channel.url,
          seconds,
        );
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, []);
}
