"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, RotateCcw, Shuffle } from "lucide-react";
import type { Race, Standings } from "@/lib/types";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { Card, TeamBar, cn } from "@/components/ui";

const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

// Pick a finishing order for the next race (and sprint) and see the new standings.
export function Simulator({ standings, next }: { standings: Standings; next?: Race }) {
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const initial = standings.drivers.map((d) => d.driver.id);
  const [order, setOrder] = useState(initial);
  const [sprint, setSprint] = useState(Boolean(next?.sprint));
  const byId = new Map(standings.drivers.map((d) => [d.driver.id, d]));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const nextOrder = [...order];
    [nextOrder[i], nextOrder[j]] = [nextOrder[j], nextOrder[i]];
    setOrder(nextOrder);
  };

  const projected = useMemo(() => {
    const rows = standings.drivers.map((d) => {
      const finish = order.indexOf(d.driver.id);
      const gained = (RACE_POINTS[finish] ?? 0) + (sprint ? SPRINT_POINTS[finish] ?? 0 : 0);
      return { ...d, gained, total: d.points + gained };
    });
    return rows.sort((a, b) => b.total - a.total || b.wins - a.wins).map((r, i) => ({ ...r, newPosition: i + 1 }));
  }, [order, sprint, standings]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        title={`Your result${next ? `: ${next.name}` : ""}`}
        right={
          <div className="flex gap-1">
            <button onClick={() => setOrder([...order].sort(() => Math.random() - 0.5))} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" title="Shuffle">
              <Shuffle size={15} />
            </button>
            <button onClick={() => setOrder(initial)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" title="Reset">
              <RotateCcw size={15} />
            </button>
          </div>
        }
      >
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sprint} onChange={(e) => setSprint(e.target.checked)} className="accent-[var(--accent)]" />
          Include a sprint with the same order
        </label>
        <ol className="space-y-1">
          {order.map((id, i) => {
            const d = byId.get(id)!;
            const colour = byCode(d.driver.code)?.colour ?? teamColour(d.team);
            const pts = (RACE_POINTS[i] ?? 0) + (sprint ? SPRINT_POINTS[i] ?? 0 : 0);
            return (
              <li key={id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5 text-sm">
                <span className="w-7 text-center font-display font-bold">P{i + 1}</span>
                <TeamBar colour={colour} />
                <span className="flex-1 truncate font-medium">{d.driver.name}</span>
                <span className="tnum w-10 text-right text-xs text-muted">{pts ? `+${pts}` : ""}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink disabled:opacity-25" aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink disabled:opacity-25" aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Standings after that">
        <ol className="space-y-1">
          {projected.map((d) => {
            const colour = byCode(d.driver.code)?.colour ?? teamColour(d.team);
            const change = (d.position ?? d.newPosition) - d.newPosition;
            return (
              <li key={d.driver.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="w-7 text-center font-display font-bold">{d.newPosition}</span>
                <span className={cn("flex w-8 items-center text-xs font-semibold", change > 0 ? "text-good" : change < 0 ? "text-bad" : "text-faint")}>
                  {change > 0 ? <ChevronUp size={13} /> : change < 0 ? <ChevronDown size={13} /> : null}
                  {change !== 0 ? Math.abs(change) : "–"}
                </span>
                <TeamBar colour={colour} />
                <span className="flex-1 truncate font-medium">{d.driver.name}</span>
                <span className="tnum text-xs text-muted">{d.gained ? `+${d.gained}` : ""}</span>
                <span className="tnum w-12 text-right font-display font-bold">{d.total}</span>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
