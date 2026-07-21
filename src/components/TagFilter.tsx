"use client";

import type { FilterGroup } from "@/lib/types";

type Props = {
  groups: FilterGroup[];
  selected: Set<string>;
  mode: "AND" | "OR";
  onToggleTag: (key: string) => void;
  onModeChange: (mode: "AND" | "OR") => void;
  onClear: () => void;
};

export default function TagFilter({ groups, selected, mode, onToggleTag, onModeChange, onClear }: Props) {
  return (
    <aside className="w-64 shrink-0">
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex rounded border border-neutral-700 text-xs">
            {(["AND", "OR"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={
                  "px-2.5 py-1 transition-colors " +
                  (mode === m ? "bg-neutral-200 text-neutral-900" : "text-neutral-400 hover:text-white")
                }
              >
                {m}
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <button onClick={onClear} className="text-xs text-neutral-500 hover:text-white">
              Clear ({selected.size})
            </button>
          )}
        </div>
        {groups.map((group) => (
          <div key={group.key} className="mb-5">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {group.name}
            </h3>
            <ul>
              {group.tags.map((tag) => {
                const active = selected.has(tag.key);
                return (
                  <li key={tag.key}>
                    <button
                      onClick={() => onToggleTag(tag.key)}
                      className={
                        "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[13px] leading-tight transition-colors " +
                        (active
                          ? "bg-neutral-200 text-neutral-900"
                          : "text-neutral-300 hover:bg-neutral-800 hover:text-white")
                      }
                    >
                      <span>
                        <span className="mr-1.5 font-mono text-[10px] opacity-60">
                          {tag.key.split("-")[0]}
                        </span>
                        {tag.name}
                      </span>
                      <span className={"font-mono text-[10px] " + (active ? "opacity-60" : "text-neutral-600")}>
                        {tag.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
