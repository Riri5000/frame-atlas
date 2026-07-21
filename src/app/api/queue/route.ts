import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchMovieFilmData } from "@/lib/enrichFilm";

export const dynamic = "force-dynamic";

// POST /api/queue with { id, action: "approve" | "reject", tagKeys?, formalNote? }
// Approve creates the Film row (source: scanner) with full TMDB enrichment;
// reject just flips status. Nothing here ever touches Film for other rows.
export async function POST(request: Request) {
  let body: { id?: unknown; action?: unknown; tagKeys?: unknown; formalNote?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  const action = body.action;
  if (!Number.isInteger(id) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "need id and action approve|reject" }, { status: 400 });
  }

  const candidate = await prisma.scanCandidate.findUnique({ where: { id } });
  if (!candidate) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (candidate.status !== "pending") {
    return NextResponse.json({ error: `already ${candidate.status}` }, { status: 409 });
  }

  if (action === "reject") {
    await prisma.scanCandidate.update({ where: { id }, data: { status: "rejected" } });
    return NextResponse.json({ id, status: "rejected" });
  }

  // Approve: tag keys from the request (edited in the queue UI) or the
  // scanner's suggestion; unknown keys are dropped.
  const requestedKeys: string[] = Array.isArray(body.tagKeys)
    ? body.tagKeys.filter((k): k is string => typeof k === "string")
    : candidate.suggestedTags
      ? (JSON.parse(candidate.suggestedTags) as string[])
      : [];
  const tags = await prisma.tag.findMany({ where: { key: { in: requestedKeys } } });

  const formalNote =
    typeof body.formalNote === "string" && body.formalNote.trim().length > 0
      ? body.formalNote.trim()
      : candidate.formalNote;

  const base = candidate.tmdbId
    ? await fetchMovieFilmData(candidate.tmdbId).catch((err) => {
        console.warn(`approve: enrichment failed for ${candidate.title}: ${err}`);
        return null;
      })
    : null;

  const film = await prisma.film.create({
    data: {
      tmdbId: candidate.tmdbId,
      imdbId: base?.imdbId ?? null,
      kind: "FILM",
      title: base?.title ?? candidate.title,
      year: base?.year ?? candidate.year,
      runtimeMin: base?.runtimeMin ?? null,
      overview: base?.overview ?? null,
      formalNote,
      posterPath: base?.posterPath ?? null,
      backdropPaths: base?.backdropPaths ?? null,
      trailerKey: base?.trailerKey ?? null,
      watchZA: base?.watchZA ?? null,
      source: "scanner",
      tags: { create: tags.map((t) => ({ tagId: t.id })) },
    },
  });

  await prisma.scanCandidate.update({ where: { id }, data: { status: "approved" } });
  return NextResponse.json({ id, status: "approved", filmId: film.id });
}
