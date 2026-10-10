"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useYearParam, yearQuery } from "@/lib/useYear";
import { useNow } from "@/lib/useNow";
import type { Race, SeasonRound, Standings } from "@/lib/types";
import { ErrorNote, Segmented, Skeleton, Spoiler } from "@/components/ui";
import { YearPicker } from "@/components/race/YearPicker";
import { DriverTable, ConstructorTable } from "./Tables";
import { TitleFight } from "./TitleFight";
import { Simulator } from "./Simulator";
import { Teammates } from "./Teammates";

type Tab = "drivers" | "constructors" | "title" | "simulator" | "teammates";

export function StandingsView() {
  const year = useYearParam();
  const now = useNow(60_000);
  const [tab, setTab] = useState<Tab>("drivers");
  const { data: standings, error } = useApi<Standings>(`/api/standings${yearQuery(year)}`);
  const { data: schedule } = useApi<Race[]>(`/api/schedule${yearQuery(year)}`);
  const { data: rounds } = useApi<SeasonRound[]>(tab === "teammates" ? `/api/season-results${yearQuery(year)}` : null);
  const season = Number(standings?.season ?? year ?? (now ? new Date(now).getFullYear() : 0));
  const currentYear = now ? new Date(now).getFullYear() : season;
  const remaining = schedule && standings?.round != null ? schedule.filter((r) => r.round > standings.round!) : [];

  const tabs: { value: Tab; label: string }[] = [
    { value: "drivers", label: "Drivers" },
    { value: "constructors", label: "Teams" },
    ...(remaining.length ? [{ value: "title" as Tab, label: "Title fight" }, { value: "simulator" as Tab, label: "Simulator" }] : []),
    { value: "teammates", label: "Teammates" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{season || ""} standings</h1>
          <p className="text-sm text-muted">{standings?.round ? `After round ${standings.round}${schedule ? ` of ${schedule.length}` : ""}` : " "}</p>
        </div>
        {season > 0 && <YearPicker year={season} current={Math.max(currentYear, season)} />}
      </div>
      <div className="max-w-full overflow-x-auto">
        <Segmented value={tabs.some((t) => t.value === tab) ? tab : "drivers"} onChange={setTab} options={tabs} />
      </div>

      {error && !standings && <ErrorNote message={error} />}
      {!standings && !error && <Skeleton className="h-96 rounded-2xl" />}
      {standings && (
        <Spoiler label="Standings hidden" className="py-16">
          {tab === "drivers" && <DriverTable standings={standings} />}
          {tab === "constructors" && <ConstructorTable standings={standings} />}
          {tab === "title" && <TitleFight standings={standings} remaining={remaining} />}
          {tab === "simulator" && <Simulator standings={standings} next={remaining[0]} />}
          {tab === "teammates" && (rounds ? <Teammates rounds={rounds} /> : <Skeleton className="h-96 rounded-2xl" />)}
        </Spoiler>
      )}
    </div>
  );
}
