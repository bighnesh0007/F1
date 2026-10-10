"use client";

import type { SeasonRound } from "@/lib/types";
import { teammateBattles } from "@/lib/season";
import { useTeamColour } from "@/lib/drivers";
import { Card, Empty } from "@/components/ui";

export function Teammates({ rounds }: { rounds: SeasonRound[] }) {
  const teamColour = useTeamColour();
  const battles = teammateBattles(rounds);
  if (!battles.length) return <Empty title="No races yet this season" />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {battles.map((b) => {
        const colour = `#${teamColour(b.team)}`;
        return (
          <Card key={`${b.teamId}-${b.a.id}-${b.b.id}`}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full" style={{ background: colour }} />
              <p className="font-semibold">{b.team}</p>
              <span className="ml-auto text-xs text-faint">{b.rounds} races together</span>
            </div>
            <div className="mb-3 flex items-center justify-between font-display text-lg font-bold">
              <span>{b.a.lastName}</span>
              <span className="text-xs font-normal text-faint">vs</span>
              <span>{b.b.lastName}</span>
            </div>
            {[
              { label: "Race head-to-head", v: b.race },
              { label: "Qualifying head-to-head", v: b.quali },
              { label: "Points", v: b.points },
            ].map((row) => {
              const total = row.v[0] + row.v[1] || 1;
              return (
                <div key={row.label} className="mb-2.5 last:mb-0">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="tnum font-bold">{row.v[0]}</span>
                    <span className="text-muted">{row.label}</span>
                    <span className="tnum font-bold">{row.v[1]}</span>
                  </div>
                  <div className="flex h-2 gap-[2px]">
                    <div className="rounded-full" style={{ width: `${(row.v[0] / total) * 100}%`, background: colour }} />
                    <div className="flex-1 rounded-full bg-surface-3" />
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}
