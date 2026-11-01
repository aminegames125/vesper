import { useCallback, useEffect, useState } from "react";

/**
 * Two workspaces share one app. `manage` is the admin panel; `watch` is the viewer dashboard that
 * every account can open. The place is kept in the URL hash so reloads and back buttons work.
 */
export type Space = "manage" | "watch";
export interface Route {
  space: Space;
  page: string;
  /** The recording being played, for `#/watch/play/<id>`. */
  param?: string;
}

export const parse = (hash: string, fallback: Space): Route => {
  const [space, page, param] = hash.replace(/^#\/?/, "").split("/");
  if (space === "manage" || space === "watch") {
    return { space, page: page || (space === "manage" ? "overview" : "home"), param };
  }
  return { space: fallback, page: fallback === "manage" ? "overview" : "home" };
};

export const href = (space: Space, page: string, param?: string) =>
  `#/${space}/${page}${param ? `/${encodeURIComponent(param)}` : ""}`;

export function useRoute(fallback: Space) {
  const [route, setRoute] = useState(() => parse(window.location.hash, fallback));
  useEffect(() => {
    const sync = () => setRoute(parse(window.location.hash, fallback));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [fallback]);
  const go = useCallback((space: Space, page: string, param?: string) => {
    window.location.hash = href(space, page, param);
  }, []);
  return { route: { ...route, param: route.param && decodeURIComponent(route.param) }, go };
}
