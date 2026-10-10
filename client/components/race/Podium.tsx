"use client";

import type { Result } from "@/lib/types";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { Headshot } from "@/components/ui";

// Top three finishers, P1 in the middle and raised.
export function Podium({ results }: { results: Result[] }) {
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const top = results.slice(0, 3);
  if (top.length < 3) return null;
  const order = [top[1], top[0], top[2]];
  const heights = ["h-16", "h-24", "h-12"];
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {order.map((r, i) => {
        const live = byCode(r.driver.code);
        const colour = live?.colour ?? teamColour(r.team);
        return (
          <div key={r.driver.id} className="flex flex-col items-center text-center">
            <Headshot src={live?.headshot} colour={colour} size={i === 1 ? 64 : 52} alt={r.driver.code} />
            <p className="mt-1.5 font-display leading-tight font-bold">{r.driver.lastName}</p>
            <p className="truncate text-xs text-muted">{r.team}</p>
            <div className={`mt-2 flex w-full items-start justify-center rounded-t-xl pt-2 ${heights[i]}`} style={{ background: `linear-gradient(180deg, #${colour}55, #${colour}11)` }}>
              <span className="font-display text-2xl font-bold">{r.position}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
