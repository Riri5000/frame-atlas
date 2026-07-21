import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { movieDetails } from "@/lib/tmdb";
import { researchCandidate, taggerAvailable } from "@/scanner/tagger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/research with optional { limit } runs the deep web-search tagging
// pass over pending candidates that came back empty from the synopsis-only
// tagger (suggestedTags "[]"). Updates candidate rows in place; approval into
// the library stays a separate, human-triggered step.
export async function POST(request: Request) {
  if (!taggerAvailable()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 409 });
  }

  let limit = 10;
  let afterId = 0;
  try {
    const body = await request.json();
    if (Number.isInteger(body?.limit) && body.limit > 0) limit = body.limit;
    if (Number.isInteger(body?.afterId) && body.afterId > 0) afterId = body.afterId;
  } catch {
    // no body is fine
  }

  // afterId is a cursor: a film researched to an empty result keeps
  // suggestedTags "[]", so without the cursor it would be reselected and
  // re-researched (and re-billed) on every batch.
  const targets = await prisma.scanCandidate.findMany({
    where: { status: "pending", suggestedTags: "[]", id: { gt: afterId } },
    orderBy: { id: "asc" },
    take: limit,
  });

  let researched = 0;
  let tagged = 0;
  for (const candidate of targets) {
    const overview = candidate.tmdbId
      ? await movieDetails(candidate.tmdbId)
          .then((d) => d.overview ?? null)
          .catch(() => null)
      : null;

    const result = await researchCandidate({
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
    researched++;
    if (result.tags.length > 0) tagged++;
    console.log(
      `research: ${candidate.title}: ${result.tags.length > 0 ? result.tags.join(", ") : "still nothing notable"} (${result.confidence})`
    );
  }

  const lastId = targets.length > 0 ? targets[targets.length - 1].id : afterId;
  const remaining = await prisma.scanCandidate.count({
    where: { status: "pending", suggestedTags: "[]", id: { gt: lastId } },
  });
  return NextResponse.json({ batch: targets.length, researched, tagged, remaining, lastId });
}
