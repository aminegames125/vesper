export type ThemeMode = "dark" | "light" | "system";

const query = () => window.matchMedia("(prefers-color-scheme: light)");

const resolve = (mode: ThemeMode) =>
  mode === "system" ? (query().matches ? "light" : "dark") : mode;

/** Applies the theme to <html>; returns a cleanup that stops following the system. */
export function applyTheme(mode: ThemeMode): () => void {
  const root = document.documentElement;
  const paint = () => {
    root.dataset.theme = resolve(mode);
  };
  paint();
  if (mode !== "system") return () => {};
  const media = query();
  media.addEventListener("change", paint);
  return () => media.removeEventListener("change", paint);
}
