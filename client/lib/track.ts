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

// Where a car should be drawn right now, extrapolated from its last mini-sector.
export function estimateFraction(
  p: { p?: number; pMax?: number; t?: number; lapMs?: number },
  feedNow: number,
  slowdown = 1,
): number | null {
  if (p.p == null || p.t == null || !p.lapMs) return null;
  const elapsed = Math.max(0, feedNow - p.t);
  const projected = p.p + elapsed / (p.lapMs * slowdown);
  // Never run past the next timing point; wait there until the car is seen crossing it.
  const limit = p.pMax != null ? (p.pMax >= 1 ? 0.999 : p.pMax + 0.004) : projected;
  return Math.min(projected, limit);
}
