"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronUp, Flame, ListOrdered, Star } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { isRaceSession, list } from "@/lib/live";
import { Card, Segmented, TeamBar, Tyre, cn } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type TowerRow = {
  number: string;
  position: number;
  timing: any;
  stint: any;
  gridPos: number | null;
};

export function useTowerRows(): TowerRow[] {
  const { topics } = useLive();
  const lines = topics.TimingData?.Lines ?? {};
  const app = topics.TimingAppData?.Lines ?? {};
  return Object.keys(lines)
    .filter((n) => /^\d+$/.test(n))
    .map((n) => ({
      number: n,
      position: Number(lines[n].Position ?? lines[n].Line ?? 99),
      timing: lines[n],
      stint: list(app[n]?.Stints).at(-1) ?? null,
      gridPos: Number(app[n]?.GridPos) || null,
    }))
    .sort((a, b) => a.position - b.position);
}

export const gapSeconds = (value?: string | null) => {
  if (!value) return null;
  const n = Number(String(value).replace("+", ""));
  return isFinite(n) ? n : null;
};

export function TimingTower({ onSelect }: { onSelect: (number: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const rows = useTowerRows();
  const race = isRaceSession(topics);
  const [gapMode, setGapMode] = useState<"leader" | "interval">("interval");

  return (
    <Card
      title="Timing"
      icon={<ListOrdered size={15} />}
      right={
        race ? (
          <Segmented
            size="sm"
            value={gapMode}
            onChange={setGapMode}
            options={[
              { value: "interval", label: "Interval" },
              { value: "leader", label: "Leader" },
            ]}
          />
        ) : null
      }
      bodyClassName="px-1.5 pb-2"
    >
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">Waiting for timing data…</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((row, i) => {
            const t = row.timing;
            const d = get(row.number);
            const favourite = settings.favouriteDriver === row.number;
            // "Stopped" also covers cars parked in the garage in practice, so only races show it.
            const out = t.Retired || t.KnockedOut || (race && t.Stopped);
            const interval = t.IntervalToPositionAhead?.Value ?? t.TimeDiffToPositionAhead ?? list(t.Stats).at(-1)?.TimeDiffToPositionAhead;
            const gap = t.GapToLeader ?? t.TimeDiffToFastest ?? list(t.Stats).at(-1)?.TimeDiffToFastest;
            const shown = race ? (gapMode === "interval" ? interval : gap) : gap;
            const intervalS = gapSeconds(interval);
            const battle = race && i > 0 && intervalS != null && intervalS < 1 && !t.InPit && !rows[i - 1].timing.InPit;
            const status = t.InPit ? "PIT" : t.PitOut ? "OUT" : t.Retired ? "OUT" : race && t.Stopped ? "STOP" : t.KnockedOut ? "KO" : null;
            const gained = race && row.gridPos ? row.gridPos - row.position : 0;
            const sectors = list(t.Sectors);

            return (
              <motion.button
                layout="position"
                transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
                key={row.number}
                onClick={() => onSelect(row.number)}
                className={cn(
                  "group grid w-full grid-cols-[28px_minmax(0,1fr)_auto_74px_44px] items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 sm:grid-cols-[28px_minmax(0,1fr)_auto_74px_80px_44px]",
                  favourite && "bg-surface-2 ring-1 ring-accent/60",
                  out && "opacity-45",
                )}
              >
                <span className="tnum text-center font-display text-base font-bold">{row.position < 99 ? row.position : "–"}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <TeamBar colour={d.colour} className="h-5 shrink-0" />
                  <span className="shrink-0 font-display text-[15px] font-bold tracking-wide">{d.tla}</span>
                  {favourite && <Star size={12} className="shrink-0 fill-current text-accent" />}
                  {status && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-muted">{status}</span>}
                  {battle && (
                    <span title={`Battle: ${intervalS!.toFixed(3)}s behind the car ahead`} className="flex shrink-0 items-center rounded-md bg-orange-500/15 p-0.5 text-orange-500">
                      <Flame size={12} />
                    </span>
                  )}
                  {gained !== 0 && !status && !battle && (
                    <span className={cn("hidden items-center text-[11px] font-semibold sm:flex", gained > 0 ? "text-good" : "text-bad")}>
                      {gained > 0 ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {Math.abs(gained)}
                    </span>
                  )}
                </span>
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((s) => (
                    <span key={s} className={cn("h-3 w-1 rounded-full", sectorColour(sectors[s]))} />
                  ))}
                </span>
                <span className="tnum text-right text-[13px] text-muted">{row.position === 1 && race ? (t.NumberOfLaps ? `Lap ${t.NumberOfLaps}` : "Leader") : shown || "–"}</span>
                <span className={cn("tnum hidden text-right text-[13px] sm:block", lapColour(t.LastLapTime))}>{t.LastLapTime?.Value || "–"}</span>
                <span className="flex justify-end">
                  <Tyre compound={row.stint?.Compound} laps={row.stint?.TotalLaps ?? null} isNew={row.stint?.New === true || row.stint?.New === "true"} size={18} />
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function sectorColour(sector?: { Value?: string; OverallFastest?: boolean; PersonalFastest?: boolean }) {
  if (!sector?.Value) return "bg-surface-3";
  if (sector.OverallFastest) return "bg-purple";
  if (sector.PersonalFastest) return "bg-good";
  return "bg-yellow";
}

function lapColour(t?: { OverallFastest?: boolean; PersonalFastest?: boolean }) {
  if (t?.OverallFastest) return "text-purple font-semibold";
  if (t?.PersonalFastest) return "text-good";
  return "text-muted";
}
