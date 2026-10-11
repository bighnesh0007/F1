"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { list, type LiveEvent } from "@/lib/live";
import { Spoiler, TeamBar, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Stop = { driver: string; lap: number | null; ts: string | null; stationary: number | null; lane: number | null; compound?: string; newTyres?: boolean; change?: number | null; sc?: boolean };

// Pit stops this session: stationary and pit-lane times where the feed has them,
// plus the tyres fitted and places gained or lost (from the derived race events).
export function useStops(): Stop[] {
  const { topics } = useLive();
  return useMemo(() => {
    const exits = list<LiveEvent>(topics.Events).filter((e) => e.type === "pitOut" && e.driver);
    const series: Stop[] = [];
    for (const [driver, stops] of Object.entries<any>(topics.PitStopSeries?.PitTimes ?? {})) {
      for (const s of Object.values<any>(stops ?? {})) {
        const p = s?.PitStop ?? s;
        series.push({
          driver: String(p?.RacingNumber ?? driver),
          lap: Number(p?.Lap) || null,
          ts: s?.Timestamp ?? null,
          stationary: Number(p?.PitStopTime) || null,
          lane: Number(p?.PitLaneTime) || null,
        });
      }
    }
    const base: Stop[] = series.length
      ? series
      : exits.map((e) => ({ driver: e.driver!, lap: e.lap ?? null, ts: e.ts, stationary: null, lane: null }));
    // Add the lane time from PitLaneTimeCollection (latest stop per driver) when missing.
    for (const p of Object.values<any>(topics.PitLaneTimeCollection?.PitTimes ?? {})) {
      const last = [...base].reverse().find((s) => s.driver === String(p?.RacingNumber) && (p?.Lap == null || s.lap == null || String(s.lap) === String(p.Lap)));
      if (last && last.lane == null) last.lane = Number(p?.Duration) || null;
    }
    // Tyres and places from the matching pit exit event.
    for (const stop of base) {
      const exit = exits.find((e) => e.driver === stop.driver && (stop.lap == null || e.lap == null || Math.abs(e.lap - stop.lap) <= 1));
      if (exit) Object.assign(stop, { compound: exit.compound, newTyres: exit.newTyres, change: exit.change, lap: stop.lap ?? exit.lap ?? null, ts: stop.ts ?? exit.ts });
    }
    // Was the track neutralised (safety car or VSC) when the car stopped? Those stops cost less.
    const statuses = list<LiveEvent>(topics.Events).filter((e) => e.type === "trackStatus");
    for (const stop of base) {
      const at = Date.parse(stop.ts ?? "");
      if (!at) continue;
      const status = statuses.filter((e) => Date.parse(e.ts) <= at).at(-1)?.status;
      stop.sc = ["4", "6", "7"].includes(String(status));
    }
    return base.sort((a, b) => (Date.parse(b.ts ?? "") || 0) - (Date.parse(a.ts ?? "") || 0));
  }, [topics.Events, topics.PitStopSeries, topics.PitLaneTimeCollection]);
}

// The championship as it would stand if the race finished now (from F1's feed).
export function LiveChampionship() {
  const { topics } = useLive();
  const { get } = useDrivers();
  const drivers = Object.values<any>(topics.ChampionshipPrediction?.Drivers ?? {})
    .filter((d) => d?.RacingNumber && d.PredictedPosition)
    .sort((a, b) => a.PredictedPosition - b.PredictedPosition)
    .slice(0, 12);
  if (drivers.length === 0) return <p className="py-8 text-center text-sm text-muted">The live championship appears during races.</p>;
  const leader = drivers[0].PredictedPoints ?? 0;
  return (
    <Spoiler label="Live championship hidden">
      <p className="mb-2 text-xs text-muted">If the race finished now</p>
      <ol className="space-y-1">
        {drivers.map((c) => {
          const d = get(String(c.RacingNumber));
          const move = (c.CurrentPosition ?? c.PredictedPosition) - c.PredictedPosition;
          const gained = (c.PredictedPoints ?? 0) - (c.CurrentPoints ?? 0);
          return (
            <li key={c.RacingNumber} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <span className="w-5 text-center font-display font-bold">{c.PredictedPosition}</span>
              <span className={cn("flex w-6 items-center text-[11px] font-semibold", move > 0 ? "text-good" : move < 0 ? "text-bad" : "text-faint")}>
                {move > 0 ? <ChevronUp size={13} /> : move < 0 ? <ChevronDown size={13} /> : "–"}
                {move !== 0 && Math.abs(move)}
              </span>
              <TeamBar colour={d.colour} className="h-5" />
              <span className="flex-1 font-medium">{d.fullName}</span>
              {gained > 0 && <span className="text-xs text-good">+{gained}</span>}
              <span className="tnum w-10 text-right text-xs text-faint">{c.PredictedPosition === 1 ? "" : `−${Math.max(0, leader - (c.PredictedPoints ?? 0))}`}</span>
              <span className="tnum w-10 text-right font-display font-bold">{c.PredictedPoints}</span>
            </li>
          );
        })}
      </ol>
    </Spoiler>
  );
}
