import { fetchText } from "./fetch-text";
import { parseM3U } from "./m3u";
import type { Channel, Movie, Provider, Show } from "./types";
import { getLiveChannels, getMovies, getShows } from "./xtream";

export interface Library {
  channels: Channel[];
  movies: Movie[];
  shows: Show[];
  errors: string[];
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function loadProvider(provider: Provider): Promise<Library> {
  const library: Library = { channels: [], movies: [], shows: [], errors: [] };

  if (provider.kind === "m3u" && provider.url) {
    library.channels = parseM3U(await fetchText(provider.url), provider.id);
    return library;
  }

  const auth = provider.xtream;
  if (!auth) return library;

  // A provider without movies or series should still give us its live channels.
  const [live, movies, shows] = await Promise.allSettled([
    getLiveChannels(auth, provider.id),
    getMovies(auth, provider.id),
    getShows(auth, provider.id),
  ]);
  if (live.status === "fulfilled") library.channels = live.value;
  else library.errors.push(`${provider.name}: ${message(live.reason)}`);
  if (movies.status === "fulfilled") library.movies = movies.value;
  if (shows.status === "fulfilled") library.shows = shows.value;
  return library;
}

export async function loadLibrary(providers: Provider[]): Promise<Library> {
  const results = await Promise.allSettled(providers.map(loadProvider));
  const library: Library = { channels: [], movies: [], shows: [], errors: [] };
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      library.errors.push(`${providers[i]?.name}: ${message(result.reason)}`);
      return;
    }
    library.channels.push(...result.value.channels);
    library.movies.push(...result.value.movies);
    library.shows.push(...result.value.shows);
    library.errors.push(...result.value.errors);
  });
  return library;
}
