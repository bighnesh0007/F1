"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TYRES } from "@/lib/live";
import { formatLapTime } from "@/lib/format";
import { wearByStint, type WearLap } from "@/lib/tyres";
import { Tyre } from "@/components/ui";

const COLOURS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

// One driver's tyre wear: a line per stint (up to three), lap time against tyre age.
export function TyreWear({ laps }: { laps: WearLap[] }) {
  const stints = useMemo(() => wearByStint(laps).slice(-3), [laps]);
  const data = useMemo(() => {
    const rows: Record<number, Record<string, number>> = {};
    stints.forEach((s, i) => s.points.forEach((p) => ((rows[p.age] ??= { age: p.age })[`s${i}`] = p.time)));
    return Object.values(rows).sort((x, y) => x.age - y.age);
  }, [stints]);

  if (stints.length === 0) return <p className="py-6 text-center text-sm text-muted">Tyre wear shows once a few clean laps are done on a set.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {stints.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5 font-semibold">
            <span className="h-0.5 w-5 rounded-full" style={{ background: COLOURS[i] }} />
            <Tyre compound={s.compound} size={16} /> Stint {s.index} · {TYRES[s.compound ?? ""]?.name ?? "Unknown"}
            {s.slope != null && <span className="font-normal text-muted">({s.slope >= 0 ? "+" : "−"}{Math.abs(s.slope).toFixed(2)}s per lap)</span>}
          </span>
        ))}
      </div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} allowDecimals={false} tick={{ fontSize: 10, fill: "var(--faint)" }} tickLine={false} axisLine={false} label={{ value: "Laps on the tyres", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--faint)" }} height={30} />
            <YAxis domain={["dataMin - 0.3", "dataMax + 0.3"]} tickFormatter={(v) => formatLapTime(Number(v))} tick={{ fontSize: 10, fill: "var(--faint)" }} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelFormatter={(a) => `${a} laps on the tyres`}
              formatter={(v, k) => [formatLapTime(Number(v)), `Stint ${stints[Number(String(k).slice(1))]?.index ?? ""}`]}
            />
            {stints.map((_, i) => (
              <Line key={i} dataKey={`s${i}`} type="monotone" stroke={COLOURS[i]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: COLOURS[i] }} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">A rising line means the tyres are wearing and the car is getting slower. Pit laps and slow laps are left out.</p>
    </div>
  );
}
