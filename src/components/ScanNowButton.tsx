"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ScanNowButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function scan() {
    setState("scanning");
    setResult(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const summary = (await res.json()) as { found: number; new: number; taggerActive: boolean };
      setResult(
        `${summary.new} new of ${summary.found} found` +
          (summary.taggerActive ? "" : " (untagged: no Anthropic key)")
      );
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={scan}
        disabled={state === "scanning"}
        className="rounded bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:opacity-50"
      >
        {state === "scanning" ? "Scanning..." : "Scan now"}
      </button>
      <p className="mt-1 h-4 text-xs text-neutral-500">
        {state === "error" ? "Scan failed, check server logs" : result}
      </p>
    </div>
  );
}
