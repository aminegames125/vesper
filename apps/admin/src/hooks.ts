import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data on mount and, optionally, every `every` milliseconds. */
export function useLoad<T>(load: () => Promise<T>, every?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loader.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!every) return;
    const timer = setInterval(() => void reload(), every);
    return () => clearInterval(timer);
  }, [reload, every]);

  return { data, error, reload };
}

/** Runs an action, reporting failure through `onError`, then reloads. */
export function useAction(reload: () => Promise<void>, onError: (message: string) => void) {
  return useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await reload();
      } catch (e) {
        onError(e instanceof Error ? e.message : "That did not work.");
      }
    },
    [reload, onError],
  );
}
