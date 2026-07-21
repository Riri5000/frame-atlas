"use client";

import { useMemo, useState } from "react";
import FilmCard from "@/components/FilmCard";
import TagFilter from "@/components/TagFilter";
import type { FilterGroup, LibraryFilm } from "@/lib/types";

type Props = {
  films: LibraryFilm[];
  groups: FilterGroup[];
};

export default function MasonryGrid({ films, groups }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"AND" | "OR">("OR");

  const visible = useMemo(() => {
    if (selected.size === 0) return films;
    const keys = Array.from(selected);
    return films.filter((f) =>
      mode === "AND"
        ? keys.every((k) => f.tagKeys.includes(k))
        : keys.some((k) => f.tagKeys.includes(k))
    );
  }, [films, selected, mode]);

  function toggleTag(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex gap-6">
      <TagFilter
        groups={groups}
        selected={selected}
        mode={mode}
        onToggleTag={toggleTag}
        onModeChange={setMode}
        onClear={() => setSelected(new Set())}
      />
      <div className="min-w-0 flex-1">
        <p className="mb-3 text-xs text-neutral-500">
          {visible.length} of {films.length} entries
        </p>
        {visible.length === 0 ? (
          <p className="mt-12 text-center text-neutral-500">
            No entries match this tag combination.
          </p>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {visible.map((film) => (
              <FilmCard key={film.id} film={film} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
