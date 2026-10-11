"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Swords, X } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { TYRES, type LapEntry } from "@/lib/live";
import { compare, type CompareCar } from "@/lib/compare";
import { Card, Headshot, Tyre, cn } from "@/components/ui";
import { useTowerRows, type TowerRow } from "@/components/live/TimingTower";

function useHistory() {
  const { topics } = useLive();
  return useMemo(() => {
    const out: Record<string, LapEntry[]> = {};
    for (const [n, laps] of Object.entries<Record<string, LapEntry>>(topics.LapHistory ?? {})) {
      out[n] = Object.values(laps ?? {}).sort((a, b) => a.lap - b.lap);
    }
    return out;
  }, [topics.LapHistory]);
}

function toCar(row: TowerRow, history: LapEntry[]): CompareCar {
  const t = row.timing ?? {};
  const stint = row.stint;
  return {
    number: row.number,
    position: row.position,
    gapToLeader: t.GapToLeader,
    interval: t.IntervalToPositionAhead?.Value,
    compound: stint?.Compound ?? null,
    tyreAge: stint ? Math.max(0, (Number(stint.TotalLaps) || 0) - (Number(stint.StartLaps) || 0)) : null,
    stops: Number(t.NumberOfPitStops) || 0,
    history,
  };
}

const fmtLap = (ms: number | null) => (ms == null ? "–" : `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`);

export type CompareDriver = { tla: string; colour: string; fullName: string; headshot: string | null };

// Live race: builds the two cars from the timing tower and lap history.
export function ComparePanel({ numbers, onClose, onRemove }: { numbers: string[]; onClose: () => void; onRemove: (n: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const rows = useTowerRows();
  const history = useHistory();
  const cars = numbers
    .map((n) => rows.find((r) => r.number === n))
    .filter((r): r is TowerRow => r != null)
    .map((r) => toCar(r, history[r.number] ?? []));
  return (
    <CompareView
      picked={numbers}
      cars={cars}
      lap={Number(topics.LapCount?.CurrentLap) || null}
      total={Number(topics.LapCount?.TotalLaps) || null}
      driver={(n) => get(n)}
      onClose={onClose}
      onRemove={onRemove}
    />
  );
}

// Two drivers side by side: the gap between them, whether it is shrinking, and an
// overtake read worked out from the timing (not an AI guess). Used live and in replays.
export function CompareView({
  picked,
  cars,
  lap,
  total,
  driver,
  onClose,
  onRemove,
}: {
  picked: string[];
  cars: CompareCar[];
  lap: number | null;
  total: number | null;
  driver: (n: string) => CompareDriver;
  onClose: () => void;
  onRemove: (n: string) => void;
}) {
  if (picked.length < 2 || cars.length < 2) {
    return (
      <Card title="Compare" icon={<Swords size={15} />} right={<CloseButton onClose={onClose} />}>
        <p className="py-3 text-center text-sm text-muted">
          {picked.length === 0 ? "Tap two cars on the map (or two rows in the timing) to compare them." : `${driver(picked[0]).tla} picked. Tap one more car.`}
        </p>
      </Card>
    );
  }

  const c = compare(cars[0], cars[1], lap, total);
  const A = driver(c.ahead.number);
  const B = driver(c.behind.number);
  const drs = c.gap != null && c.gap <= 1;

  // The gap at the end of each of the last laps, for the little chart.
  const aheadByLap = new Map(c.ahead.history.map((l) => [l.lap, l]));
  const trend = c.behind.history
    .map((l) => {
      const o = aheadByLap.get(l.lap);
      const ga = o ? (o.position === 1 ? 0 : Number(String(o.gap ?? "").replace("+", ""))) : NaN;
      const gb = Number(String(l.gap ?? "").replace("+", ""));
      return { lap: l.lap, gap: gb - ga };
    })
    .filter((x) => Number.isFinite(x.gap) && x.gap >= 0)
    .slice(-8);
  const maxGap = Math.max(1, ...trend.map((x) => x.gap));

  return (
    <Card title="Compare" icon={<Swords size={15} />} right={<CloseButton onClose={onClose} />}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <DriverSide row={c.ahead} label="Ahead" colour={A.colour} name={A.fullName} tla={A.tla} headshot={A.headshot} onRemove={() => onRemove(c.ahead.number)} />
        <div className="text-center">
          <motion.p key={Math.round((c.gap ?? 0) * 10)} initial={{ scale: 0.92, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className={cn("tnum font-display text-3xl leading-none font-bold", drs ? "text-good" : "")}>
            {c.gap != null ? `${c.gap.toFixed(3)}s` : "–"}
          </motion.p>
          <p className="mt-1 text-[10px] font-semibold tracking-wider text-faint uppercase">{drs ? "DRS range" : "Gap"}</p>
          {c.closing != null && Math.abs(c.closing) > 0.02 && (
            <p className={cn("tnum mt-1 text-xs font-semibold", c.closing > 0 ? "text-good" : "text-bad")}>
              {c.closing > 0 ? "▼" : "▲"} {Math.abs(c.closing).toFixed(2)}s / lap
            </p>
          )}
        </div>
        <DriverSide row={c.behind} label="Behind" colour={B.colour} name={B.fullName} tla={B.tla} headshot={B.headshot} onRemove={() => onRemove(c.behind.number)} right />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted">Overtake chance</p>
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", c.chance === "High" ? "bg-good/20 text-good" : c.chance === "Medium" ? "bg-yellow/20 text-yellow" : "bg-surface-3 text-muted")}>{c.chance}</span>
          </div>
          {c.reasons.length ? (
            <ul className="space-y-1 text-sm">
              {c.reasons.map((r) => (
                <li key={r} className="flex gap-2"><span className="text-faint">•</span>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Not enough laps yet to read the trend.</p>
          )}
          {c.lapsToDrs != null && c.lapsToDrs > 0 && <p className="mt-2 text-xs text-muted">DRS range in about {Math.ceil(c.lapsToDrs)} lap{Math.ceil(c.lapsToDrs) === 1 ? "" : "s"}.</p>}
          <p className="mt-2 text-[11px] text-faint">Worked out from the gaps, lap times and tyres. Not a guarantee.</p>
        </div>

        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-2 text-xs font-semibold text-muted">Gap at the end of each lap</p>
          {trend.length < 2 ? (
            <p className="text-sm text-muted">Fills in as laps are completed.</p>
          ) : (
            <div className="flex h-20 items-end gap-1.5">
              {trend.map((x) => (
                <div key={x.lap} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Lap ${x.lap}: ${x.gap.toFixed(3)}s`}>
                  <div className={cn("w-full rounded-t", x.gap <= 1 ? "bg-good" : "bg-accent/70")} style={{ height: `${Math.max(6, (x.gap / maxGap) * 100)}%` }} />
                  <span className="text-[9px] text-faint">{x.lap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <table className="mt-3 w-full text-sm">
        <tbody className="[&_td]:py-1">
          <Row label="Recent pace" a={fmtLap(c.paceAhead)} b={fmtLap(c.paceBehind)} better={c.paceAhead != null && c.paceBehind != null ? (c.paceAhead < c.paceBehind ? "a" : "b") : null} />
          <Row label="Last lap" a={c.ahead.history.at(-1)?.time ?? "–"} b={c.behind.history.at(-1)?.time ?? "–"} />
          <Row
            label="Tyres"
            a={<Tyre compound={c.ahead.compound} laps={c.ahead.tyreAge} size={18} />}
            b={<Tyre compound={c.behind.compound} laps={c.behind.tyreAge} size={18} />}
            title={`${TYRES[c.ahead.compound ?? ""]?.name ?? "?"} vs ${TYRES[c.behind.compound ?? ""]?.name ?? "?"}`}
          />
          <Row label="Pit stops" a={String(c.ahead.stops)} b={String(c.behind.stops)} />
        </tbody>
      </table>
    </Card>
  );
}

function DriverSide({ row, label, colour, name, tla, headshot, onRemove, right }: { row: CompareCar; label: string; colour: string; name: string; tla: string; headshot: string | null; onRemove: () => void; right?: boolean }) {
  return (
    <div className={cn("relative flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5", right && "flex-row-reverse text-right")} style={{ background: `linear-gradient(${right ? 225 : 135}deg, #${colour}40, transparent 75%)` }}>
      <Headshot src={headshot} colour={colour} size={48} alt={tla} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label} · P{row.position}</p>
        <p className="truncate font-display text-lg leading-tight font-bold">{tla}</p>
        <p className="truncate text-xs text-muted">{name}</p>
      </div>
      <button onClick={onRemove} aria-label={`Remove ${tla}`} className={cn("absolute top-1.5 rounded p-0.5 text-faint hover:text-ink", right ? "left-1.5" : "right-1.5")}>
        <X size={12} />
      </button>
    </div>
  );
}

function Row({ label, a, b, better, title }: { label: string; a: React.ReactNode; b: React.ReactNode; better?: "a" | "b" | null; title?: string }) {
  return (
    <tr title={title}>
      <td className={cn("tnum w-1/3 text-left font-semibold", better === "a" && "text-good")}>{a}</td>
      <td className="text-center text-xs text-muted">{label}</td>
      <td className={cn("tnum w-1/3 text-right font-semibold", better === "b" && "text-good")}><span className="inline-flex justify-end">{b}</span></td>
    </tr>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
      <X size={13} /> Done
    </button>
  );
}

