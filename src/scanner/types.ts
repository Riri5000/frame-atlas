// Shared shape produced by every scanner source. Overview travels with the
// candidate for the tagger but is not persisted (ScanCandidate has no field).

export type SourceCandidate = {
  tmdbId: number | null;
  title: string;
  year: number | null;
  overview: string | null;
  sourceUrl: string | null;
  sourceName: string;
};
