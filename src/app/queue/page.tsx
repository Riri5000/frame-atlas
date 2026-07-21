import Link from "next/link";
import QueueCard from "@/components/QueueCard";
import ScanNowButton from "@/components/ScanNowButton";
import { prisma } from "@/lib/db";
import type { FilterGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default async function QueuePage() {
  const [pending, groups, approved, rejected] = await Promise.all([
    prisma.scanCandidate.findMany({ where: { status: "pending" } }),
    prisma.tagGroup.findMany({
      include: { tags: { orderBy: { key: "asc" } } },
      orderBy: { id: "asc" },
    }),
    prisma.scanCandidate.count({ where: { status: "approved" } }),
    prisma.scanCandidate.count({ where: { status: "rejected" } }),
  ]);

  // Confidence descending (high first), untagged last, newest first within a band.
  const sorted = pending.sort((a, b) => {
    const ca = a.confidence ? CONFIDENCE_ORDER[a.confidence] ?? 3 : 4;
    const cb = b.confidence ? CONFIDENCE_ORDER[b.confidence] ?? 3 : 4;
    if (ca !== cb) return ca - cb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const filterGroups: FilterGroup[] = groups.map((g) => ({
    key: g.key,
    name: g.name,
    tags: g.tags.map((t) => ({ key: t.key, name: t.name, count: 0 })),
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <Link href="/" className="text-sm text-neutral-500 hover:text-white">
            &larr; Back to library
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {pending.length} pending. {approved} approved and {rejected} rejected so far.
          </p>
        </div>
        <ScanNowButton />
      </header>

      {sorted.length === 0 ? (
        <p className="mt-16 text-center text-neutral-500">
          Queue is empty. Run a scan to find new documentaries.
        </p>
      ) : (
        <div className="space-y-4">
          {sorted.map((candidate) => (
            <QueueCard
              key={candidate.id}
              candidate={{
                id: candidate.id,
                tmdbId: candidate.tmdbId,
                title: candidate.title,
                year: candidate.year,
                sourceUrl: candidate.sourceUrl,
                sourceName: candidate.sourceName,
                suggestedTags: candidate.suggestedTags
                  ? (JSON.parse(candidate.suggestedTags) as string[])
                  : [],
                formalNote: candidate.formalNote,
                confidence: candidate.confidence,
              }}
              groups={filterGroups}
            />
          ))}
        </div>
      )}
    </main>
  );
}
