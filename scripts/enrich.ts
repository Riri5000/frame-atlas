// Backfill images, trailer keys, and South Africa watch providers for every
// film that has a TMDB id. Safe to re-run; only overwrites with fresh data.

import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  movieImages,
  movieVideos,
  movieWatchProviders,
  tvImages,
  tvVideos,
  tvWatchProviders,
  pickTrailerKey,
  pickBackdrops,
} from "../src/lib/tmdb";

async function main() {
  const films = await prisma.film.findMany({
    where: { tmdbId: { not: null } },
    orderBy: { id: "asc" },
  });
  console.log(`Enriching ${films.length} films with TMDB ids...`);

  let ok = 0;
  let failed = 0;

  for (const film of films) {
    const id = film.tmdbId!;
    try {
      const isTv = film.kind === "SERIES";
      const [images, videos, providers] = [
        await (isTv ? tvImages(id) : movieImages(id)),
        await (isTv ? tvVideos(id) : movieVideos(id)),
        await (isTv ? tvWatchProviders(id) : movieWatchProviders(id)),
      ];

      const backdrops = pickBackdrops(images, 10);
      const trailerKey = pickTrailerKey(videos);
      const za = providers.results["ZA"] ?? null;

      await prisma.film.update({
        where: { id: film.id },
        data: {
          backdropPaths: backdrops.length > 0 ? JSON.stringify(backdrops) : film.backdropPaths,
          trailerKey: trailerKey ?? film.trailerKey,
          watchZA: za ? JSON.stringify(za) : film.watchZA,
        },
      });
      ok++;
      console.log(
        `ok   ${film.title} (${film.year ?? "?"}): ${backdrops.length} backdrops, ` +
          `trailer ${trailerKey ? "yes" : "no"}, ZA providers ${za ? "yes" : "no"}`
      );
    } catch (err) {
      failed++;
      console.warn(`fail ${film.title}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const withImages = await prisma.film.count({ where: { backdropPaths: { not: null } } });
  const withTrailer = await prisma.film.count({ where: { trailerKey: { not: null } } });
  const withZA = await prisma.film.count({ where: { watchZA: { not: null } } });
  console.log(
    `\nDone. ${ok} enriched, ${failed} failed. ` +
      `Totals: ${withImages} with backdrops, ${withTrailer} with trailers, ${withZA} with ZA providers.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
