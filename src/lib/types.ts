// Serializable shapes passed from server components to client components.

export type LibraryFilm = {
  id: number;
  tmdbId: number | null;
  imdbId: string | null;
  kind: string;
  title: string;
  year: number | null;
  director: string | null;
  watchFirst: boolean;
  seen: boolean;
  posterPath: string | null;
  backdrop: string | null; // first backdrop path, if any
  trailerKey: string | null;
  tagKeys: string[];
};

export type FilterTag = {
  key: string;
  name: string;
  count: number;
};

export type FilterGroup = {
  key: string;
  name: string;
  tags: FilterTag[];
};

export function tmdbImage(path: string, size: "w342" | "w780" | "w1280" | "original"): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
