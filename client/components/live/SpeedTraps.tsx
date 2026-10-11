"use client";

import { useState } from "react";
import { Segmented, TeamBar, cn } from "@/components/ui";

export type Trap = "st" | "fl" | "i1" | "i2";
export type TrapRow = { number: string; tla: string; team: string; colour: string; speeds: Partial<Record<Trap, number | null>> };

const TRAPS: { value: Trap; label: string; hint: string }[] = [
  { value: "st", label: "Speed trap", hint: "The fastest point of the lap, usually the end of the main straight." },
  { value: "fl", label: "Finish line", hint: "Speed across the finish line." },
  { value: "i1", label: "Sector 1", hint: "Speed at the first intermediate timing point." },
  { value: "i2", label: "Sector 2", hint: "Speed at the second intermediate timing point." },
];

// Who is quickest in a straight line: the highest speed each driver has reached
// through a timing trap, ranked, with bars from the slowest to the fastest.
export function SpeedTraps({ rows, focus, onSelect }: { rows: TrapRow[]; focus?: string | null; onSelect?: (n: string) => void }) {
  const [trap, setTrap] = useState<Trap>("st");
  const ranked = rows
    .map((r) => ({ ...r, v: r.speeds[trap] ?? null }))
    .filter((r): r is TrapRow & { v: number } => r.v != null)
    .sort((a, b) => b.v - a.v);
  const hint = TRAPS.find((t) => t.value === trap)!.hint;

  if (ranked.length === 0 && rows.every((r) => Object.values(r.speeds).every((v) => v == null))) {
    return <p className="py-8 text-center text-sm text-muted">Speeds appear once cars have been through the speed traps.</p>;
  }
  const top = ranked[0]?.v ?? 0;
  const low = Math.min(...ranked.map((r) => r.v)) - 4;

  return (
    <div>
      <div className="mb-1 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented size="sm" value={trap} onChange={setTrap} options={TRAPS.map((t) => ({ value: t.value, label: t.label }))} />
      </div>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <ol className="space-y-0.5">
        {ranked.map((r, i) => (
          <li key={r.number}>
            <button
              onClick={() => onSelect?.(r.number)}
              className={cn("grid w-full grid-cols-[1.4em_3.2em_minmax(0,1fr)_4.2em] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2", focus === r.number && "bg-surface-2 ring-1 ring-accent/60")}
            >
              <span className="text-center font-display font-bold text-muted">{i + 1}</span>
              <span className="flex items-center gap-1.5 font-display font-bold">
                <TeamBar colour={r.colour} className="h-4" />
                {r.tla}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, ((r.v - low) / (top - low || 1)) * 100)}%`, background: "var(--series-1)" }} />
              </span>
              <span className="tnum text-right">
                <b className="font-display">{r.v}</b> <span className="text-xs text-muted">km/h</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {ranked.length > 1 && <p className="mt-2 text-xs text-muted">{ranked[0].tla} is {ranked[0].v - ranked.at(-1)!.v} km/h quicker than {ranked.at(-1)!.tla} here.</p>}
    </div>
  );
}
