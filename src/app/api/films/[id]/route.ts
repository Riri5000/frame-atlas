import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// PATCH /api/films/:id with { seen?: boolean, viewingNotes?: string }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const patch: { seen?: boolean; viewingNotes?: string } = {};
  if (typeof (body as any)?.seen === "boolean") patch.seen = (body as any).seen;
  if (typeof (body as any)?.viewingNotes === "string") patch.viewingNotes = (body as any).viewingNotes;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const film = await prisma.film.update({ where: { id }, data: patch });
    return NextResponse.json({ id: film.id, seen: film.seen, viewingNotes: film.viewingNotes });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
