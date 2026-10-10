"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Cell } from "recharts";
import { LineChart as LineIcon } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers, type DriverInfo } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { isRaceSession, list, TYRES, type LapEntry } from "@/lib/live";
import { formatLapTime, parseLapTime } from "@/lib/format";
import { Card, Empty, Segmented, TeamBar, cn } from "@/components/ui";
import { gapSeconds, useTowerRows } from "./TimingTower";

type Tab = "gaps" | "laps" | "positions" | "strategy" | "h2h";
const MAX_HIGHLIGHT = 5;

export function Insights() {
  const { topics } = useLive();
  const race = isRaceSession(topics);
  const [tab, setTab] = useState<Tab>(race ? "gaps" : "laps");
  const rows = useTowerRows();
  const { settings } = useSettings();
  const [picked, setPicked] = useState<string[] | null>(null);

  // Default highlight: your favourite plus the top three.
  const defaults = useMemo(() => {
    const top = rows.slice(0, 3).map((r) => r.number);
    const fav = settings.favouriteDriver && rows.some((r) => r.number === settings.favouriteDriver) ? [settings.favouriteDriver] : [];
    return [...new Set([...fav, ...top])];
  }, [rows, settings.favouriteDriver]);
  const selected = picked ?? defaults;

  const toggle = (n: string) => {
    const next = selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n].slice(-MAX_HIGHLIGHT);
    setPicked(next);
  };

  const tabs: { value: Tab; label: string }[] = [
    ...(race ? [{ value: "gaps" as Tab, label: "Gaps" }] : []),
    { value: "laps", label: "Lap times" },
    ...(race ? [{ value: "positions" as Tab, label: "Positions" }] : []),
    { value: "strategy", label: "Tyres" },
    { value: "h2h", label: "Head-to-head" },
  ];
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value;

  return (
    <Card title="Insights" icon={<LineIcon size={15} />} right={<div className="max-w-full overflow-x-auto"><Segmented size="sm" value={active} onChange={setTab} options={tabs} /></div>}>
      {active !== "strategy" && active !== "h2h" && <DriverChips rows={rows.map((r) => r.number)} selected={selected} onToggle={toggle} />}
      {active === "gaps" && <GapChart selected={selected} />}
      {active === "laps" && <LapChart selected={selected} />}
      {active === "positions" && <PositionChart selected={selected} />}
      {active === "strategy" && <StrategyChart />}
      {active === "h2h" && <HeadToHead initial={[selected[0], selected[1]]} />}
    </Card>
  );
}

function DriverChips({ rows, selected, onToggle }: { rows: string[]; selected: string[]; onToggle: (n: string) => void }) {
  const { get } = useDrivers();
  return (
    <div className="scroll-thin -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {rows.map((n) => {
        const d = get(n);
        const on = selected.includes(n);
        return (
          <button
            key={n}
            onClick={() => onToggle(n)}
            aria-pressed={on}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-xs font-bold", on ? "border-transparent bg-surface-3 text-ink" : "border-line text-faint hover:text-muted")}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: on ? `#${d.colour}` : "var(--border-strong)" }} />
            {d.tla}
          </button>
        );
      })}
    </div>
  );
}

// ---- data helpers ---------------------------------------------------------------

function useLapHistory() {
  const { topics } = useLive();
  return useMemo(() => {
    const out: Record<string, LapEntry[]> = {};
    for (const [n, laps] of Object.entries<Record<string, LapEntry>>(topics.LapHistory ?? {})) {
      out[n] = Object.values(laps).filter((l) => l && l.lap != null).sort((a, b) => a.lap - b.lap);
    }
    return out;
  }, [topics.LapHistory]);
}

// Teammates share a team colour, so the second one is drawn dashed.
function lineStyles(numbers: string[], get: (n: string) => DriverInfo) {
  const seen = new Map<string, number>();
  const out: Record<string, { colour: string; dash?: string }> = {};
  for (const n of numbers) {
    const d = get(n);
    const count = seen.get(d.colour) ?? 0;
    seen.set(d.colour, count + 1);
    out[n] = { colour: `#${d.colour}`, dash: count > 0 ? "5 4" : undefined };
  }
  return out;
}

const axis = { stroke: "var(--faint)", fontSize: 11, tickLine: false, axisLine: { stroke: "var(--border)" } };

function ChartTooltip({ active, payload, label, format, get }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: number; format: (v: number) => string; get: (n: string) => DriverInfo }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value != null && !String(p.dataKey).startsWith("_")).sort((a, b) => a.value - b.value);
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold">Lap {label}</p>
      {items.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <TeamBar colour={get(p.dataKey).colour} className="h-3" />
          <span className="w-9 font-display font-bold">{get(p.dataKey).tla}</span>
          <span className="tnum text-muted">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function NotEnoughLaps() {
  return <Empty title="Charts fill in as laps are completed">Lap-by-lap history starts from when the server connected to this session.</Empty>;
}

function Legend({ numbers, styles }: { numbers: string[]; styles: Record<string, { colour: string; dash?: string }> }) {
  const { get } = useDrivers();
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {numbers.map((n) => (
        <span key={n} className="flex items-center gap-1.5">
          <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={styles[n].colour} strokeWidth="2" strokeDasharray={styles[n].dash} /></svg>
          <span className="font-display font-bold text-ink">{get(n).tla}</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="var(--border-strong)" strokeWidth="1" /></svg>Others</span>
    </div>
  );
}

// ---- charts -----------------------------------------------------------------------

function MultiLineChart({ selected, valueOf, format, tickFormat, reversed, domain }: {
  selected: string[];
  valueOf: (lap: LapEntry) => number | null;
  format: (v: number) => string;
  tickFormat?: (v: number) => string;
  reversed?: boolean;
  domain?: [number | string, number | string];
}) {
  const history = useLapHistory();
  const { get } = useDrivers();
  const numbers = Object.keys(history);
  const data = useMemo(() => {
    const maxLap = Math.max(0, ...numbers.flatMap((n) => history[n].map((l) => l.lap)));
    const rows: Record<string, number | null>[] = [];
    for (let lap = 1; lap <= maxLap; lap++) rows.push({ lap });
    for (const n of numbers) for (const l of history[n]) if (rows[l.lap - 1]) rows[l.lap - 1][n] = valueOf(l);
    return rows;
  }, [history, numbers, valueOf]);

  if (data.length < 2) return <NotEnoughLaps />;
  const shown = selected.filter((n) => numbers.includes(n));
  const styles = lineStyles(shown, get);
  const others = numbers.filter((n) => !shown.includes(n));

  return (
    <>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="lap" {...axis} />
            <YAxis {...axis} reversed={reversed} domain={domain ?? ["auto", "auto"]} tickFormatter={(v) => (tickFormat ?? format)(v)} width={58} />
            <Tooltip content={<ChartTooltip format={format} get={get} />} cursor={{ stroke: "var(--border-strong)" }} />
            {others.map((n) => (
              <Line key={n} dataKey={n} stroke="var(--border-strong)" strokeWidth={1} dot={false} isAnimationActive={false} connectNulls activeDot={false} />
            ))}
            {shown.map((n) => (
              <Line key={n} dataKey={n} stroke={styles[n].colour} strokeDasharray={styles[n].dash} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend numbers={shown} styles={styles} />
    </>
  );
}

function GapChart({ selected }: { selected: string[] }) {
  const valueOf = useMemo(() => (l: LapEntry) => (l.position === 1 ? 0 : gapSeconds(l.gap)), []);
  return <MultiLineChart selected={selected} valueOf={valueOf} format={(v) => (v === 0 ? "Leader" : `+${v.toFixed(1)}s`)} reversed />;
}

function LapChart({ selected }: { selected: string[] }) {
  const history = useLapHistory();
  // Hide pit and safety-car laps so the scale stays readable.
  const cutoff = useMemo(() => {
    const times = Object.values(history).flatMap((laps) => laps.map((l) => parseLapTime(l.time))).filter((t): t is number => t != null).sort((a, b) => a - b);
    return times.length ? times[Math.floor(times.length * 0.5)] * 1.12 : Infinity;
  }, [history]);
  const valueOf = useMemo(() => (l: LapEntry) => {
    const t = parseLapTime(l.time);
    return t != null && t <= cutoff && !l.pit ? t : null;
  }, [cutoff]);
  return (
    <>
      <MultiLineChart selected={selected} valueOf={valueOf} format={formatLapTime} tickFormat={(v) => formatLapTime(v).replace(/\.\d+$/, "")} />
      <p className="mt-1 text-xs text-faint">Pit, out and safety-car laps are left out.</p>
    </>
  );
}

function PositionChart({ selected }: { selected: string[] }) {
  const valueOf = useMemo(() => (l: LapEntry) => l.position, []);
  return <MultiLineChart selected={selected} valueOf={valueOf} format={(v) => `P${v}`} reversed domain={[1, "dataMax"]} />;
}

function StrategyChart() {
  const { topics } = useLive();
  const { get } = useDrivers();
  const rows = useTowerRows();
  const totalLaps = Number(topics.LapCount?.TotalLaps) || 0;
  const data = rows.map((r) => {
    const stints = list<{ Compound?: string; TotalLaps?: number; StartLaps?: number; New?: string | boolean }>(topics.TimingAppData?.Lines?.[r.number]?.Stints);
    return { number: r.number, position: r.position, stints };
  });
  const maxLaps = Math.max(totalLaps, ...data.map((d) => d.stints.reduce((s, x) => s + (x.TotalLaps ?? 0) - (x.StartLaps ?? 0), 0)), 1);
  if (data.every((d) => d.stints.length === 0)) return <Empty title="No tyre data yet" />;

  return (
    <div>
      <div className="space-y-1">
        {data.map((d) => {
          const driver = get(d.number);
          return (
            <div key={d.number} className="grid grid-cols-[52px_1fr] items-center gap-2">
              <span className="flex items-center gap-1.5 font-display text-xs font-bold"><TeamBar colour={driver.colour} className="h-3.5" />{driver.tla}</span>
              <div className="flex h-5 gap-[2px]">
                {d.stints.map((s, i) => {
                  const laps = Math.max((s.TotalLaps ?? 0) - (s.StartLaps ?? 0), 0.5);
                  const tyre = TYRES[s.Compound ?? ""];
                  return (
                    <div
                      key={i}
                      title={`${tyre?.name ?? s.Compound ?? "Unknown"} · ${laps} laps${s.New === true || s.New === "true" ? " (new)" : ""}`}
                      className="flex items-center justify-center overflow-hidden rounded-[4px] font-display text-[10px] font-bold text-black/75"
                      style={{ width: `${(laps / maxLaps) * 100}%`, background: tyre?.color ?? "var(--surface-3)" }}
                    >
                      {laps / maxLaps > 0.06 ? tyre?.short : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {Object.values(TYRES).map((t) => (
          <span key={t.short} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />{t.name}</span>
        ))}
        {totalLaps > 0 && <span className="ml-auto">Race distance: {totalLaps} laps</span>}
      </div>
    </div>
  );
}

function HeadToHead({ initial }: { initial: (string | undefined)[] }) {
  const rows = useTowerRows();
  const { get } = useDrivers();
  const { topics } = useLive();
  const history = useLapHistory();
  const [a, setA] = useState(initial[0] ?? rows[0]?.number ?? "");
  const [b, setB] = useState(initial[1] ?? rows[1]?.number ?? "");
  const da = get(a);
  const db = get(b);
  const lines = topics.TimingData?.Lines ?? {};

  const lapsA = new Map((history[a] ?? []).map((l) => [l.lap, parseLapTime(l.time)]));
  const lapsB = new Map((history[b] ?? []).map((l) => [l.lap, parseLapTime(l.time)]));
  const deltas = [...lapsA.keys()]
    .filter((lap) => lapsA.get(lap) != null && lapsB.get(lap) != null)
    .map((lap) => ({ lap, delta: Number((lapsB.get(lap)! - lapsA.get(lap)!).toFixed(3)) }))
    .filter((d) => Math.abs(d.delta) < 5);

  const avg = (m: Map<number, number | null>) => {
    const v = [...m.values()].filter((x): x is number => x != null).slice(-5);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const best = (n: string) => parseLapTime(lines[n]?.BestLapTime?.Value);
  const stats = [
    { label: "Position", a: lines[a]?.Position, b: lines[b]?.Position, lowerBetter: true },
    { label: "Best lap", a: best(a), b: best(b), fmt: formatLapTime, lowerBetter: true },
    { label: "Last lap", a: parseLapTime(lines[a]?.LastLapTime?.Value), b: parseLapTime(lines[b]?.LastLapTime?.Value), fmt: formatLapTime, lowerBetter: true },
    { label: "Avg last 5", a: avg(lapsA), b: avg(lapsB), fmt: formatLapTime, lowerBetter: true },
    { label: "Pit stops", a: lines[a]?.NumberOfPitStops ?? 0, b: lines[b]?.NumberOfPitStops ?? 0 },
  ];
  const sameTeam = da.colour === db.colour;
  const colourA = `#${da.colour}`;
  const colourB = sameTeam ? "var(--muted)" : `#${db.colour}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <DriverSelect value={a} onChange={setA} rows={rows.map((r) => r.number)} />
        <span className="text-xs font-bold text-faint">VS</span>
        <DriverSelect value={b} onChange={setB} rows={rows.map((r) => r.number)} />
      </div>
      <table className="w-full text-sm">
        <tbody>
          {stats.map((s) => {
            const na = Number(s.a);
            const nb = Number(s.b);
            const aWins = s.lowerBetter && s.a != null && s.b != null && isFinite(na) && isFinite(nb) && na < nb;
            const bWins = s.lowerBetter && s.a != null && s.b != null && isFinite(na) && isFinite(nb) && nb < na;
            const fmt = (v: unknown) => (v == null || v === "" ? "–" : s.fmt ? s.fmt(Number(v)) : String(v));
            return (
              <tr key={s.label} className="border-b border-line last:border-0">
                <td className={cn("tnum py-1.5 text-left", aWins && "font-bold text-good")}>{fmt(s.a)}</td>
                <td className="py-1.5 text-center text-xs text-muted">{s.label}</td>
                <td className={cn("tnum py-1.5 text-right", bWins && "font-bold text-good")}>{fmt(s.b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {deltas.length >= 2 ? (
        <div>
          <p className="mb-1 text-xs text-muted">
            Lap time difference per lap: bars above the line mean <b className="text-ink">{da.tla}</b> was faster, below the line <b className="text-ink">{db.tla}</b>.
          </p>
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={deltas} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="lap" {...axis} />
                <YAxis {...axis} width={48} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}s`} />
                <ReferenceLine y={0} stroke="var(--border-strong)" />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
                        <p className="font-semibold">Lap {label}</p>
                        <p className="text-muted">
                          {Number(payload[0].value) >= 0 ? da.tla : db.tla} faster by {Math.abs(Number(payload[0].value)).toFixed(3)}s
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="delta" radius={[4, 4, 4, 4]} isAnimationActive={false}>
                  {deltas.map((d) => (
                    <Cell key={d.lap} fill={d.delta >= 0 ? colourA : colourB} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <NotEnoughLaps />
      )}
    </div>
  );
}

function DriverSelect({ value, onChange, rows }: { value: string; onChange: (n: string) => void; rows: string[] }) {
  const { get } = useDrivers();
  const d = get(value);
  return (
    <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <TeamBar colour={d.colour} className="h-6" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent font-display font-bold outline-none">
        {rows.map((n) => (
          <option key={n} value={n}>
            {get(n).tla} · {get(n).fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
