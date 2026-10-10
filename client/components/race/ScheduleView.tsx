"use client";

import Link from "next/link";
import { ChevronRight, Zap } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useYearParam, yearQuery } from "@/lib/useYear";
import { useNow } from "@/lib/useNow";
import { countryFlag, dateRange, localDay, localTime, timeZoneName } from "@/lib/format";
import { CalendarMenu } from "./CalendarMenu";
import type { Race, SeasonRound } from "@/lib/types";
import { Countdown, ErrorNote, Skeleton, Spoiler, cn } from "@/components/ui";
import { YearPicker } from "./YearPicker";

export function ScheduleView() {
  const year = useYearParam();
  const now = useNow(60_000);
  const { data: races, error } = useApi<Race[]>(`/api/schedule${yearQuery(year)}`);
  const { data: results } = useApi<SeasonRound[]>(`/api/season-results${yearQuery(year)}`);
  const season = races?.[0]?.season ?? year ?? new Date().getFullYear();
  const currentYear = now ? new Date(now).getFullYear() : season;

  const winners = new Map((results ?? []).map((r) => [r.round, r.results?.[0]]));
  const nextIndex = races && now ? races.findIndex((r) => Date.parse(r.date) + 3 * 3600_000 > now) : -1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{season} calendar</h1>
          <p className="text-sm text-muted">{races ? `${races.length} rounds` : " "}{now ? ` · times in ${timeZoneName()}` : ""}</p>
        </div>
        <YearPicker year={season} current={Math.max(currentYear, season)} />
      </div>

      {error && !races && <ErrorNote message={error} />}
      {!races && !error && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      )}

      {races && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {races.map((race, i) => {
            const done = now != null && Date.parse(race.date) + 3 * 3600_000 < now;
            const next = i === nextIndex;
            const winner = winners.get(race.round);
            return (
              <div
                key={race.round}
                className={cn(
                  "group relative flex flex-col rounded-2xl border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong has-[[aria-expanded=true]]:z-20",
                  next ? "border-accent ring-1 ring-accent/40 sm:col-span-2 xl:col-span-1" : "border-line",
                )}
              >
                <Link href={`/schedule/${race.round}${yearQuery(year)}`} className="absolute inset-0 rounded-2xl" aria-label={`${race.name} details`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted">
                      Round {race.round} · {now ? dateRange(race.sessions[0]?.start ?? race.date, race.date) : ""}
                    </p>
                    <p className="mt-0.5 truncate font-display text-xl font-bold">
                      <span className="mr-1.5">{countryFlag(race.circuit.country)}</span>
                      {race.name.replace(" Grand Prix", " GP")}
                    </p>
                    <p className="truncate text-sm text-muted">{race.circuit.name}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {next && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Next</span>}
                    {race.sprint && <span className="flex items-center gap-0.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted"><Zap size={11} />Sprint</span>}
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  {done ? (
                    winner ? (
                      <Spoiler label="Winner hidden" className="relative z-10 py-2">
                        <p className="flex items-center gap-2 text-sm">
                          <span className="text-faint">Winner</span>
                          <span className="font-semibold">{winner.driver.name}</span>
                          <span className="truncate text-xs text-muted">{winner.team}</span>
                        </p>
                      </Spoiler>
                    ) : (
                      <p className="text-sm text-muted">Results coming soon</p>
                    )
                  ) : next ? (
                    <div>
                      <p className="mb-1.5 text-xs text-muted">Race starts {localDay(race.date)}, {localTime(race.date)}</p>
                      <Countdown to={race.date} compact />
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Race {now ? `${localDay(race.date)}, ${localTime(race.date)}` : ""}</p>
                  )}
                </div>
                <ChevronRight size={16} className="pointer-events-none absolute right-3 bottom-4 text-faint transition-transform group-hover:translate-x-0.5" />
                {!done && now != null && (
                  <div className="absolute right-8 bottom-3 z-10">
                    <CalendarMenu race={race} variant="icon" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
