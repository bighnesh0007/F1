// Lap telemetry maths: full-throttle zones, the time gap between two laps along the
// lap, and short driving notes. Everything here is worked out from speed, throttle
// and brake samples; nothing is guessed by AI.
import type { CarTrace, LapTelemetry } from "./types";

export type Zone = { from: number; to: number; i0: number; i1: number }; // metres, sample indices

// Stretches at (nearly) full throttle without the brake, at least `minLength` long.
export function fullThrottleZones(lap: LapTelemetry, minLength = 120): Zone[] {
  const zones: Zone[] = [];
  let start = -1;
  for (let i = 0; i <= lap.d.length; i++) {
    const flat = i < lap.d.length && lap.throttle[i] >= 98 && !lap.brake[i];
    if (flat && start < 0) start = i;
    if (!flat && start >= 0) {
      if (lap.d[i - 1] - lap.d[start] >= minLength) zones.push({ from: lap.d[start], to: lap.d[i - 1], i0: start, i1: i - 1 });
      start = -1;
    }
  }
  return zones;
}

// Share of the lap distance spent at full throttle (0-100).
export function fullThrottleShare(lap: LapTelemetry) {
  const total = lap.d.at(-1) ?? 0;
  if (!total) return 0;
  let flat = 0;
  const isFlat = (i: number) => lap.throttle[i] >= 98 && !lap.brake[i];
  for (let i = 1; i < lap.d.length; i++) if (isFlat(i) && isFlat(i - 1)) flat += lap.d[i] - lap.d[i - 1];
  return Math.round((flat / total) * 100);
}

// Value of `ys` at distance d (linear between samples).
function at(ds: number[], ys: number[], d: number) {
  if (ds.length === 0) return NaN;
  if (d <= ds[0]) return ys[0];
  let lo = 0;
  let hi = ds.length - 1;
  if (d >= ds[hi]) return ys[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid] <= d) lo = mid;
    else hi = mid;
  }
  const k = (d - ds[lo]) / (ds[hi] - ds[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * k;
}

// Points for the charts: every sample of lap A, with lap B read at the same point of
// the lap (B's distance is scaled to A's length so the corners line up), and the time
// B is behind (+) or ahead (−) of A at that point.
export function alignLaps(a: LapTelemetry, b: LapTelemetry | null) {
  const lenA = a.d.at(-1) || 1;
  const lenB = b?.d.at(-1) || 1;
  return a.d.map((d, i) => {
    const point: { d: number; a: number; aThrottle: number; aBrake: number; b?: number; bThrottle?: number; bBrake?: number; delta?: number } = {
      d,
      a: a.speed[i],
      aThrottle: a.throttle[i],
      aBrake: a.brake[i],
    };
    if (b) {
      const db = (d / lenA) * lenB;
      point.b = Math.round(at(b.d, b.speed, db));
      point.bThrottle = Math.round(at(b.d, b.throttle, db));
      point.bBrake = at(b.d, b.brake, db) >= 0.5 ? 1 : 0;
      point.delta = Math.round(at(b.d, b.t, db) - a.t[i]) / 1000;
    }
    return point;
  });
}

// Short, plain notes about how a lap was driven.
export function drivingNotes(lap: LapTelemetry) {
  const notes: string[] = [];
  // Lifting off before braking ("lift and coast"): throttle closed, no brake, for
  // half a second or more, then braking within the next 1.5 s.
  let lifts = 0;
  for (let i = 0; i < lap.t.length; i++) {
    if (lap.throttle[i] > 10 || lap.brake[i]) continue;
    let j = i;
    while (j < lap.t.length && lap.throttle[j] <= 10 && !lap.brake[j]) j++;
    const coast = lap.t[Math.min(j, lap.t.length - 1)] - lap.t[i];
    if (coast >= 500 && j < lap.t.length && lap.brake[j] && lap.speed[i] > 150) lifts++;
    i = j;
  }
  if (lifts) notes.push(`Lifts off before braking at ${lifts} corner${lifts === 1 ? "" : "s"} (saving fuel or energy)`);

  // Speed falling while still flat out: the car runs out of electric power before
  // the end of the straight.
  let fades = 0;
  for (const z of fullThrottleZones(lap, 300)) {
    let peak = 0;
    let peakAt = z.i0;
    for (let i = z.i0; i <= z.i1; i++) if (lap.speed[i] > peak) [peak, peakAt] = [lap.speed[i], i];
    if (peakAt < z.i1 && peak - lap.speed[z.i1] >= 4 && lap.d[z.i1] - lap.d[peakAt] >= 80) fades++;
  }
  if (fades) notes.push(`Speed drops at full throttle on ${fades} straight${fades === 1 ? "" : "s"} (likely running out of battery power)`);
  return notes;
}

// The sample of a whole-session trace at replay time t (the last one at or before it).
export function traceAt(trace: CarTrace, t: number) {
  const ts = trace.t;
  if (!ts.length || t < ts[0]) return null;
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  if (t - ts[lo] > 3000) return null;
  return { speed: trace.speed[lo], throttle: trace.throttle[lo], brake: trace.brake[lo], gear: trace.gear[lo], rpm: trace.rpm[lo], drs: trace.drs[lo] };
}

// The rear wing is open (DRS, or the low-drag straight mode) for these channel values.
export const wingOpen = (drs: number) => drs >= 10;
