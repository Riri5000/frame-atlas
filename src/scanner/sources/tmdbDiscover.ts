// New documentaries via TMDB discover: genre 99, released in the recent
// window, newest first.

import { discoverDocumentaries } from "@/lib/tmdb";
import type { SourceCandidate } from "../types";

const WINDOW_DAYS = 120;
const PAGES = 3;

export async function tmdbDiscoverSource(): Promise<SourceCandidate[]> {
  const from = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fromDate = from.toISOString().slice(0, 10);

  const out: SourceCandidate[] = [];
  for (let page = 1; page <= PAGES; page++) {
    const results = await discoverDocumentaries({ fromDate, page });
    for (const r of results.results) {
      // Skip entries with no synopsis at all; the tagger has nothing to work
      // with and they are usually stub records.
      if (!r.overview) continue;
      out.push({
        tmdbId: r.id,
        title: r.title,
        year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
        overview: r.overview,
        sourceUrl: `https://www.themoviedb.org/movie/${r.id}`,
        sourceName: "TMDB discover",
      });
    }
    if (results.results.length === 0) break;
  }
  return out;
}
