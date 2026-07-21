"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FilterGroup } from "@/lib/types";

type QueueCandidate = {
  id: number;
  tmdbId: number | null;
  title: string;
  year: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  suggestedTags: string[];
  formalNote: string | null;
  confidence: string | null;
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-950 text-emerald-400 border-emerald-900",
  medium: "bg-amber-950 text-amber-400 border-amber-900",
  low: "bg-neutral-800 text-neutral-400 border-neutral-700",
};

export default function QueueCard({
  candidate,
  groups,
}: {
  candidate: QueueCandidate;
  groups: FilterGroup[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(candidate.suggestedTags));
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function act(action: "approve" | "reject") {
    setState("busy");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id, action, tagKeys: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setState("error");
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tagName = (key: string) =>
    groups.flatMap((g) => g.tags).find((t) => t.key === key)?.name ?? key;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-neutral-100">
            {candidate.title}
            {candidate.year && <span className="ml-2 text-sm text-neutral-500">{candidate.year}</span>}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {candidate.sourceName ?? "unknown source"}
            {candidate.sourceUrl && (
              <>
                {" · "}
                <a
                  href={candidate.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white"
                >
                  source
                </a>
              </>
            )}
            {candidate.tmdbId && (
              <>
                {" · "}
                <a
                  href={`https://www.themoviedb.org/movie/${candidate.tmdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white"
                >
                  TMDB
                </a>
              </>
            )}
          </p>
        </div>
        {candidate.confidence && (
          <span
            className={
              "shrink-0 rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide " +
              (CONFIDENCE_STYLES[candidate.confidence] ?? CONFIDENCE_STYLES.low)
            }
          >
            {candidate.confidence}
          </span>
        )}
      </div>

      {candidate.formalNote && (
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">{candidate.formalNote}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {Array.from(selected).length === 0 ? (
          <span className="text-xs text-neutral-600">No tags suggested</span>
        ) : (
          Array.from(selected)
            .sort()
            .map((key) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                title="Click to remove"
                className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 hover:bg-red-950 hover:text-red-300"
              >
                <span className="mr-1 font-mono text-[10px] text-neutral-500">{key.split("-")[0]}</span>
                {tagName(key)}
              </button>
            ))
        )}
        <button
          onClick={() => setEditing((e) => !e)}
          className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-white"
        >
          {editing ? "Done" : "Edit tags"}
        </button>
      </div>

      {editing && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-3">
          {groups.map((group) => (
            <div key={group.key} className="mb-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {group.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.tags.map((tag) => {
                  const active = selected.has(tag.key);
                  return (
                    <button
                      key={tag.key}
                      onClick={() => toggle(tag.key)}
                      className={
                        "rounded px-2 py-0.5 text-xs transition-colors " +
                        (active
                          ? "bg-neutral-200 text-neutral-900"
                          : "bg-neutral-800 text-neutral-400 hover:text-white")
                      }
                    >
                      {tag.key.split("-")[0]} {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
        <button
          onClick={() => act("approve")}
          disabled={state === "busy"}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
        >
          Approve into library
        </button>
        <button
          onClick={() => act("reject")}
          disabled={state === "busy"}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-red-800 hover:text-red-400 disabled:opacity-50"
        >
          Reject
        </button>
        {state === "busy" && <span className="text-xs text-neutral-500">Working...</span>}
        {state === "error" && <span className="text-xs text-red-400">Failed, try again</span>}
      </div>
    </div>
  );
}
