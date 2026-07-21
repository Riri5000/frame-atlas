// Trade press RSS. Headlines mention films in quotes; we extract quoted
// titles and keep only those that resolve to a TMDB documentary, so article
// noise never reaches the queue.

import { searchMovie } from "@/lib/tmdb";
import type { SourceCandidate } from "../types";

const FEEDS: Array<{ name: string; url: string }> = [
  // RealScreen sits behind bot protection (returns 202 with an empty body to
  // non-browser clients); kept in the list so it starts working if that lifts.
  { name: "RealScreen", url: "https://realscreen.com/feed/" },
  { name: "Documentary magazine", url: "https://www.documentary.org/rss.xml" },
  { name: "IndieWire", url: "https://www.indiewire.com/t/documentary/feed/" },
];

const DOCUMENTARY_GENRE = 99;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

type FeedItem = { title: string; link: string | null };

function parseRssItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    if (!titleMatch) continue;
    items.push({
      title: decodeEntities(titleMatch[1]).trim(),
      link: linkMatch ? decodeEntities(linkMatch[1]).trim() : null,
    });
  }
  return items;
}

// Quoted spans in trade press headlines are nearly always titles:
// 'Title', "Title", or curly-quote variants.
function extractQuotedTitles(headline: string): string[] {
  const out: string[] = [];
  const patterns = [/'([^']{2,80})'/g, /"([^"]{2,80})"/g, /‘([^’]{2,80})’/g, /“([^”]{2,80})”/g];
  for (const re of patterns) {
    for (const m of headline.matchAll(re)) out.push(m[1].trim());
  }
  return Array.from(new Set(out));
}

export async function pressSource(): Promise<SourceCandidate[]> {
  const out: SourceCandidate[] = [];
  const seenTitles = new Set<string>();

  for (const feed of FEEDS) {
    let xml: string;
    try {
      const res = await fetch(feed.url, {
        headers: { "user-agent": "frame-atlas/0.1 (personal documentary library)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      xml = await res.text();
    } catch (err) {
      console.warn(`press: skipping ${feed.name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    for (const item of parseRssItems(xml).slice(0, 25)) {
      for (const quoted of extractQuotedTitles(item.title)) {
        const norm = quoted.toLowerCase();
        if (seenTitles.has(norm)) continue;
        seenTitles.add(norm);

        // Keep only quoted titles that resolve to a TMDB documentary.
        try {
          const search = await searchMovie(quoted);
          const hit = search.results.find(
            (r) =>
              r.title.toLowerCase() === norm &&
              (r.genre_ids ?? []).includes(DOCUMENTARY_GENRE)
          );
          if (!hit) continue;
          out.push({
            tmdbId: hit.id,
            title: hit.title,
            year: hit.release_date ? Number(hit.release_date.slice(0, 4)) : null,
            overview: hit.overview ?? null,
            sourceUrl: item.link,
            sourceName: feed.name,
          });
        } catch {
          // TMDB hiccup on one lookup should not kill the whole feed.
        }
      }
    }
  }
  return out;
}
