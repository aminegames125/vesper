import { useStore } from "./store";
import type { Channel, Episode, Movie, Playable, Programme, Show, XtreamAuth } from "./types";
import { catchupUrl, movieUrl } from "./xtream";

/** Xtream login for a provider, or undefined for M3U sources. */
export const useAuth = (providerId: string | undefined): XtreamAuth | undefined =>
  useStore((s) => s.providers.find((p) => p.id === providerId)?.xtream);

export const channelPlayable = (channel: Channel): Playable => ({
  id: channel.id,
  title: channel.name,
  subtitle: channel.group,
  url: channel.url,
  live: true,
  poster: channel.logo,
  channel,
});

export const moviePlayable = (movie: Movie, auth: XtreamAuth): Playable => ({
  id: movie.id,
  title: movie.name,
  subtitle: movie.group,
  url: movieUrl(auth, movie.streamId, movie.extension),
  live: false,
  poster: movie.poster,
});

export const episodePlayable = (show: Show, episode: Episode, following?: Episode): Playable => ({
  id: `${show.id}:${episode.id}`,
  title: `${show.name} · S${episode.season} E${episode.number}`,
  subtitle: episode.title,
  url: episode.url,
  live: false,
  poster: episode.image ?? show.cover,
  next: following ? episodePlayable(show, following) : undefined,
});

export const catchupPlayable = (
  channel: Channel,
  programme: Programme,
  auth: XtreamAuth,
): Playable => ({
  id: `${channel.id}:${programme.start}`,
  title: programme.title,
  subtitle: channel.name,
  url: catchupUrl(auth, channel.streamId ?? 0, programme.startRaw, programme.end - programme.start),
  live: false,
  poster: channel.logo,
});
