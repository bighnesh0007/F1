"use client";

import { Crown, Swords } from "lucide-react";
import type { Race, Standings } from "@/lib/types";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { Card, TeamBar } from "@/components/ui";

// Maximum points still available (no fastest-lap point since 2025).
export const RACE_MAX = 25;
export const SPRINT_MAX = 8;
const TEAM_RACE_MAX = 25 + 18;
const TEAM_SPRINT_MAX = 8 + 7;

export function TitleFight({ standings, remaining }: { standings: Standings; remaining: Race[] }) {
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const races = remaining.length;
  const sprints = remaining.filter((r) => r.sprint).length;
  const available = races * RACE_MAX + sprints * SPRINT_MAX;
  const teamAvailable = races * TEAM_RACE_MAX + sprints * TEAM_SPRINT_MAX;

  const leader = standings.drivers[0];
  const contenders = standings.drivers.filter((d) => d.points + available >= leader.points);
  const second = standings.drivers[1];
  const lead = leader && second ? leader.points - second.points : 0;
  // After the next weekend, a lead bigger than what's left after it settles the title.
  const afterNext = available - RACE_MAX - (remaining[0]?.sprint ? SPRINT_MAX : 0);

  const teamLeader = standings.constructors[0];
  const teamContenders = standings.constructors.filter((c) => c.points + teamAvailable >= teamLeader.points);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Big label="Races left" value={String(races)} sub={sprints ? `+ ${sprints} sprint${sprints > 1 ? "s" : ""}` : "no sprints"} />
          <Big label="Points still available" value={String(available)} sub="per driver" />
          <Big label="Still in the title fight" value={String(contenders.length)} sub={contenders.length === 1 ? "drivers' title decided" : "drivers"} />
        </div>
      </Card>

      <Card title="Can they still win it?" icon={<Swords size={15} />}>
        <p className="mb-4 text-sm text-muted">
          {contenders.length === 1 ? (
            <><b className="text-ink">{leader.driver.name}</b> is champion: no one can catch them any more.</>
          ) : (
            <>
              <b className="text-ink">{leader.driver.name}</b> leads by {lead} with {available} points still to win.{" "}
              {races > 1 && remaining[0] ? (
                <>
                  Leaving the {remaining[0].name} more than <b className="text-ink">{afterNext} points</b> clear of everyone settles it.
                </>
              ) : (
                <>It all comes down to the final race.</>
              )}{" "}
              On equal points, more wins decides.
            </>
          )}
        </p>
        <ul className="space-y-3">
          {contenders.slice(0, 6).map((d) => {
            const colour = byCode(d.driver.code)?.colour ?? teamColour(d.team);
            const max = d.points + available;
            const deficit = leader.points - d.points;
            return (
              <li key={d.driver.id}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    {d.position === 1 ? <Crown size={14} className="text-yellow" /> : <TeamBar colour={colour} />}
                    {d.driver.name}
                  </span>
                  <span className="text-xs text-muted">
                    {d.position === 1 ? "Leader" : `${deficit} behind · must outscore ${leader.driver.lastName} by ${deficit} over ${races} races`}
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(max / (leader.points + available)) * 100}%`, background: `#${colour}` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.points / (leader.points + available)) * 100}%`, background: `#${colour}` }} />
                </div>
                <p className="mt-0.5 text-[11px] text-faint">{d.points} now · {max} maximum</p>
              </li>
            );
          })}
        </ul>
        {contenders.length > 6 && (
          <p className="mt-3 text-xs text-muted">
            {contenders.length - 6} more driver{contenders.length - 6 === 1 ? " is" : "s are"} still mathematically in it: {contenders.slice(6).map((d) => d.driver.lastName).join(", ")}.
          </p>
        )}
      </Card>

      <Card title="Constructors" icon={<Swords size={15} />}>
        <p className="text-sm text-muted">
          {teamContenders.length === 1
            ? `${teamLeader.team} have won the constructors' title.`
            : `${teamContenders.length} teams can still win the constructors' title (${teamAvailable} points left per team): ${teamContenders.map((c) => c.team).join(", ")}.`}
        </p>
      </Card>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="font-display text-3xl font-bold">{value}</p>
      <p className="text-xs text-faint">{sub}</p>
    </div>
  );
}
