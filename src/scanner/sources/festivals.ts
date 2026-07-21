// Festival lineup parsers. Planned sources per PROJECT_BRIEF: IDFA, CPH:DOX,
// Sundance, Hot Docs, True/False, Sheffield DocFest, Encounters, Durban IFF.
//
// Lineup pages are heavily scripted and each needs its own parser written
// against the real page structure (the brief suggests scraping one page via
// Firecrawl first, then writing the parser against reality). Deferred until
// that pass; the orchestrator already consumes this source, so adding a
// festival is just filling in a parser here.

import type { SourceCandidate } from "../types";

export async function festivalsSource(): Promise<SourceCandidate[]> {
  return [];
}
