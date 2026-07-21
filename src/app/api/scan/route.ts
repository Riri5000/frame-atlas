import { NextResponse } from "next/server";
import { runScan } from "@/scanner/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/scan triggers a full scan run.
export async function POST() {
  try {
    const summary = await runScan();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("scan failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "scan failed" },
      { status: 500 }
    );
  }
}
