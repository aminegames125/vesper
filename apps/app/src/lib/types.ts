export interface XtreamAuth {
  host: string;
  username: string;
  password: string;
}

export interface AccountInfo {
  active: boolean;
  trial: boolean;
  /** Epoch seconds; undefined for unlimited accounts. */
  expires?: number;
  maxConnections: number;
  activeConnections: number;
}

export interface Provider {
  id: string;
  name: string;
  kind: "m3u" | "xtream";
  addedAt: number;
  /** M3U playlist link. */
  url?: string;
  xtream?: XtreamAuth;
  account?: AccountInfo;
}

export interface Channel {
  id: string;
  providerId: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  /** Xtream only. */
  streamId?: number;
  /** Days of catch-up the provider keeps; 0 or undefined means none. */
  archiveDays?: number;
}

export interface Movie {
  id: string;
  providerId: string;
  streamId: number;
  name: string;
  group: string;
  poster?: string;
  rating?: number;
  extension: string;
  addedAt?: number;
}

export interface Show {
  id: string;
  providerId: string;
  seriesId: number;
  name: string;
  group: string;
  cover?: string;
  plot?: string;
  rating?: number;
  year?: string;
}

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  plot?: string;
  image?: string;
  duration?: string;
  url: string;
}

/** One TV guide entry. Times are epoch seconds. */
export interface Programme {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
  /** The provider's own start time string, needed to build catch-up links. */
  startRaw: string;
  hasArchive: boolean;
}

/** Anything the player can open. */
export interface Playable {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  live: boolean;
  poster?: string;
  channel?: Channel;
}

/** A programme the viewer asked to have recorded when it starts. Times are epoch seconds. */
export interface Scheduled {
  id: string;
  title: string;
  channel: Channel;
  start: number;
  end: number;
}

export interface Recording {
  id: string;
  title: string;
  channelName: string;
  startedAt: number;
  seconds: number;
  path?: string;
  bytes?: number;
  error?: string;
  status: "recording" | "done" | "failed";
}
