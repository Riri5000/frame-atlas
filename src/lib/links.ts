// Outbound URL builders. No API calls, just URL construction.

export function imdbUrl(imdbId: string | null | undefined): string | null {
  return imdbId ? `https://www.imdb.com/title/${imdbId}` : null;
}

// Letterboxd resolves films by TMDB id directly. Only films: Letterboxd has no
// TV entries, so series get null.
export function letterboxdUrl(tmdbId: number | null | undefined, kind: string): string | null {
  if (!tmdbId || kind === "SERIES") return null;
  return `https://letterboxd.com/tmdb/${tmdbId}`;
}

export function trailerUrl(trailerKey: string | null | undefined): string | null {
  return trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null;
}

export function tmdbUrl(tmdbId: number | null | undefined, kind: string): string | null {
  if (!tmdbId) return null;
  return kind === "SERIES"
    ? `https://www.themoviedb.org/tv/${tmdbId}`
    : `https://www.themoviedb.org/movie/${tmdbId}`;
}
