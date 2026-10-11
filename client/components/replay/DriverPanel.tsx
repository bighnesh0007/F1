"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Gauge, Loader2, X } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { formatLapTime } from "@/lib/format";
import { TyreWear } from "@/components/live/TyreWear";
import { alignLaps, drivingNotes, fullThrottleShare, traceAt, wingOpen } from "@/lib/telemetry";
import type { CarTrace, CircuitMap, LapTelemetry, Replay } from "@/lib/types";
import { Card, Headshot, Segmented, cn } from "@/components/ui";
import type { ReplayLap } from "./board";

type Driver = Replay["drivers"][number];
type Tab = "onboard" | "lap" | "tyres";
export type LapPick = { driver: string; lap: number } | null;

// The followed driver, in three simple views: what the car is doing right now, how
// one lap was driven (optionally against another lap), and how the tyres wore.
export function DriverPanel({
  replay,
  driver,
  t,
  laps,
  lapA,
  lapB,
  lapNumber,
  onLapNumber,
  vs,
  onVs,
  vsOptions,
  map,
  onClose,
}: {
  replay: Replay;
  driver: Driver;
  t: number;
  laps: ReplayLap[];
  lapA: { data: LapTelemetry | null; loading: boolean; error: string | null };
  lapB: { data: LapTelemetry | null; driver: Driver | null };
  lapNumber: number | null;
  onLapNumber: (lap: number | "fastest") => void;
  vs: string;
  onVs: (v: string) => void;
  vsOptions: { value: string; label: string }[];
  map: CircuitMap | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("onboard");
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Headshot src={driver.headshot} colour={driver.teamColour} size={26} alt={driver.tla} />
          {driver.fullName}
        </span>
      }
      right={
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "onboard", label: "Onboard" },
              { value: "lap", label: "Lap" },
              { value: "tyres", label: "Tyres" },
            ]}
          />
          <button onClick={onClose} aria-label="Stop following" className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <X size={15} />
          </button>
        </div>
      }
    >
      {tab === "onboard" && <Onboard replay={replay} driver={driver} t={t} />}
      {tab === "lap" && <LapView driver={driver} laps={laps} lapA={lapA} lapB={lapB} lapNumber={lapNumber} onLapNumber={onLapNumber} vs={vs} onVs={onVs} vsOptions={vsOptions} map={map} />}
      {tab === "tyres" && <TyreView replay={replay} driver={driver} laps={laps} t={t} />}
    </Card>
  );
}

// --- Onboard -----------------------------------------------------------------

function Onboard({ replay, driver, t }: { replay: Replay; driver: Driver; t: number }) {
  const { data, error } = useApi<CarTrace>(`/api/replay/car?path=${encodeURIComponent(replay.path)}&driver=${driver.number}`);
  if (error) return <p className="py-6 text-center text-sm text-muted">Car data isn&apos;t available for this session.</p>;
  if (!data) return <Loading text="Loading car data. The first time can take a few seconds…" />;
  const now = traceAt(data, t);
  if (!now) return <p className="py-6 text-center text-sm text-muted">The car isn&apos;t running right now.</p>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-4 rounded-2xl bg-surface-2 px-5 py-4">
        <div className="text-center">
          <p className="tnum font-display text-5xl leading-none font-bold">{now.speed}</p>
          <p className="mt-1 text-[10px] font-semibold tracking-wider text-faint uppercase">km/h</p>
        </div>
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 font-display text-3xl font-bold" style={{ borderColor: `#${driver.teamColour}` }} aria-label={`Gear ${now.gear}`}>
          {now.gear === 0 ? "N" : now.gear}
        </div>
      </div>
      <div className="space-y-2.5">
        <Meter label="Throttle" value={now.throttle} text={`${now.throttle}%`} colour="var(--good)" />
        <Meter label="Brake" value={now.brake ? 100 : 0} text={now.brake ? "On" : "Off"} colour="var(--bad)" />
        <Meter label="Engine" value={(now.rpm / 13000) * 100} text={`${now.rpm.toLocaleString()} rpm`} colour="var(--series-1)" />
        <p className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold", wingOpen(now.drs) ? "bg-good/20 text-good" : "bg-surface-3 text-faint")} title="DRS, or the low-drag straight mode on 2026 cars">
          <Gauge size={12} /> Rear wing {wingOpen(now.drs) ? "open" : "closed"}
        </p>
      </div>
    </div>
  );
}

function Meter({ label, value, text, colour }: { label: string; value: number; text: string; colour: string }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tnum font-semibold">{text}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: colour }} />
      </div>
    </div>
  );
}

// --- Lap ---------------------------------------------------------------------

function LapView({
  driver,
  laps,
  lapA,
  lapB,
  lapNumber,
  onLapNumber,
  vs,
  onVs,
  vsOptions,
  map,
}: {
  driver: Driver;
  laps: ReplayLap[];
  lapA: { data: LapTelemetry | null; loading: boolean; error: string | null };
  lapB: { data: LapTelemetry | null; driver: Driver | null };
  lapNumber: number | null;
  onLapNumber: (lap: number | "fastest") => void;
  vs: string;
  onVs: (v: string) => void;
  vsOptions: { value: string; label: string }[];
  map: CircuitMap | null;
}) {
  const a = lapA.data;
  const b = lapB.data;
  const points = useMemo(() => (a ? alignLaps(a, b) : []), [a, b]);
  // Where each corner falls along the lap, for labels on the charts.
  const corners = useMemo(() => {
    if (!a || !map?.corners.length || map.source !== "multiviewer") return [];
    return map.corners.map((c) => {
      let best = 0;
      let bestD = Infinity;
      a.x.forEach((x, i) => {
        const y = a.y[i];
        if (x == null || y == null) return;
        const d = (x - c.x) ** 2 + (y - c.y) ** 2;
        if (d < bestD) [bestD, best] = [d, i];
      });
      return { label: `T${c.number}${c.letter ?? ""}`, d: a.d[best] };
    });
  }, [a, map]);
  const completed = laps.filter((l) => l.time);
  const idx = completed.findIndex((l) => l.lap === lapNumber);

  if (completed.length === 0) return <p className="py-6 text-center text-sm text-muted">{driver.tla} hasn&apos;t completed a timed lap yet at this point of the replay.</p>;

  const nameA = driver.tla;
  // The other lap is named by its driver (and its lap number when it is the same driver).
  const nameB = !lapB.driver ? "" : lapB.driver.number === driver.number ? `${nameA} L${b?.lap ?? ""}` : lapB.driver.tla;
  const top = (l: LapTelemetry | null) => (l ? Math.max(...l.speed) : null);
  const notes = a ? drivingNotes(a) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl bg-surface-2 p-1">
          <button disabled={idx <= 0} onClick={() => onLapNumber(completed[idx - 1].lap)} className="rounded-lg p-1.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Previous lap">
            <ChevronLeft size={15} />
          </button>
          <span className="tnum px-2 text-sm font-semibold">Lap {lapNumber ?? "–"}</span>
          <button disabled={idx < 0 || idx >= completed.length - 1} onClick={() => onLapNumber(completed[idx + 1].lap)} className="rounded-lg p-1.5 text-muted hover:text-ink disabled:opacity-30" aria-label="Next lap">
            <ChevronRight size={15} />
          </button>
        </div>
        <button onClick={() => onLapNumber("fastest")} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">Fastest so far</button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          Compare with
          <select value={vs} onChange={(e) => onVs(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink outline-none">
            {vsOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {lapA.error ? (
        <p className="py-6 text-center text-sm text-muted">Telemetry for this lap isn&apos;t available.</p>
      ) : !a ? (
        <Loading text="Loading the lap's telemetry. The first lap of a session takes a few seconds…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Lap time" a={formatLapTime(a.lapMs / 1000)} b={b ? deltaText(b.lapMs - a.lapMs, nameB) : null} />
            <Tile label="Top speed" a={`${top(a)} km/h`} b={b ? `${nameB} ${top(b)}` : null} />
            <Tile label="Full throttle" a={`${fullThrottleShare(a)}% of the lap`} b={b ? `${nameB} ${fullThrottleShare(b)}%` : null} />
          </div>

          <Legend a={nameA} b={b ? nameB : null} />
          <Chart title="Speed (km/h)" height={190} points={points} corners={corners} keys={["a", "b"]} domain={["dataMin - 10", "dataMax + 5"]} names={[nameA, nameB]} unit=" km/h" />
          <Chart title="Throttle (%)" height={90} points={points} corners={[]} keys={["aThrottle", "bThrottle"]} domain={[0, 100]} names={[nameA, nameB]} unit="%" />
          <BrakeStrip points={points} names={[nameA, b ? nameB : null]} />
          {b && <Chart title={`Gap: above the line ${nameB} is slower than ${nameA} (s)`} height={110} points={points} corners={[]} keys={["delta"]} domain={["auto", "auto"]} names={[nameB]} unit=" s" zero />}

          {notes.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              {notes.map((n) => (
                <li key={n} className="flex gap-2"><span className="text-faint">•</span>{n}</li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-faint">From the car&apos;s own telemetry. Battery and fuel use aren&apos;t published, so notes about them are a best guess.</p>
        </>
      )}
    </div>
  );
}

const deltaText = (ms: number, name: string) => `${name} ${ms >= 0 ? "+" : "−"}${Math.abs(ms / 1000).toFixed(3)}s`;

function Tile({ label, a, b }: { label: string; a: string; b: string | null }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      <p className="tnum truncate font-display text-base font-bold">{a}</p>
      {b && <p className="tnum truncate text-xs text-muted">{b}</p>}
    </div>
  );
}

function Legend({ a, b }: { a: string; b: string | null }) {
  return (
    <div className="flex items-center gap-4 text-xs font-semibold">
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: "var(--series-1)" }} />{a}</span>
      {b && <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: "var(--series-2)", backgroundImage: "linear-gradient(90deg, transparent 50%, var(--surface) 50%)", backgroundSize: "6px 2px" }} />{b}</span>}
    </div>
  );
}

type Point = ReturnType<typeof alignLaps>[number];

function Chart({
  title,
  height,
  points,
  corners,
  keys,
  domain,
  names,
  unit,
  zero,
}: {
  title: string;
  height: number;
  points: Point[];
  corners: { label: string; d: number }[];
  keys: (keyof Point)[];
  domain: [number | string, number | string];
  names: string[];
  unit: string;
  zero?: boolean;
}) {
  const colours = ["var(--series-1)", "var(--series-2)"];
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted">{title}</p>
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={points} syncId="lap" margin={{ top: corners.length ? 14 : 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis domain={domain} tick={{ fontSize: 10, fill: "var(--faint)" }} tickLine={false} axisLine={false} width={44} />
            {zero && <ReferenceLine y={0} stroke="var(--border-strong)" />}
            {corners.map((c) => (
              <ReferenceLine key={c.label} x={c.d} stroke="var(--border)" strokeDasharray="2 3" label={{ value: c.label, position: "top", fontSize: 9, fill: "var(--faint)" }} />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelFormatter={(d) => `${Math.round(Number(d))} m into the lap`}
              formatter={(v, _k, item) => [`${v}${unit}`, names[keys.indexOf(item.dataKey as keyof Point)] ?? ""]}
            />
            {keys.map((k, i) => (
              <Line key={String(k)} dataKey={k} type="monotone" dot={false} strokeWidth={2} stroke={colours[i]} strokeDasharray={i === 1 ? "5 3" : undefined} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Where each driver is on the brakes, as two thin strips along the lap.
function BrakeStrip({ points, names }: { points: Point[]; names: [string, string | null] }) {
  const length = points.at(-1)?.d || 1;
  const runs = (key: "aBrake" | "bBrake") => {
    const out: [number, number][] = [];
    let start: number | null = null;
    points.forEach((p, i) => {
      const on = p[key] === 1;
      if (on && start == null) start = p.d;
      if ((!on || i === points.length - 1) && start != null) {
        out.push([start, p.d]);
        start = null;
      }
    });
    return out;
  };
  const rows: ["aBrake" | "bBrake", string, string][] = [["aBrake", names[0], "var(--series-1)"]];
  if (names[1]) rows.push(["bBrake", names[1], "var(--series-2)"]);
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted">Braking</p>
      <div className="space-y-1">
        {rows.map(([key, name, colour]) => (
          <div key={key} className="grid grid-cols-[2.6rem_minmax(0,1fr)] items-center gap-2 text-[11px] font-semibold">
            <span>{name}</span>
            <div className="relative h-2.5 rounded-full bg-surface-3">
              {runs(key).map(([from, to], i) => (
                <span key={i} className="absolute inset-y-0 rounded-full" style={{ left: `${(from / length) * 100}%`, width: `${Math.max(0.6, ((to - from) / length) * 100)}%`, background: colour }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Tyres -------------------------------------------------------------------

function TyreView({ replay, driver, laps, t }: { replay: Replay; driver: Driver; laps: ReplayLap[]; t: number }) {
  const stops = (replay.stops ?? []).filter((s) => s.n === driver.number && s.t <= t);
  return (
    <div className="space-y-4">
      <TyreWear laps={laps} />
      {stops.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Pit stops</p>
          <ul className="space-y-1 text-sm">
            {stops.map((s) => (
              <li key={s.t} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-surface-2 px-3 py-1.5">
                <b className="font-display">Lap {s.lap}</b>
                <span className="text-muted">{s.lane.toFixed(1)}s in the pit lane</span>
                {s.loss != null && <span className="text-muted">· cost about {s.loss.toFixed(1)}s</span>}
                {s.sc && <span className="rounded bg-yellow/20 px-1.5 text-[11px] font-bold text-yellow">Under safety car or VSC: cheaper stop</span>}
              </li>
            ))}
          </ul>
          {replay.pitLoss != null && <p className="mt-1 text-xs text-muted">A normal stop here costs about {replay.pitLoss.toFixed(1)}s.</p>}
        </div>
      )}
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <Loader2 size={15} className="animate-spin" /> {text}
    </p>
  );
}
