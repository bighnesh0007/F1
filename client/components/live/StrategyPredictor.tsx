"use client";

import { AlertTriangle, Flag, Info } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { list, TYRES } from "@/lib/live";
import { Empty, TeamBar, Tyre, cn } from "@/components/ui";
import { gapSeconds, useTowerRows } from "./TimingTower";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Typical stint lengths for a ~57-lap race; scaled to the actual race distance.
const TYPICAL_LIFE: Record<string, number> = { SOFT: 18, MEDIUM: 28, HARD: 38, INTERMEDIATE: 30, WET: 40 };
const DEFAULT_PIT_LOSS = 22;
const DRY = new Set(["SOFT", "MEDIUM", "HARD"]);

export type StrategyRow = {
  number: string;
  position: number;
  compound: string | null;
  age: number;
  life: number | null;
  /** Laps until the usual pit window opens (0 = open now); null = can reach the end. */
  windowIn: number | null;
  mustStop: boolean;
  rejoin: { position: number; ahead: string | null; behind: string | null; marginAhead: number | null; marginBehind: number | null } | null;
  threat: string | null;
};

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);

// Time lost by a pit stop here: measured from this session's stops when there are some.
export function pitLossSeconds(topics: any): { seconds: number; measured: boolean } {
  const lane: number[] = [];
  for (const stops of Object.values<any>(topics.PitStopSeries?.PitTimes ?? {})) {
    for (const s of Object.values<any>(stops ?? {})) {
      const v = Number((s?.PitStop ?? s)?.PitLaneTime);
      if (v > 10 && v < 60) lane.push(v);
    }
  }
  for (const p of Object.values<any>(topics.PitLaneTimeCollection?.PitTimes ?? {})) {
    const v = Number(p?.Duration);
    if (v > 10 && v < 60) lane.push(v);
  }
  const m = median(lane);
  return m ? { seconds: m, measured: true } : { seconds: DEFAULT_PIT_LOSS, measured: false };
}

// Pure so it can be tested: who should pit when, where they'd rejoin, who is under threat.
export function predictStrategy(rows: { number: string; position: number; timing: any; stints: any[] }[], totalLaps: number, currentLap: number, pitLoss: number): StrategyRow[] {
  const scale = totalLaps > 0 ? totalLaps / 57 : 1;
  const lapsLeft = totalLaps > 0 ? Math.max(totalLaps - currentLap, 0) : null;
  const running = rows.filter((r) => !r.timing?.Retired && !r.timing?.Stopped);
  const gapOf = (r: (typeof rows)[number]) => (r.position === 1 ? 0 : gapSeconds(r.timing?.GapToLeader));

  return running.map((r, i) => {
    const stint = r.stints.at(-1);
    const compound = stint?.Compound && stint.Compound !== "UNKNOWN" ? String(stint.Compound) : null;
    // Tyre age counts laps from earlier sessions on a used set too.
    const age = Number(stint?.TotalLaps) || 0;
    const life = compound && TYPICAL_LIFE[compound] ? Math.round(TYPICAL_LIFE[compound] * scale) : null;
    // In the dry, two different compounds must be used.
    const used = new Set(r.stints.map((s) => s.Compound).filter((c) => DRY.has(c)));
    const mustStop = used.size === 1 && r.stints.every((s) => DRY.has(s.Compound));
    const canFinish = lapsLeft != null && life != null && life - age >= lapsLeft && !mustStop;
    const windowIn = canFinish || life == null ? null : Math.max(0, Math.round(life * 0.75) - age);

    // Where they would come out if they pitted at the end of this lap.
    const gap = gapOf(r);
    let rejoin: StrategyRow["rejoin"] = null;
    if (gap != null) {
      const after = gap + pitLoss;
      const others = running
        .filter((o) => o.number !== r.number)
        .map((o) => ({ number: o.number, gap: gapOf(o) }))
        .filter((o): o is { number: string; gap: number } => o.gap != null)
        .sort((a, b) => a.gap - b.gap);
      const aheadList = others.filter((o) => o.gap < after);
      const ahead = aheadList.at(-1) ?? null;
      const behind = others.find((o) => o.gap >= after) ?? null;
      rejoin = {
        position: aheadList.length + 1,
        ahead: ahead?.number ?? null,
        behind: behind?.number ?? null,
        marginAhead: ahead ? after - ahead.gap : null,
        marginBehind: behind ? behind.gap - after : null,
      };
    }

    // Undercut threat: the car behind is close and our tyres are due a change.
    const chaser = running[i + 1];
    const chaserInterval = chaser ? gapSeconds(chaser.timing?.IntervalToPositionAhead?.Value ?? chaser.timing?.TimeDiffToPositionAhead) : null;
    const threat = chaser && chaserInterval != null && chaserInterval < 3 && windowIn === 0 ? chaser.number : null;

    return { number: r.number, position: r.position, compound, age, life, windowIn, mustStop, rejoin, threat };
  });
}

export function StrategyPredictor({ focus }: { focus?: string | null }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const tower = useTowerRows();
  const totalLaps = Number(topics.LapCount?.TotalLaps) || 0;
  const currentLap = Number(topics.LapCount?.CurrentLap) || 0;
  const loss = pitLossSeconds(topics);
  const rows = predictStrategy(
    tower.map((r) => ({ number: r.number, position: r.position, timing: r.timing, stints: list(topics.TimingAppData?.Lines?.[r.number]?.Stints) })),
    totalLaps,
    currentLap,
    loss.seconds,
  );
  if (rows.length === 0 || rows.every((r) => !r.compound)) return <Empty title="Strategy appears once tyre data arrives" />;

  return (
    <div>
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Estimates from tyre age and typical stint lengths. A stop costs about <b className="text-ink">{loss.seconds.toFixed(1)}s</b>
          {loss.measured ? " (measured in this race)" : " (typical; updated once cars pit)"}. &ldquo;If they pit now&rdquo; shows where they would rejoin.
        </span>
      </p>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold tracking-wider text-faint uppercase">
              <th className="py-1.5 pr-2">Pos</th>
              <th className="pr-2">Driver</th>
              <th className="pr-2">Tyres</th>
              <th className="pr-2">Pit window</th>
              <th className="pr-2">If they pit now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = get(r.number);
              const tyre = r.compound ? TYRES[r.compound] : null;
              const worn = r.life != null && r.age >= r.life;
              return (
                <tr key={r.number} className={cn("border-t border-line", focus === r.number && "bg-surface-2")}>
                  <td className="tnum py-1.5 pr-2 font-display font-bold">{r.position < 99 ? r.position : "–"}</td>
                  <td className="pr-2">
                    <span className="flex items-center gap-1.5 font-display font-bold">
                      <TeamBar colour={d.colour} className="h-4" />
                      {d.tla}
                      {r.threat && (
                        <span title={`${get(r.threat).tla} is within 3s and could undercut`} className="flex items-center gap-1 rounded-md bg-bad/15 px-1.5 py-0.5 text-[10px] font-bold text-bad">
                          <AlertTriangle size={11} /> Undercut risk
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="pr-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Tyre compound={r.compound} size={18} />
                      <span className={cn(worn ? "font-semibold text-bad" : "text-muted")}>
                        {r.age} lap{r.age === 1 ? "" : "s"}
                        {r.life ? ` / ~${r.life}` : ""}
                      </span>
                      {!tyre && <span className="text-faint">?</span>}
                    </span>
                  </td>
                  <td className="pr-2 text-xs">
                    {r.windowIn == null ? (
                      <span className="flex items-center gap-1 text-good"><Flag size={12} /> Can reach the end</span>
                    ) : r.windowIn === 0 ? (
                      <span className="font-semibold text-yellow">Open now{r.mustStop ? " · must stop" : ""}</span>
                    ) : (
                      <span className="text-muted">In ~{r.windowIn} laps{r.mustStop ? " · must stop" : ""}</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {r.rejoin ? (
                      <span className="text-muted">
                        <b className="text-ink">P{r.rejoin.position}</b>
                        {r.rejoin.ahead && <> behind {get(r.rejoin.ahead).tla}{r.rejoin.marginAhead != null && ` (+${r.rejoin.marginAhead.toFixed(1)}s)`}</>}
                        {r.rejoin.marginBehind != null && r.rejoin.marginBehind < 1.5 && <span className="ml-1 text-bad">· traffic</span>}
                      </span>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
