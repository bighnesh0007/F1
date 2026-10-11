"use client";

// Extra layers drawn on a circuit map (inside CircuitMapView's render prop, so in
// the map's screen space).
import { nearestFraction, pathBetween, type Track } from "@/lib/track";
import type { CircuitMap, LapTelemetry } from "@/lib/types";

// Marshal sectors under yellow flags, drawn over that stretch of track.
export function FlagOverlay({ track, map, active }: { track: Track; map: CircuitMap; active: Map<number, "yellow" | "double"> }) {
  const marks = (map.marshalSectors ?? []).slice().sort((a, b) => a.number - b.number);
  if (active.size === 0 || marks.length < 2) return null;
  const fractions = marks.map((m) => nearestFraction(track, track.toScreen(m.x, m.y)));
  return (
    <g pointerEvents="none" aria-label="Yellow flags">
      {[...active.entries()].map(([sector, kind]) => {
        const i = marks.findIndex((m) => m.number === sector);
        if (i < 0) return null;
        const d = pathBetween(track, fractions[i], fractions[(i + 1) % fractions.length], 0, 40);
        return (
          <g key={sector}>
            <path d={d} fill="none" stroke="#facc15" strokeWidth={track.size / (kind === "double" ? 22 : 28)} strokeLinecap="round" opacity={0.45} />
            <path d={d} fill="none" stroke="#facc15" strokeWidth={track.size / 160} strokeLinecap="round" strokeDasharray={kind === "double" ? undefined : `${track.size / 80} ${track.size / 120}`} />
          </g>
        );
      })}
    </g>
  );
}

// One lap's speed painted along the track: slow is close to the track colour,
// fast stands out (one-hue ramp, light/dark aware).
export function SpeedOverlay({ track, lap }: { track: Track; lap: LapTelemetry }) {
  const min = Math.min(...lap.speed);
  const max = Math.max(...lap.speed);
  const span = max - min || 1;
  const segments = [];
  for (let i = 1; i < lap.x.length; i++) {
    const [x0, y0, x1, y1] = [lap.x[i - 1], lap.y[i - 1], lap.x[i], lap.y[i]];
    if (x0 == null || y0 == null || x1 == null || y1 == null) continue;
    const a = track.toScreen(x0, y0);
    const b = track.toScreen(x1, y1);
    const p = Math.round(((lap.speed[i] - min) / span) * 100);
    segments.push(<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeLinecap="round" style={{ stroke: `color-mix(in oklab, var(--speed-fast) ${p}%, var(--speed-slow))` }} strokeWidth={track.size / 60} />);
  }
  return <g pointerEvents="none" aria-label={`Speed along the lap, ${min} to ${max} km/h`}>{segments}</g>;
}

// The real pit lane, traced from a car's positions during a stop.
export function PitLanePath({ track, points }: { track: Track; points: [number, number][] }) {
  const pts = points.map(([x, y]) => track.toScreen(x, y));
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ");
  const mid = pts[Math.floor(pts.length / 2)];
  return (
    <g pointerEvents="none" aria-label="Pit lane">
      <path d={d} fill="none" stroke="var(--surface-3)" strokeWidth={track.size / 75} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#eab308" strokeWidth={track.size / 420} strokeDasharray={`${track.size / 300} ${track.size / 160}`} strokeLinecap="round" opacity={0.85} />
      <text x={mid.x} y={mid.y - track.size / 40} fontSize={track.size / 60} textAnchor="middle" fill="#eab308" className="font-display font-bold select-none">
        PIT
      </text>
    </g>
  );
}

// A short fading tail behind a car (its last few positions).
export function Trail({ points, colour, size }: { points: { x: number; y: number }[]; colour: string; size: number }) {
  if (points.length < 2) return null;
  return (
    <g pointerEvents="none">
      {points.slice(1).map((p, i) => {
        const a = points[i];
        return <line key={i} x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke={`#${colour}`} strokeWidth={size / 90} strokeLinecap="round" opacity={0.08 + (0.4 * (i + 1)) / points.length} />;
      })}
    </g>
  );
}

// Lap fractions where sectors 2 and 3 start: exact from the sector-line points when
// known, otherwise estimated from typical sector times.
export function sectorFractions(track: Track | null, points?: [[number, number], [number, number]] | null, times?: [number, number, number] | null): [number, number] | null {
  if (track && points) {
    const [a, b] = points.map(([x, y]) => nearestFraction(track, track.toScreen(x, y)));
    if (a > 0.02 && b > a && b < 0.98) return [a, b];
  }
  if (times) {
    const total = times[0] + times[1] + times[2];
    return [times[0] / total, (times[0] + times[1]) / total];
  }
  return null;
}
