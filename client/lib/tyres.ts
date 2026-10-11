// Tyre wear: lap time against how many laps the tyres have done, per stint, with
// the average change per lap (least-squares slope). Pit laps, out-laps and slow
// laps (more than 7% off the driver's best) are left out.
import { parseLapTime } from "./format";

export type WearLap = { lap: number; time: string | null; compound: string | null; pit: boolean; tyreAge?: number | null };
export type Stint = { index: number; compound: string | null; points: { age: number; time: number }[]; slope: number | null };

export function wearByStint(laps: WearLap[]): Stint[] {
  const times = laps.filter((l) => !l.pit).map((l) => parseLapTime(l.time) ?? Infinity);
  const best = Math.min(...times);
  const stints: Stint[] = [];
  let prev: WearLap | null = null;
  let startAge = 0;
  let count = 0;
  for (const l of laps) {
    // A new stint after a pit stop, or when the compound changes or the reported age drops.
    const newStint = !prev || prev.pit || l.compound !== prev.compound || (l.tyreAge != null && prev.tyreAge != null && l.tyreAge < prev.tyreAge);
    if (newStint) {
      stints.push({ index: stints.length + 1, compound: l.compound, points: [], slope: null });
      startAge = l.tyreAge ?? 0;
      count = 0;
    }
    count++;
    const outLap = prev?.pit === true;
    prev = l;
    const time = parseLapTime(l.time);
    if (l.pit || outLap || time == null || time > best * 1.07) continue;
    stints.at(-1)!.points.push({ age: Math.max(l.tyreAge ?? 0, startAge + count), time });
  }
  for (const s of stints) {
    const n = s.points.length;
    if (n < 3) continue;
    const mx = s.points.reduce((a, p) => a + p.age, 0) / n;
    const my = s.points.reduce((a, p) => a + p.time, 0) / n;
    const num = s.points.reduce((a, p) => a + (p.age - mx) * (p.time - my), 0);
    const den = s.points.reduce((a, p) => a + (p.age - mx) ** 2, 0);
    s.slope = den ? num / den : null;
  }
  return stints.filter((s) => s.points.length >= 2).map((s, i) => ({ ...s, index: i + 1 }));
}
