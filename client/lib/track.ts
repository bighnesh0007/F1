// Geometry for circuit maps: rotation into screen space and lookup of a point at a
// given fraction of the lap.
import type { CircuitMap } from "./types";

export type Pt = { x: number; y: number };

export type Track = {
  points: Pt[]; // screen space (y down)
  fractions: number[]; // lap fraction (by time when known, else distance) at each point
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  size: number;
  toScreen: (x: number, y: number) => Pt;
  at: (fraction: number) => Pt;
};

export function buildTrack(map: CircuitMap): Track {
  const r = (map.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const toScreen = (x: number, y: number) => ({ x: x * cos - y * sin, y: -(x * sin + y * cos) });
  const points = map.x.map((x, i) => toScreen(x, map.y[i]));

  let fractions: number[];
  const t = map.time;
  if (t && t.length === points.length && t[t.length - 1] > t[0]) {
    fractions = t.map((v) => (v - t[0]) / (t[t.length - 1] - t[0]));
  } else {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const total = cumulative[cumulative.length - 1] || 1;
    fractions = cumulative.map((c) => c / total);
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;

  const at = (fraction: number) => {
    const f = ((fraction % 1) + 1) % 1;
    let lo = 0;
    let hi = fractions.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fractions[mid] <= f) lo = mid;
      else hi = mid;
    }
    const span = fractions[hi] - fractions[lo] || 1;
    const k = Math.min(Math.max((f - fractions[lo]) / span, 0), 1);
    return { x: points[lo].x + (points[hi].x - points[lo].x) * k, y: points[lo].y + (points[hi].y - points[lo].y) * k };
  };

  return { points, fractions, bounds, size, toScreen, at };
}

// Mini-sector timing reaches us after the car has actually crossed the timing point,
// so the estimate ran ahead of the real car. Measured against real GPS positions over a
// full session (2021 Bahrain FP3, ~32,000 samples), drawing cars 1.75 s "later" cut the
// median error from 81 m to 28 m (p90 147 m -> 121 m), consistently in both halves.
export const TIMING_LAG_MS = 1750;

// Where a car should be drawn right now, extrapolated from its last mini-sector.
export function estimateFraction(
  p: { p?: number; pMax?: number; t?: number; lapMs?: number },
  feedNow: number,
  slowdown = 1,
): number | null {
  if (p.p == null || p.t == null || !p.lapMs) return null;
  const elapsed = feedNow - p.t - TIMING_LAG_MS;
  const projected = p.p + elapsed / (p.lapMs * slowdown);
  // Never run past the next timing point; wait there until the car is seen crossing it.
  const limit = p.pMax != null ? (p.pMax >= 1 ? 0.999 : p.pMax + 0.004) : projected;
  const f = Math.min(projected, limit);
  return f < 0 ? f + 1 : f; // just after the line, the car is still finishing the last lap
}

// SVG path along the track from fraction `from` forward to `to` (wrapping past the line).
export function pathBetween(track: Track, from: number, to: number, offset = 0, samples = 80) {
  const span = (((to - from) % 1) + 1) % 1;
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) pts.push(offsetAt(track, from + (span * i) / samples, offset));
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ");
}

// A point beside the track: `offset` > 0 is towards the inside of the circuit.
export function offsetAt(track: Track, f: number, offset: number): Pt {
  const p = track.at(f);
  if (!offset) return p;
  const a = track.at(f - 0.002);
  const b = track.at(f + 0.002);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / len;
  let ny = (b.x - a.x) / len;
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cy = (track.bounds.minY + track.bounds.maxY) / 2;
  if ((cx - p.x) * nx + (cy - p.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: p.x + nx * offset, y: p.y + ny * offset };
}

// The long, nearly straight parts of the lap (where cars run flat out), as
// [start, end] lap fractions. Worked out from the shape of the track only.
export function findStraights(track: Track, minShare = 0.05, maxTurnDeg = 14): [number, number][] {
  const { points, fractions } = track;
  const n = points.length;
  if (n < 20) return [];
  const heading = (i: number) => {
    const a = points[(i + n) % n];
    const b = points[(i + 3 + n) % n];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const turn = (i: number) => {
    let d = heading(i + 2) - heading(i - 2);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs((d * 180) / Math.PI);
  };
  const straight = points.map((_, i) => turn(i) < maxTurnDeg * 0.35);
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const s = i < n && straight[i];
    if (s && start < 0) start = i;
    if (!s && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  // Join a run that wraps across the finish line.
  if (runs.length > 1 && runs[0][0] === 0 && runs.at(-1)![1] === n - 1) {
    const last = runs.pop()!;
    runs[0] = [last[0], runs[0][1] + n];
  }
  const fracAt = (i: number) => fractions[i % n] + Math.floor(i / n);
  return runs
    .map(([a, b]) => [fracAt(a), fracAt(b)] as [number, number])
    .filter(([a, b]) => b - a >= minShare)
    .map(([a, b]) => [a % 1, b % 1]);
}
