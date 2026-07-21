"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  filmId: number;
  seen: boolean;
  viewingNotes: string;
};

export default function ViewingNotes({ filmId, seen: initialSeen, viewingNotes: initialNotes }: Props) {
  const router = useRouter();
  const [seen, setSeen] = useState(initialSeen);
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(patch: { seen?: boolean; viewingNotes?: string }) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/films/${filmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Viewing notes
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={seen}
            onChange={(e) => {
              setSeen(e.target.checked);
              save({ seen: e.target.checked });
            }}
            className="h-4 w-4 accent-emerald-500"
          />
          Seen
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="What did the form do? What is worth stealing?"
        className="mt-3 w-full resize-y rounded border border-neutral-700 bg-neutral-950 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {status === "saving" && "Saving..."}
          {status === "saved" && "Saved"}
          {status === "error" && "Save failed, try again"}
        </span>
        <button
          onClick={() => save({ viewingNotes: notes })}
          className="rounded bg-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
        >
          Save notes
        </button>
      </div>
    </section>
  );
}
