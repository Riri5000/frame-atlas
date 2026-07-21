// Scan orchestrator. Gathers candidates from all sources, drops anything
// already in the library or queue, tags via Claude when a key is present,
// and writes ScanCandidate rows. Never writes to Film directly.

import { prisma } from "@/lib/db";
import { tmdbDiscoverSource } from "./sources/tmdbDiscover";
import { pressSource } from "./sources/press";
import { festivalsSource } from "./sources/festivals";
import { tagCandidate, taggerAvailable } from "./tagger";
import type { SourceCandidate } from "./types";

export type ScanSummary = {
  found: number;
  new: number;
  tagged: number;
  taggerActive: boolean;
  bySource: Record<string, number>;
};

export async function runScan(): Promise<ScanSummary> {
  const sources: Array<[string, () => Promise<SourceCandidate[]>]> = [
    ["TMDB discover", tmdbDiscoverSource],
    ["press", pressSource],
    ["festivals", festivalsSource],
  ];

  const candidates: SourceCandidate[] = [];
  for (const [name, source] of sources) {
    try {
      const found = await source();
      console.log(`scan: ${name} produced ${found.length} candidates`);
      candidates.push(...found);
    } catch (err) {
      console.warn(`scan: source ${name} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Dedupe within this run by tmdbId (press may re-find a discover title).
  const byTmdb = new Map<number, SourceCandidate>();
  const noTmdb: SourceCandidate[] = [];
  for (const c of candidates) {
    if (c.tmdbId === null) noTmdb.push(c);
    else if (!byTmdb.has(c.tmdbId)) byTmdb.set(c.tmdbId, c);
  }
  const unique = [...byTmdb.values(), ...noTmdb];

  // Drop anything already in the library or already queued (any status:
  // a rejected candidate stays rejected, it does not resurface).
  const tmdbIds = [...byTmdb.keys()];
  const [knownFilms, knownCandidates] = await Promise.all([
    prisma.film.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
    prisma.scanCandidate.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
  ]);
  const known = new Set<number>([
    ...knownFilms.map((f) => f.tmdbId!),
    ...knownCandidates.map((c) => c.tmdbId!),
  ]);
  const fresh = unique.filter((c) => c.tmdbId === null || !known.has(c.tmdbId));

  const summary: ScanSummary = {
    found: unique.length,
    new: fresh.length,
    tagged: 0,
    taggerActive: taggerAvailable(),
    bySource: {},
  };

  for (const candidate of fresh) {
    const tagResult = await tagCandidate(candidate);
    if (tagResult) summary.tagged++;

    await prisma.scanCandidate.create({
      data: {
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year,
        sourceUrl: candidate.sourceUrl,
        sourceName: candidate.sourceName,
        suggestedTags: tagResult ? JSON.stringify(tagResult.tags) : null,
        formalNote: tagResult?.formalNote ?? null,
        confidence: tagResult?.confidence ?? null,
      },
    });
    summary.bySource[candidate.sourceName] = (summary.bySource[candidate.sourceName] ?? 0) + 1;
  }

  console.log(
    `scan: done. ${summary.found} found, ${summary.new} new, ${summary.tagged} tagged ` +
      `(tagger ${summary.taggerActive ? "active" : "inactive, no ANTHROPIC_API_KEY"})`
  );
  return summary;
}
