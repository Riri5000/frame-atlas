// Seed the Film table from data/atlas-films.json (the curated extraction of
// the Documentary Form Atlas), matching each entry to TMDB.
//
// Matching behavior:
//   - Confident matches (normalized title match, year within 1) are accepted
//     automatically.
//   - Ambiguous matches: if running in a terminal, candidates are listed and
//     you pick one. If not interactive, the entry is skipped and recorded in
//     data/match-report.json so it can be resolved via data/match-overrides.json
//     and the script re-run.
//   - data/match-overrides.json maps "Title (year)" -> tmdbId (number), or null
//     to create the row without a TMDB id.
//
// Idempotent: rows are keyed by tmdbId (or title+year for manual entries);
// re-running updates rather than duplicates.

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { prisma } from "../src/lib/db";
import {
  searchMovie,
  searchTv,
  movieDetails,
  movieExternalIds,
  tvDetails,
  tvExternalIds,
  type MovieSearchResult,
  type TvSearchResult,
} from "../src/lib/tmdb";

const DATA_DIR = join(__dirname, "..", "data");
const FILMS_PATH = join(DATA_DIR, "atlas-films.json");
const OVERRIDES_PATH = join(DATA_DIR, "match-overrides.json");
const REPORT_PATH = join(DATA_DIR, "match-report.json");

interface AtlasFilm {
  title: string;
  year: number | null;
  director: string | null;
  kind: "FILM" | "SERIES" | "BODY_OF_WORK" | "INSTITUTION";
  tags: string[];
  watchFirst: boolean;
  formalNote: string;
  search?: { query: string; year: number | null };
  noTmdb?: boolean;
}

interface Candidate {
  id: number;
  title: string;
  year: number | null;
  overview: string;
  voteCount: number;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function yearOf(date: string | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function toCandidates(results: Array<MovieSearchResult | TvSearchResult>): Candidate[] {
  return results.map((r) => ({
    id: r.id,
    title: "title" in r ? r.title : r.name,
    year: yearOf("release_date" in r ? r.release_date : (r as TvSearchResult).first_air_date),
    overview: r.overview ?? "",
    voteCount: r.vote_count ?? 0,
  }));
}

function overrideKey(film: AtlasFilm): string {
  return `${film.title} (${film.year ?? "?"})`;
}

// Returns the accepted candidate, or "ambiguous" with the list, or "none".
function autoMatch(film: AtlasFilm, candidates: Candidate[]): Candidate | "ambiguous" | "none" {
  if (candidates.length === 0) return "none";
  const wantTitle = normalize(film.search?.query ?? film.title);
  const wantYear = film.search?.year !== undefined ? film.search.year : film.year;

  const titleMatches = candidates.filter((c) => normalize(c.title) === wantTitle);
  const titleAndYear = titleMatches.filter(
    (c) => wantYear == null || (c.year != null && Math.abs(c.year - wantYear) <= 1)
  );

  if (titleAndYear.length === 1) return titleAndYear[0];
  if (titleAndYear.length > 1) return "ambiguous";

  // No exact title match: accept a single result whose year fits, otherwise ask.
  const yearMatches = candidates.filter(
    (c) => wantYear != null && c.year != null && Math.abs(c.year - wantYear) <= 1
  );
  if (candidates.length === 1 && yearMatches.length === 1) return candidates[0];
  return "ambiguous";
}

async function promptChoice(film: AtlasFilm, candidates: Candidate[]): Promise<number | null | "skip"> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nAmbiguous match for: ${film.title} (${film.year ?? "?"}) [${film.kind}] dir. ${film.director ?? "?"}`);
  candidates.slice(0, 6).forEach((c, i) => {
    const snippet = c.overview.length > 110 ? c.overview.slice(0, 110) + "..." : c.overview;
    console.log(`  ${i + 1}. [${c.id}] ${c.title} (${c.year ?? "?"}) votes:${c.voteCount} ${snippet}`);
  });
  console.log("  0. none of these: create without TMDB id");
  console.log("  s. skip for now");
  const answer = (await rl.question("Pick: ")).trim().toLowerCase();
  rl.close();
  if (answer === "s") return "skip";
  if (answer === "0") return null;
  const idx = Number(answer);
  if (Number.isInteger(idx) && idx >= 1 && idx <= Math.min(candidates.length, 6)) {
    return candidates[idx - 1].id;
  }
  return "skip";
}

async function tagIdMap(): Promise<Map<string, number>> {
  const tags = await prisma.tag.findMany();
  const map = new Map<string, number>();
  for (const tag of tags) {
    map.set(tag.key, tag.id);
    // Allow lookup by axis number alone ("1.3" -> "1.3-subject-cameras")
    const numMatch = tag.key.match(/^(\d\.\d)-/);
    if (numMatch) map.set(numMatch[1], tag.id);
  }
  return map;
}

async function upsertFilm(
  film: AtlasFilm,
  tmdbId: number | null,
  tags: Map<string, number>
): Promise<void> {
  let imdbId: string | null = null;
  let overview: string | null = null;
  let posterPath: string | null = null;
  let runtimeMin: number | null = null;
  let year = film.year;

  if (tmdbId != null) {
    if (film.kind === "SERIES") {
      const [details, external] = [await tvDetails(tmdbId), await tvExternalIds(tmdbId)];
      overview = details.overview ?? null;
      posterPath = details.poster_path ?? null;
      runtimeMin = details.episode_run_time?.[0] ?? null;
      year = year ?? yearOf(details.first_air_date);
      imdbId = external.imdb_id ?? null;
    } else {
      const [details, external] = [await movieDetails(tmdbId), await movieExternalIds(tmdbId)];
      overview = details.overview ?? null;
      posterPath = details.poster_path ?? null;
      runtimeMin = details.runtime ?? null;
      year = year ?? yearOf(details.release_date);
      imdbId = external.imdb_id ?? null;
    }
  }

  const data = {
    tmdbId,
    imdbId,
    kind: film.kind,
    title: film.title,
    year,
    director: film.director,
    runtimeMin,
    overview,
    formalNote: film.formalNote,
    posterPath,
    watchFirst: film.watchFirst,
    source: "atlas",
  };

  const existing =
    tmdbId != null
      ? await prisma.film.findUnique({ where: { tmdbId } })
      : await prisma.film.findFirst({ where: { title: film.title, year: film.year } });

  const row = existing
    ? await prisma.film.update({ where: { id: existing.id }, data })
    : await prisma.film.create({ data });

  for (const tagRef of film.tags) {
    const tagId = tags.get(tagRef);
    if (!tagId) {
      console.warn(`  WARNING: unknown tag "${tagRef}" on ${film.title}. Run seed-taxonomy first.`);
      continue;
    }
    await prisma.filmTag.upsert({
      where: { filmId_tagId: { filmId: row.id, tagId } },
      update: {},
      create: { filmId: row.id, tagId },
    });
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(FILMS_PATH, "utf-8")) as { films: AtlasFilm[] };
  const overrides: Record<string, number | null> = existsSync(OVERRIDES_PATH)
    ? JSON.parse(readFileSync(OVERRIDES_PATH, "utf-8"))
    : {};
  const interactive = process.stdin.isTTY === true;
  const tags = await tagIdMap();
  if (tags.size === 0) throw new Error("No tags in database. Run seed-taxonomy first.");

  const unresolved: Array<{ film: string; year: number | null; kind: string; candidates: Candidate[] }> = [];
  let created = 0;
  let manual = 0;
  let skipped = 0;

  for (const film of manifest.films) {
    const label = `${film.title} (${film.year ?? "?"})`;

    // Manual entries: institutions, bodies of work, anything flagged noTmdb.
    if (film.noTmdb || film.kind === "INSTITUTION" || film.kind === "BODY_OF_WORK") {
      await upsertFilm(film, null, tags);
      manual++;
      console.log(`manual   ${label} [${film.kind}]`);
      continue;
    }

    // Overrides win.
    const ovKey = overrideKey(film);
    if (ovKey in overrides) {
      const tmdbId = overrides[ovKey];
      await upsertFilm(film, tmdbId, tags);
      created++;
      console.log(`override ${label} -> ${tmdbId ?? "no TMDB id"}`);
      continue;
    }

    const query = film.search?.query ?? film.title;
    const searchYear = film.search?.year !== undefined ? film.search.year : film.year;
    const page =
      film.kind === "SERIES" ? await searchTv(query, searchYear) : await searchMovie(query, searchYear);
    let candidates = toCandidates(page.results);

    // Year-filtered search can miss; retry without year.
    if (candidates.length === 0 && searchYear != null) {
      const retry = film.kind === "SERIES" ? await searchTv(query, null) : await searchMovie(query, null);
      candidates = toCandidates(retry.results);
    }

    const match = autoMatch(film, candidates);

    if (match !== "ambiguous" && match !== "none") {
      await upsertFilm(film, match.id, tags);
      created++;
      console.log(`matched  ${label} -> [${match.id}] ${match.title} (${match.year ?? "?"})`);
      continue;
    }

    if (match === "none") {
      if (interactive) {
        console.log(`\nNo TMDB results for: ${label} [${film.kind}]`);
        await upsertFilm(film, null, tags);
        manual++;
        console.log(`manual   ${label} (no TMDB results)`);
      } else {
        unresolved.push({ film: film.title, year: film.year, kind: film.kind, candidates: [] });
        skipped++;
        console.log(`skipped  ${label} (no TMDB results, recorded in match-report)`);
      }
      continue;
    }

    // Ambiguous.
    if (interactive) {
      const choice = await promptChoice(film, candidates);
      if (choice === "skip") {
        unresolved.push({ film: film.title, year: film.year, kind: film.kind, candidates: candidates.slice(0, 6) });
        skipped++;
        console.log(`skipped  ${label}`);
      } else {
        await upsertFilm(film, choice, tags);
        if (choice === null) manual++;
        else created++;
        console.log(`chosen   ${label} -> ${choice ?? "no TMDB id"}`);
      }
    } else {
      unresolved.push({ film: film.title, year: film.year, kind: film.kind, candidates: candidates.slice(0, 6) });
      skipped++;
      console.log(`skipped  ${label} (ambiguous, recorded in match-report)`);
    }
  }

  writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), unresolved }, null, 2));

  const filmCount = await prisma.film.count();
  const tagLinkCount = await prisma.filmTag.count();
  console.log(
    `\nDone. Matched ${created}, manual ${manual}, skipped ${skipped}. ` +
      `DB now has ${filmCount} films and ${tagLinkCount} film-tag links.`
  );
  if (skipped > 0) {
    console.log(`Resolve skipped entries in ${REPORT_PATH} by adding "Title (year)": tmdbId to ${OVERRIDES_PATH}, then re-run.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
