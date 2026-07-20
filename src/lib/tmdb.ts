// Typed TMDB v3 client. Every external call in the app goes through here so
// rate limiting lives in one place. TMDB allows ~50 req/s; we stay nowhere
// near it (one request every 150ms, serialized).

const BASE = "https://api.themoviedb.org/3";
const MIN_GAP_MS = 150;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function apiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error("TMDB_API_KEY is not set. Add it to .env at the project root.");
  }
  return key;
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  return fetch(url);
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const run = async (): Promise<T> => {
    const url = new URL(BASE + path);
    url.searchParams.set("api_key", apiKey());
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await rateLimitedFetch(url.toString());
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        continue;
      }
      if (!res.ok) {
        throw new Error(`TMDB ${res.status} for ${path}: ${await res.text()}`);
      }
      return (await res.json()) as T;
    }
    throw new Error(`TMDB rate limited three times in a row for ${path}`);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

// --- Types (only the fields we use) ---

export interface MovieSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_count?: number;
  genre_ids?: number[];
}

export interface TvSearchResult {
  id: number;
  name: string;
  original_name: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_count?: number;
  genre_ids?: number[];
}

export interface SearchPage<T> {
  page: number;
  results: T[];
  total_results: number;
}

export interface MovieDetails {
  id: number;
  title: string;
  release_date?: string;
  runtime?: number | null;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

export interface TvDetails {
  id: number;
  name: string;
  first_air_date?: string;
  episode_run_time?: number[];
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
}

export interface ExternalIds {
  imdb_id?: string | null;
}

export interface VideosResponse {
  results: Array<{
    key: string;
    site: string;
    type: string;
    official?: boolean;
    name?: string;
  }>;
}

export interface ImagesResponse {
  backdrops: Array<{ file_path: string; width: number; height: number; vote_count?: number }>;
  posters: Array<{ file_path: string }>;
}

export interface WatchProvidersResponse {
  results: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{ provider_name: string; logo_path?: string }>;
      rent?: Array<{ provider_name: string; logo_path?: string }>;
      buy?: Array<{ provider_name: string; logo_path?: string }>;
      free?: Array<{ provider_name: string; logo_path?: string }>;
    }
  >;
}

export interface DiscoverMovieResult extends MovieSearchResult {}

// --- Search ---

export function searchMovie(query: string, year?: number | null) {
  return get<SearchPage<MovieSearchResult>>("/search/movie", {
    query,
    primary_release_year: year ?? undefined,
    include_adult: "false",
  });
}

export function searchTv(query: string, year?: number | null) {
  return get<SearchPage<TvSearchResult>>("/search/tv", {
    query,
    first_air_date_year: year ?? undefined,
    include_adult: "false",
  });
}

// --- Movie endpoints ---

export function movieDetails(id: number) {
  return get<MovieDetails>(`/movie/${id}`);
}

export function movieExternalIds(id: number) {
  return get<ExternalIds>(`/movie/${id}/external_ids`);
}

export function movieVideos(id: number) {
  return get<VideosResponse>(`/movie/${id}/videos`);
}

export function movieImages(id: number) {
  return get<ImagesResponse>(`/movie/${id}/images`, { include_image_language: "en,null" });
}

export function movieWatchProviders(id: number) {
  return get<WatchProvidersResponse>(`/movie/${id}/watch/providers`);
}

// --- TV endpoints (series entries like The Jinx, Wormwood, The Up Series) ---

export function tvDetails(id: number) {
  return get<TvDetails>(`/tv/${id}`);
}

export function tvExternalIds(id: number) {
  return get<ExternalIds>(`/tv/${id}/external_ids`);
}

export function tvVideos(id: number) {
  return get<VideosResponse>(`/tv/${id}/videos`);
}

export function tvImages(id: number) {
  return get<ImagesResponse>(`/tv/${id}/images`, { include_image_language: "en,null" });
}

export function tvWatchProviders(id: number) {
  return get<WatchProvidersResponse>(`/tv/${id}/watch/providers`);
}

// --- Discover (scanner, Phase 3) ---

export function discoverDocumentaries(params: { fromDate: string; page?: number }) {
  return get<SearchPage<DiscoverMovieResult>>("/discover/movie", {
    with_genres: "99",
    sort_by: "primary_release_date.desc",
    "primary_release_date.gte": params.fromDate,
    page: params.page ?? 1,
    include_adult: "false",
  });
}

// --- Helpers ---

export function pickTrailerKey(videos: VideosResponse): string | null {
  const yt = videos.results.filter((v) => v.site === "YouTube");
  const official = yt.find((v) => v.type === "Trailer" && v.official);
  const anyTrailer = yt.find((v) => v.type === "Trailer");
  const teaser = yt.find((v) => v.type === "Teaser");
  return (official ?? anyTrailer ?? teaser ?? yt[0])?.key ?? null;
}

export function pickBackdrops(images: ImagesResponse, max = 10): string[] {
  return images.backdrops
    .slice()
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, max)
    .map((b) => b.file_path);
}

export function imageUrl(path: string, size: "w500" | "w780" | "w1280" | "original" = "w780"): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
