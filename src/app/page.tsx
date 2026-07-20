// Phase 1 placeholder: database status only. The masonry grid and tag filter
// arrive in Phase 2.

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [films, tags, groups, tagLinks, withPoster, watchFirst] = await Promise.all([
    prisma.film.count(),
    prisma.tag.count(),
    prisma.tagGroup.count(),
    prisma.filmTag.count(),
    prisma.film.count({ where: { posterPath: { not: null } } }),
    prisma.film.count({ where: { watchFirst: true } }),
  ]);

  const rows: Array<[string, number]> = [
    ["Films", films],
    ["Tag groups", groups],
    ["Tags", tags],
    ["Film-tag links", tagLinks],
    ["Films with posters", withPoster],
    ["Watch-first films", watchFirst],
  ];

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Frame Atlas</h1>
      <p className="mt-2 text-neutral-400">Phase 1: foundation. Database status below.</p>
      <dl className="mt-8 divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <dt className="text-neutral-400">{label}</dt>
            <dd className="font-mono text-lg">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
