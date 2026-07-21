// Fetch everything the library stores for one TMDB movie in a single pass.
// Used when approving a scan candidate into the Film table.

import {
  movieDetails,
  movieExternalIds,
  movieImages,
  movieVideos,
  movieWatchProviders,
  pickBackdrops,
  pickTrailerKey,
} from "@/lib/tmdb";

export async function fetchMovieFilmData(tmdbId: number) {
  const details = await movieDetails(tmdbId);
  const externalIds = await movieExternalIds(tmdbId);
  const images = await movieImages(tmdbId);
  const videos = await movieVideos(tmdbId);
  const providers = await movieWatchProviders(tmdbId);

  const backdrops = pickBackdrops(images, 10);
  const za = providers.results["ZA"] ?? null;

  return {
    tmdbId,
    imdbId: externalIds.imdb_id ?? null,
    title: details.title,
    year: details.release_date ? Number(details.release_date.slice(0, 4)) : null,
    runtimeMin: details.runtime ?? null,
    overview: details.overview ?? null,
    posterPath: details.poster_path ?? null,
    backdropPaths: backdrops.length > 0 ? JSON.stringify(backdrops) : null,
    trailerKey: pickTrailerKey(videos),
    watchZA: za ? JSON.stringify(za) : null,
  };
}
