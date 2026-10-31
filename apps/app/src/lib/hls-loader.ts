import {
  type Loader,
  type LoaderCallbacks,
  type LoaderConfiguration,
  type LoaderContext,
  LoadStats,
} from "hls.js";

/**
 * hls.js loader that goes through the desktop shell's native HTTP client.
 * The webview would otherwise block most IPTV hosts, which send no CORS headers.
 */
export class NativeLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats = new LoadStats();
  private controller: AbortController | null = null;

  destroy() {
    this.abort();
    this.context = null;
  }

  abort() {
    this.stats.aborted = true;
    this.controller?.abort();
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.context = context;
    this.stats = new LoadStats();
    const stats = this.stats;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = config.loadPolicy.maxLoadTimeMs || config.timeout || 20_000;
    const timer = setTimeout(() => controller.abort("timeout"), timeout);
    stats.loading.start = performance.now();

    const headers: Record<string, string> = { ...context.headers };
    if (context.rangeStart !== undefined && context.rangeEnd !== undefined) {
      headers.Range = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`;
    }

    void (async () => {
      try {
        const { fetch } = await import("@tauri-apps/plugin-http");
        const response = await fetch(context.url, { headers, signal: controller.signal });
        stats.loading.first = performance.now();
        if (!response.ok) {
          callbacks.onError(
            { code: response.status, text: response.statusText },
            context,
            null,
            stats,
          );
          return;
        }
        const binary = context.responseType === "arraybuffer";
        const data = binary ? await response.arrayBuffer() : await response.text();
        stats.loading.end = performance.now();
        stats.loaded = stats.total = binary
          ? (data as ArrayBuffer).byteLength
          : (data as string).length;
        callbacks.onSuccess(
          { url: response.url || context.url, data, code: response.status },
          stats,
          context,
          response,
        );
      } catch (e) {
        if (stats.aborted) {
          callbacks.onAbort?.(stats, context, null);
        } else if (controller.signal.reason === "timeout") {
          callbacks.onTimeout(stats, context, null);
        } else {
          callbacks.onError({ code: 0, text: String(e) }, context, null, stats);
        }
      } finally {
        clearTimeout(timer);
      }
    })();
  }
}
