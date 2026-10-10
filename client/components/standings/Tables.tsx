"use client";

import { Star } from "lucide-react";
import type { Standings } from "@/lib/types";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { nationalityFlag } from "@/lib/format";
import { Card, Headshot, TeamBar, cn } from "@/components/ui";

export function DriverTable({ standings }: { standings: Standings }) {
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const { settings } = useSettings();
  const leader = standings.drivers[0]?.points || 1;
  return (
    <Card bodyClassName="px-2 py-2">
      <ol className="space-y-0.5">
        {standings.drivers.map((d) => {
          const live = byCode(d.driver.code);
          const colour = live?.colour ?? teamColour(d.team);
          const fav = live && settings.favouriteDriver === live.number;
          return (
            <li key={d.driver.id} className={cn("grid grid-cols-[32px_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 sm:grid-cols-[32px_44px_minmax(0,1fr)_minmax(0,1.2fr)_auto]", fav ? "bg-surface-2 ring-1 ring-accent/50" : "hover:bg-surface-2")}>
              <span className="text-center font-display text-lg font-bold">{d.position ?? "–"}</span>
              <Headshot src={live?.headshot} colour={colour} size={40} alt={d.driver.code} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{d.driver.name}</span>
                  <span className="text-sm">{nationalityFlag(d.driver.nationality)}</span>
                  {fav && <Star size={12} className="fill-current text-accent" />}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted"><TeamBar colour={colour} className="h-3" />{d.team}{d.wins ? ` · ${d.wins} win${d.wins > 1 ? "s" : ""}` : ""}</span>
              </span>
              <span className="hidden h-2 overflow-hidden rounded-full bg-surface-2 sm:block">
                <span className="block h-full rounded-full" style={{ width: `${(d.points / leader) * 100}%`, background: `#${colour}` }} />
              </span>
              <span className="text-right">
                <span className="tnum block font-display text-lg leading-tight font-bold">{d.points}</span>
                <span className="block text-[11px] text-faint">{d.position === 1 ? "pts" : `−${leader - d.points}`}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function ConstructorTable({ standings }: { standings: Standings }) {
  const teamColour = useTeamColour();
  const leader = standings.constructors[0]?.points || 1;
  return (
    <Card bodyClassName="px-2 py-2">
      <ol className="space-y-0.5">
        {standings.constructors.map((c) => {
          const colour = teamColour(c.team);
          return (
            <li key={c.teamId} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2 sm:grid-cols-[32px_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <span className="text-center font-display text-lg font-bold">{c.position ?? "–"}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <TeamBar colour={colour} className="h-8 w-1.5" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.team}</span>
                  <span className="block text-xs text-muted">{c.wins ? `${c.wins} win${c.wins > 1 ? "s" : ""}` : "No wins yet"}</span>
                </span>
              </span>
              <span className="hidden h-2 overflow-hidden rounded-full bg-surface-2 sm:block">
                <span className="block h-full rounded-full" style={{ width: `${(c.points / leader) * 100}%`, background: `#${colour}` }} />
              </span>
              <span className="text-right">
                <span className="tnum block font-display text-lg leading-tight font-bold">{c.points}</span>
                <span className="block text-[11px] text-faint">{c.position === 1 ? "pts" : `−${leader - c.points}`}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
