"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, Flame, ListOrdered, Star } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { useNow } from "@/lib/useNow";
import { TYRES, isRaceSession, list, type LiveEvent } from "@/lib/live";
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

const MOVE_WINDOW_MS = 12_000;

// Places each driver gained (+) or lost (−) in the last few seconds, from the
// overtakes in the race feed. Rows flash and show an arrow while this is non-zero.
function useRecentMoves() {
  const { topics, feedNow } = useLive();
  const now = useNow(1000);
  const moves = new Map<string, number>();
  if (now == null) return moves;
  const since = feedNow() - MOVE_WINDOW_MS;
  for (const e of list<LiveEvent>(topics.Events).slice(-60)) {
    if (e.type !== "overtake" || !e.driver || Date.parse(e.ts) < since) continue;
    moves.set(e.driver, (moves.get(e.driver) ?? 0) + 1);
    if (e.passed) moves.set(e.passed, (moves.get(e.passed) ?? 0) - 1);
  }
  return moves;
}

export function TimingTower({ onSelect, focus = null }: { onSelect: (number: string) => void; focus?: string | null }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const rows = useTowerRows();
  const race = isRaceSession(topics);
  const [gapMode, setGapMode] = useState<"leader" | "interval">("interval");
  const moves = useRecentMoves();

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

            const moved = moves.get(row.number) ?? 0;
            const open = focus === row.number;

            return (
              <motion.div layout="position" transition={{ type: "spring", bounce: 0.15, duration: 0.6 }} key={row.number}>
                <button
                  onClick={() => onSelect(row.number)}
                  aria-expanded={open}
                  className={cn(
                    "group relative grid w-full grid-cols-[28px_minmax(0,1fr)_auto_74px_44px] items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2 sm:grid-cols-[28px_minmax(0,1fr)_auto_74px_80px_44px]",
                    favourite && !open && "bg-surface-2 ring-1 ring-accent/60",
                    open && "bg-surface-2 ring-1 ring-accent",
                    out && "opacity-45",
                  )}
                >
                  {/* A short flash of green or red when the driver has just gained or lost places. */}
                  <AnimatePresence>
                    {moved !== 0 && !settings.reduceMotion && (
                      <motion.span
                        key={moved > 0 ? "up" : "down"}
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 0.08 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.6 }}
                        className={cn("pointer-events-none absolute inset-0", moved > 0 ? "bg-good" : "bg-bad")}
                      />
                    )}
                  </AnimatePresence>
                  <span className="tnum relative text-center font-display text-base font-bold">{row.position < 99 ? row.position : "–"}</span>
                  <span className="relative flex min-w-0 items-center gap-2">
                    <TeamBar colour={d.colour} className="h-5 shrink-0" />
                    <span className="shrink-0 font-display text-[15px] font-bold tracking-wide">{d.tla}</span>
                    {favourite && <Star size={12} className="shrink-0 fill-current text-accent" />}
                    {moved !== 0 ? (
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn("flex items-center rounded-md px-1 text-[11px] font-bold", moved > 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}
                      >
                        {moved > 0 ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {Math.abs(moved)}
                      </motion.span>
                    ) : (
                      <>
                        {status && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-muted">{status}</span>}
                        {battle && (
                          <span title={`Battle: ${intervalS!.toFixed(3)}s behind the car ahead`} className="flex shrink-0 items-center rounded-md bg-orange-500/15 p-0.5 text-orange-500">
                            <Flame size={12} />
                          </span>
                        )}
                        {gained !== 0 && !status && !battle && (
                          <span className={cn("hidden items-center text-[11px] font-semibold sm:flex", gained > 0 ? "text-good" : "text-bad")} title="Places since the start">
                            {gained > 0 ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {Math.abs(gained)}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span className="relative flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((s) => (
                      <span key={s} className={cn("h-3 w-1 rounded-full", sectorColour(sectors[s]))} />
                    ))}
                  </span>
                  <span className="tnum relative text-right text-[13px] text-muted">{row.position === 1 && race ? (t.NumberOfLaps ? `Lap ${t.NumberOfLaps}` : "Leader") : shown || "–"}</span>
                  <span className={cn("tnum relative hidden text-right text-[13px] sm:block", lapColour(t.LastLapTime))}>{t.LastLapTime?.Value || "–"}</span>
                  <span className="relative flex justify-end">
                    <Tyre compound={row.stint?.Compound} laps={row.stint?.TotalLaps ?? null} isNew={row.stint?.New === true || row.stint?.New === "true"} size={18} />
                  </span>
                </button>
                <AnimatePresence initial={false}>{open && <RowDetail row={row} race={race} />}</AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// The followed driver's row opens up: tyre and stint, stops, laps, sector times.
function RowDetail({ row, race }: { row: TowerRow; race: boolean }) {
  const t = row.timing;
  const stint = row.stint;
  const tyre = stint?.Compound ? TYRES[stint.Compound] : null;
  const age = stint ? Math.max(0, (Number(stint.TotalLaps) || 0) - (Number(stint.StartLaps) || 0)) : null;
  const sectors = list<{ Value?: string; OverallFastest?: boolean; PersonalFastest?: boolean }>(t.Sectors);
  const items = [
    { label: "Tyre", value: tyre ? `${stint?.New === true || stint?.New === "true" ? "New" : "Used"} ${tyre.name}${age != null ? ` · ${age} laps` : ""}` : "–" },
    { label: "Best lap", value: t.BestLapTime?.Value || "–" },
    { label: race ? "Gap to leader" : "To fastest", value: t.GapToLeader || t.TimeDiffToFastest || "–" },
    { label: race ? "Pit stops" : "Laps", value: race ? String(t.NumberOfPitStops ?? 0) : String(t.NumberOfLaps ?? 0) },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-2 mt-1 mb-2 grid grid-cols-2 gap-1.5 rounded-xl bg-surface-2/60 p-2 text-xs">
        {items.map((i) => (
          <div key={i.label} className="min-w-0">
            <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{i.label}</p>
            <p className="tnum truncate font-semibold">{i.value}</p>
          </div>
        ))}
        <div className="col-span-2 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg bg-surface px-2 py-1">
              <p className="text-[10px] font-semibold text-faint">S{i + 1}</p>
              <p className={cn("tnum font-semibold", sectors[i]?.OverallFastest ? "text-purple" : sectors[i]?.PersonalFastest ? "text-good" : "")}>{sectors[i]?.Value || "–"}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
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
