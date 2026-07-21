import { prisma } from "@/lib/db";
import type { FilterGroup, LibraryFilm } from "@/lib/types";

function firstBackdrop(backdropPaths: string | null): string | null {
  if (!backdropPaths) return null;
  try {
    const parsed = JSON.parse(backdropPaths);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
  } catch {
    return null;
  }
}

export async function loadLibrary(): Promise<{ films: LibraryFilm[]; groups: FilterGroup[] }> {
  const [films, groups] = await Promise.all([
    prisma.film.findMany({
      include: { tags: { include: { tag: true } } },
      orderBy: [{ year: "desc" }, { title: "asc" }],
    }),
    prisma.tagGroup.findMany({
      include: { tags: { include: { _count: { select: { films: true } } }, orderBy: { key: "asc" } } },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    films: films.map((f) => ({
      id: f.id,
      tmdbId: f.tmdbId,
      imdbId: f.imdbId,
      kind: f.kind,
      title: f.title,
      year: f.year,
      director: f.director,
      watchFirst: f.watchFirst,
      seen: f.seen,
      posterPath: f.posterPath,
      backdrop: firstBackdrop(f.backdropPaths),
      trailerKey: f.trailerKey,
      tagKeys: f.tags.map((ft) => ft.tag.key),
    })),
    groups: groups.map((g) => ({
      key: g.key,
      name: g.name,
      tags: g.tags
        .filter((t) => t._count.films > 0)
        .map((t) => ({ key: t.key, name: t.name, count: t._count.films })),
    })),
  };
}
