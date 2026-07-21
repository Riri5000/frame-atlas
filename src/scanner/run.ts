// Scan orchestrator. Gathers candidates from all sources, drops anything
// already in the library or queue, tags via Claude when a key is present,
// and writes ScanCandidate rows. Never writes to Film directly.

import { prisma } from "@/lib/db";
import { movieDetails } from "@/lib/tmdb";
import { tmdbDiscoverSource } from "./sources/tmdbDiscover";
import { pressSource } from "./sources/press";
import { festivalsSource } from "./sources/festivals";
import { tagCandidate, taggerAvailable } from "./tagger";
import type { SourceCandidate } from "./types";

export type ScanSummary = {
  found: number;
  new: number;
  tagged: number;
  retagged: number;
  taggerActive: boolean;
  bySource: Record<string, number>;
};

// Pending candidates written while no Anthropic key was configured have
// confidence null. Once a key exists, backfill their tags; overview comes
// from TMDB since it is not persisted on ScanCandidate.
async function retagPending(): Promise<number> {
  if (!taggerAvailable()) return 0;
  const untagged = await prisma.scanCandidate.findMany({
    where: { status: "pending", confidence: null },
  });
  let done = 0;
  for (const candidate of untagged) {
    let overview: string | null = null;
    if (candidate.tmdbId) {
      overview = await movieDetails(candidate.tmdbId)
        .then((d) => d.overview ?? null)
        .catch(() => null);
    }
    const result = await tagCandidate({
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      year: candidate.year,
      overview,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.sourceName ?? "unknown",
    });
    if (!result) continue;
    await prisma.scanCandidate.update({
      where: { id: candidate.id },
      data: {
        suggestedTags: JSON.stringify(result.tags),
        formalNote: result.formalNote,
        confidence: result.confidence,
      },
    });
    done++;
  }
  if (untagged.length > 0) console.log(`scan: retagged ${done} of ${untagged.length} pending`);
  return done;
}

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
    retagged: 0,
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

  summary.retagged = await retagPending();

  console.log(
    `scan: done. ${summary.found} found, ${summary.new} new, ${summary.tagged} tagged, ` +
      `${summary.retagged} retagged ` +
      `(tagger ${summary.taggerActive ? "active" : "inactive, no ANTHROPIC_API_KEY"})`
  );
  return summary;
}
