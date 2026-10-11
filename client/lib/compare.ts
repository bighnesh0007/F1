// Head-to-head maths for two cars in a live race: the gap between them, how fast it
// is changing, and a simple, explainable read on whether an overtake is coming.
import type { LapEntry } from "./live";

export type CompareCar = {
  number: string;
  position: number;
  gapToLeader: string | null | undefined; // "+3.456", "LAP 12" for the leader, "1L" when lapped
  interval: string | null | undefined; // to the car directly ahead
  compound: string | null | undefined;
  tyreAge: number | null; // laps on the current set
  stops: number;
  history: LapEntry[]; // oldest first
};

export type Comparison = {
  ahead: CompareCar;
  behind: CompareCar;
  gap: number | null; // seconds between them
  closing: number | null; // seconds per lap the car behind gains (+) or loses (−)
  lapsToDrs: number | null; // laps until within 1 s
  catchLap: number | null; // lap the car behind is on the car ahead, at this rate
  paceAhead: number | null; // average of the last laps, ms
  paceBehind: number | null;
  chance: "High" | "Medium" | "Low";
  reasons: string[];
};

const SOFTNESS: Record<string, number> = { SOFT: 3, MEDIUM: 2, HARD: 1, INTERMEDIATE: 0, WET: 0 };

export function seconds(gap: string | null | undefined): number | null {
  if (!gap) return null;
  if (/^LAP/i.test(gap)) return 0;
  const n = Number(String(gap).replace("+", ""));
  return Number.isFinite(n) ? n : null;
}

export function lapTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(value.trim());
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : null;
}

const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function recentPace(history: LapEntry[], laps = 3) {
  // Skip slow outliers (pit laps, safety car) so one bad lap doesn't skew it.
  const times = history.map((l) => lapTimeMs(l.time)).filter((t): t is number => t != null).slice(-laps - 2);
  if (times.length === 0) return null;
  const best = Math.min(...times);
  return average(times.filter((t) => t < best * 1.07).slice(-laps));
}

export function compare(a: CompareCar, b: CompareCar, lap: number | null, totalLaps: number | null): Comparison {
  const [ahead, behind] = a.position <= b.position ? [a, b] : [b, a];
  const adjacent = behind.position - ahead.position === 1;
  const gA = seconds(ahead.gapToLeader);
  const gB = seconds(behind.gapToLeader);
  const gap = adjacent && seconds(behind.interval) != null ? seconds(behind.interval) : gA != null && gB != null ? Math.max(0, gB - gA) : null;

  // Gap between them at the end of each recent lap both completed.
  const byLap = new Map(ahead.history.map((l) => [l.lap, l]));
  const series = behind.history
    .map((l) => {
      const o = byLap.get(l.lap);
      if (!o) return null;
      const ga = o.position === 1 ? 0 : seconds(o.gap);
      const gb = seconds(l.gap);
      return ga != null && gb != null ? { lap: l.lap, gap: gb - ga } : null;
    })
    .filter((x): x is { lap: number; gap: number } => x != null)
    .slice(-5);
  const closing = series.length >= 2 ? (series[0].gap - series.at(-1)!.gap) / (series.at(-1)!.lap - series[0].lap) : null;

  const lapsLeft = lap != null && totalLaps != null ? totalLaps - lap : null;
  const lapsToDrs = gap != null && closing != null && closing > 0.02 ? (gap <= 1 ? 0 : (gap - 1) / closing) : gap != null && gap <= 1 ? 0 : null;
  const lapsToCatch = gap != null && closing != null && closing > 0.02 ? Math.max(0, (gap - 0.3) / closing) : null;
  const catchLap = lapsToCatch != null && lap != null && (lapsLeft == null || lapsToCatch <= lapsLeft) ? lap + Math.ceil(lapsToCatch) : null;

  const paceAhead = recentPace(ahead.history);
  const paceBehind = recentPace(behind.history);

  let score = 0;
  const reasons: string[] = [];
  if (gap != null && gap <= 1) {
    score += 2;
    reasons.push(`Within DRS range (${gap.toFixed(3)}s)`);
  }
  if (closing != null && closing > 0.25) {
    score += 2;
    reasons.push(`Closing fast: ${closing.toFixed(2)}s a lap`);
  } else if (closing != null && closing > 0.05) {
    score += 1;
    reasons.push(`Closing ${closing.toFixed(2)}s a lap`);
  } else if (closing != null && closing < -0.05) {
    score -= 1;
    reasons.push(`Gap growing ${(-closing).toFixed(2)}s a lap`);
  }
  if (behind.tyreAge != null && ahead.tyreAge != null && ahead.tyreAge - behind.tyreAge >= 5) {
    score += 1;
    reasons.push(`Tyres ${ahead.tyreAge - behind.tyreAge} laps fresher`);
  }
  const soft = (c?: string | null) => (c ? SOFTNESS[c] ?? 0 : 0);
  if (soft(behind.compound) > soft(ahead.compound)) {
    score += 1;
    reasons.push("On the softer compound");
  }
  if (paceAhead != null && paceBehind != null && paceAhead - paceBehind > 150) {
    score += 1;
    reasons.push(`Lapping ${((paceAhead - paceBehind) / 1000).toFixed(2)}s quicker`);
  }
  if (ahead.stops < behind.stops) reasons.push(`${ahead.stops === 0 ? "Car ahead hasn't pitted yet" : "Car ahead has a stop in hand"}`);
  if (catchLap != null && (gap ?? 0) > 1) reasons.push(`At this rate, on the gearbox by lap ${catchLap}`);

  return { ahead, behind, gap, closing, lapsToDrs, catchLap, paceAhead, paceBehind, chance: score >= 4 ? "High" : score >= 2 ? "Medium" : "Low", reasons };
}
