"use client";

import { AnimatePresence, motion } from "motion/react";
import { Timer, Wrench } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { useNow } from "@/lib/useNow";
import { list, type LiveEvent } from "@/lib/live";
import { Card, TeamBar, Tyre, cn } from "@/components/ui";
import { useTowerRows } from "@/components/live/TimingTower";
import { useStops } from "./PitsAndTitle";


const DEFAULT_LANE_S = 22;

// The pit lane as a strip from entry to exit: every car in the lane moves along it
// with a running timer, and the latest finished stops are listed underneath.
export function PitLane({ onSelect, focus }: { onSelect: (n: string) => void; focus: string | null }) {
  const { topics, feedNow } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const rows = useTowerRows();
  const stops = useStops();
  const now = useNow(500);

  // Typical time in the lane at this track (median of this session's stops).
  const lanes = stops.map((s) => s.lane).filter((v): v is number => v != null && v > 5 && v < 60).sort((a, b) => a - b);
  const laneS = lanes.length ? lanes[Math.floor(lanes.length / 2)] : DEFAULT_LANE_S;

  const pitIns = list<LiveEvent>(topics.Events).filter((e) => e.type === "pitIn" && e.driver);
  const inLane = rows
    .filter((r) => r.timing?.InPit || r.timing?.PitOut)
    .map((r) => {
      const entered = pitIns.findLast((e) => e.driver === r.number);
      const elapsed = entered && now != null ? Math.max(0, (feedNow() - Date.parse(entered.ts)) / 1000) : null;
      // Cars flagged "pit out" are on their way to the exit line.
      const progress = r.timing?.PitOut ? 0.92 : elapsed != null ? Math.min(0.85, elapsed / laneS) : 0.5;
      return { row: r, elapsed, progress };
    });
  const recent = stops.slice(0, 4);

  if (inLane.length === 0 && recent.length === 0) {
    return (
      <Card title="Pit lane" icon={<Wrench size={15} />}>
        <Lane laneS={laneS}>{null}</Lane>
        <p className="mt-3 text-center text-sm text-muted">No one has pitted yet.</p>
      </Card>
    );
  }

  return (
    <Card title="Pit lane" icon={<Wrench size={15} />} right={<span className="text-xs text-muted">{inLane.length ? `${inLane.length} in the lane` : `typical lane time ${laneS.toFixed(1)}s`}</span>}>
      <Lane laneS={laneS}>
        <AnimatePresence>
          {inLane.map(({ row, elapsed, progress }) => {
            const d = get(row.number);
            return (
              <motion.button
                key={row.number}
                onClick={() => onSelect(row.number)}
                initial={{ opacity: 0, left: "0%" }}
                animate={{ opacity: 1, left: `${progress * 100}%` }}
                exit={{ opacity: 0, left: "100%" }}
                transition={{ duration: settings.reduceMotion ? 0 : 0.6, ease: "linear" }}
                className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                aria-label={`${d.tla} in the pit lane`}
              >
                <span className={cn("rounded-md px-1.5 py-0.5 font-display text-xs font-bold text-white shadow-card", focus === row.number && "ring-2 ring-accent")} style={{ background: `#${d.colour}` }}>
                  {d.tla}
                </span>
                {elapsed != null && <span className="tnum mt-0.5 text-[10px] font-semibold text-ink">{elapsed > 90 ? "Garage" : `${elapsed.toFixed(1)}s`}</span>}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </Lane>

      {recent.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {recent.map((s, i) => {
            const d = get(s.driver);
            return (
              <li key={`${s.driver}-${s.lap}-${i}`}>
                <button onClick={() => onSelect(s.driver)} className={cn("flex w-full items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2 text-left hover:bg-surface-3", focus === s.driver && "ring-1 ring-accent/60")}>
                  <TeamBar colour={d.colour} className="h-6" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold">
                      {d.tla} {s.lap ? <span className="text-xs font-normal text-muted">· Lap {s.lap}</span> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {s.stationary != null && <span className="font-semibold text-ink"><Timer size={11} className="mr-0.5 inline" />{s.stationary.toFixed(1)}s</span>}
                      {s.lane != null && ` · lane ${s.lane.toFixed(1)}s`}
                      {s.change ? <span className={s.change > 0 ? "text-good" : "text-bad"}> · {s.change > 0 ? `+${s.change}` : s.change}</span> : null}
                    </p>
                  </div>
                  {s.compound && <Tyre compound={s.compound} isNew={s.newTyres} size={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Lane({ laneS, children }: { laneS: number; children: React.ReactNode }) {
  return (
    <div className="relative px-6 pt-5 pb-6">
      <div className="relative h-11 rounded-full border border-dashed border-line bg-surface-2">
        {/* Boxes along the middle of the lane. */}
        <div className="absolute inset-y-2 right-[20%] left-[20%] flex justify-between" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="w-[6%] rounded-sm bg-surface-3" />
          ))}
        </div>
        {children}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold tracking-wider text-faint uppercase">
        <span>Pit entry</span>
        <span>Boxes</span>
        <span>Exit · ~{laneS.toFixed(0)}s</span>
      </div>
    </div>
  );
}
