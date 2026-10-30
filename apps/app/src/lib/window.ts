import { isDesktop } from "./fetch-text";

/** Toggles fullscreen on the app window (desktop) or the document (browser). */
export async function toggleFullscreen(): Promise<boolean> {
  if (isDesktop()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    return next;
  }
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return false;
  }
  await document.documentElement.requestFullscreen();
  return true;
}

export async function exitFullscreen(): Promise<void> {
  if (isDesktop()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(false);
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}
