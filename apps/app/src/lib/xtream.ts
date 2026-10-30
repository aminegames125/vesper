import { toProgramme } from "./epg";
import { fetchJson } from "./fetch-text";
import type { AccountInfo, Channel, Episode, Movie, Programme, Show, XtreamAuth } from "./types";

export const normalizeHost = (host: string) => {
  const trimmed = host.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const call = <T>(auth: XtreamAuth, action?: string, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    username: auth.username,
    password: auth.password,
    ...(action ? { action } : {}),
    ...extra,
  });
  return fetchJson<T>(`${normalizeHost(auth.host)}/player_api.php?${params}`);
};

// ---- stream links -----------------------------------------------------------

const base = (a: XtreamAuth) => `${normalizeHost(a.host)}`;
const creds = (a: XtreamAuth) => `${a.username}/${a.password}`;

export const liveUrl = (a: XtreamAuth, streamId: number) =>
  `${base(a)}/live/${creds(a)}/${streamId}.m3u8`;

export const movieUrl = (a: XtreamAuth, streamId: number, extension: string) =>
  `${base(a)}/movie/${creds(a)}/${streamId}.${extension}`;

export const episodeUrl = (a: XtreamAuth, episodeId: string, extension: string) =>
  `${base(a)}/series/${creds(a)}/${episodeId}.${extension}`;

/** Catch-up link. `startRaw` is the guide's own "YYYY-MM-DD HH:mm:ss" string, which is in server time. */
export function catchupUrl(a: XtreamAuth, streamId: number, startRaw: string, seconds: number) {
  const [date = "", time = ""] = startRaw.split(" ");
  const stamp = `${date}:${time.slice(0, 5).replace(":", "-")}`;
  return `${base(a)}/timeshift/${creds(a)}/${Math.ceil(seconds / 60)}/${stamp}/${streamId}.m3u8`;
}

// ---- account ----------------------------------------------------------------

interface RawAccount {
  user_info?: {
    auth?: number | string;
    status?: string;
    is_trial?: string | number;
    exp_date?: string | number | null;
    max_connections?: string | number;
    active_cons?: string | number;
  };
}

/** Verifies credentials and returns account details. Throws on bad credentials. */
export async function getAccount(auth: XtreamAuth): Promise<AccountInfo> {
  const info = (await call<RawAccount>(auth)).user_info;
  if (!info || Number(info.auth) === 0) throw new Error("The server rejected these credentials.");
  const expires = Number(info.exp_date);
  return {
    active: info.status === "Active",
    trial: Number(info.is_trial) === 1,
    expires: expires > 0 ? expires : undefined,
    maxConnections: Number(info.max_connections) || 1,
    activeConnections: Number(info.active_cons) || 0,
  };
}

// ---- catalogue --------------------------------------------------------------

interface Category {
  category_id: string;
  category_name: string;
}

const categoryNames = (list: Category[] | undefined) =>
  new Map((Array.isArray(list) ? list : []).map((c) => [String(c.category_id), c.category_name]));

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const settled = async <T>(promise: Promise<T>, fallback: T): Promise<T> =>
  promise.catch(() => fallback);

interface RawLive {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  category_id?: string | number;
  epg_channel_id?: string;
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
}

export async function getLiveChannels(auth: XtreamAuth, providerId: string): Promise<Channel[]> {
  const [cats, streams] = await Promise.all([
    settled(call<Category[]>(auth, "get_live_categories"), []),
    call<RawLive[]>(auth, "get_live_streams"),
  ]);
  const names = categoryNames(cats);
  return asList<RawLive>(streams).map((s) => {
    const streamId = Number(s.stream_id);
    return {
      id: `${providerId}:live:${streamId}`,
      providerId,
      streamId,
      name: s.name,
      group: names.get(String(s.category_id)) ?? "Other",
      logo: s.stream_icon || undefined,
      tvgId: s.epg_channel_id || undefined,
      url: liveUrl(auth, streamId),
      archiveDays: Number(s.tv_archive) === 1 ? Number(s.tv_archive_duration) || 0 : 0,
    };
  });
}

interface RawMovie {
  stream_id: number | string;
  name: string;
  stream_icon?: string;
  rating?: string | number;
  category_id?: string | number;
  container_extension?: string;
  added?: string | number;
}

export async function getMovies(auth: XtreamAuth, providerId: string): Promise<Movie[]> {
  const [cats, streams] = await Promise.all([
    settled(call<Category[]>(auth, "get_vod_categories"), []),
    call<RawMovie[]>(auth, "get_vod_streams"),
  ]);
  const names = categoryNames(cats);
  return asList<RawMovie>(streams).map((m) => ({
    id: `${providerId}:movie:${m.stream_id}`,
    providerId,
    streamId: Number(m.stream_id),
    name: m.name,
    group: names.get(String(m.category_id)) ?? "Other",
    poster: m.stream_icon || undefined,
    rating: Number(m.rating) || undefined,
    extension: m.container_extension || "mp4",
    addedAt: Number(m.added) || undefined,
  }));
}

interface RawShow {
  series_id: number | string;
  name: string;
  cover?: string;
  plot?: string;
  rating?: string | number;
  category_id?: string | number;
  releaseDate?: string;
  release_date?: string;
}

export async function getShows(auth: XtreamAuth, providerId: string): Promise<Show[]> {
  const [cats, series] = await Promise.all([
    settled(call<Category[]>(auth, "get_series_categories"), []),
    call<RawShow[]>(auth, "get_series"),
  ]);
  const names = categoryNames(cats);
  return asList<RawShow>(series).map((s) => ({
    id: `${providerId}:show:${s.series_id}`,
    providerId,
    seriesId: Number(s.series_id),
    name: s.name,
    group: names.get(String(s.category_id)) ?? "Other",
    cover: s.cover || undefined,
    plot: s.plot || undefined,
    rating: Number(s.rating) || undefined,
    year: (s.releaseDate ?? s.release_date)?.slice(0, 4),
  }));
}

// ---- detail -----------------------------------------------------------------

export interface MovieDetail {
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  duration?: string;
  year?: string;
  backdrop?: string;
}

interface RawVodInfo {
  info?: {
    plot?: string;
    description?: string;
    cast?: string;
    actors?: string;
    director?: string;
    genre?: string;
    duration?: string;
    releasedate?: string;
    release_date?: string;
    backdrop_path?: string[] | string;
  };
}

export async function getMovieDetail(auth: XtreamAuth, streamId: number): Promise<MovieDetail> {
  const info = (await call<RawVodInfo>(auth, "get_vod_info", { vod_id: String(streamId) })).info;
  const backdrop = Array.isArray(info?.backdrop_path)
    ? info?.backdrop_path[0]
    : info?.backdrop_path;
  return {
    plot: info?.plot ?? info?.description,
    cast: info?.cast ?? info?.actors,
    director: info?.director,
    genre: info?.genre,
    duration: info?.duration,
    year: (info?.releasedate ?? info?.release_date)?.slice(0, 4),
    backdrop: backdrop || undefined,
  };
}

interface RawEpisode {
  id: string | number;
  title?: string;
  episode_num?: number | string;
  season?: number | string;
  container_extension?: string;
  info?: { plot?: string; duration?: string; movie_image?: string };
}

export interface ShowDetail {
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  year?: string;
  backdrop?: string;
}

interface RawSeriesInfo {
  info?: {
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    release_date?: string;
    backdrop_path?: string[] | string;
  };
  episodes?: Record<string, RawEpisode[]> | RawEpisode[];
}

export async function getShow(
  auth: XtreamAuth,
  seriesId: number,
): Promise<{ detail: ShowDetail; episodes: Episode[] }> {
  const data = await call<RawSeriesInfo>(auth, "get_series_info", { series_id: String(seriesId) });
  const info = data.info;
  const backdrop = Array.isArray(info?.backdrop_path)
    ? info?.backdrop_path[0]
    : info?.backdrop_path;
  const seasons = Array.isArray(data.episodes) ? { "1": data.episodes } : (data.episodes ?? {});
  const episodes = Object.entries(seasons)
    .flatMap(([season, list]) =>
      asList<RawEpisode>(list).map((e) => ({
        id: String(e.id),
        season: Number(e.season ?? season) || 1,
        number: Number(e.episode_num) || 0,
        title: e.title ?? `Episode ${e.episode_num}`,
        plot: e.info?.plot,
        image: e.info?.movie_image,
        duration: e.info?.duration,
        url: episodeUrl(auth, String(e.id), e.container_extension || "mp4"),
      })),
    )
    .sort((a, b) => a.season - b.season || a.number - b.number);
  return {
    detail: {
      plot: info?.plot,
      cast: info?.cast,
      director: info?.director,
      genre: info?.genre,
      year: (info?.releaseDate ?? info?.release_date)?.slice(0, 4),
      backdrop: backdrop || undefined,
    },
    episodes,
  };
}

// ---- guide ------------------------------------------------------------------

interface RawEpg {
  epg_listings?: unknown;
}

export async function getShortGuide(
  auth: XtreamAuth,
  streamId: number,
  limit = 8,
): Promise<Programme[]> {
  const data = await call<RawEpg>(auth, "get_short_epg", {
    stream_id: String(streamId),
    limit: String(limit),
  });
  return asList<Parameters<typeof toProgramme>[0]>(data.epg_listings).map(toProgramme);
}

export async function getFullGuide(auth: XtreamAuth, streamId: number): Promise<Programme[]> {
  const data = await call<RawEpg>(auth, "get_simple_data_table", { stream_id: String(streamId) });
  return asList<Parameters<typeof toProgramme>[0]>(data.epg_listings).map(toProgramme);
}
