const TIMEOUT_MS = 20_000;

export const isDesktop = () => "__TAURI_INTERNALS__" in window;

/** Inside the desktop shell requests go through the native HTTP client, so hosts without CORS headers still work. */
async function request(url: string): Promise<Response> {
  const doFetch = isDesktop() ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
  const response = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Server answered ${response.status}`);
  return response;
}

export async function fetchText(url: string): Promise<string> {
  return (await request(url)).text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return (await request(url)).json() as Promise<T>;
}
