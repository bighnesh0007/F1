import { describe, expect, test } from "vitest";
import { pitLossSeconds, predictStrategy } from "../components/live/StrategyPredictor";

const row = (number: string, position: number, gap: string | null, interval: string | null, stints: { Compound: string; TotalLaps: number; StartLaps?: number }[]) => ({
  number,
  position,
  timing: { GapToLeader: gap, IntervalToPositionAhead: { Value: interval } },
  stints,
});

describe("strategy predictor", () => {
  const rows = [
    row("1", 1, "LAP 30", null, [{ Compound: "MEDIUM", TotalLaps: 25 }]),
    row("4", 2, "+2.0", "+2.0", [{ Compound: "MEDIUM", TotalLaps: 24 }]),
    row("16", 3, "+15.0", "+13.0", [{ Compound: "SOFT", TotalLaps: 4 }, { Compound: "HARD", TotalLaps: 10 }]),
    row("44", 4, "+30.0", "+15.0", [{ Compound: "HARD", TotalLaps: 30 }]),
  ];
  const out = predictStrategy(rows, 57, 30, 22);
  const by = Object.fromEntries(out.map((r) => [r.number, r]));

  test("pit window opens as tyres age, and one-compound drivers must stop", () => {
    expect(by["1"].windowIn).toBe(0);
    expect(by["1"].mustStop).toBe(true);
    expect(by["16"].mustStop).toBe(false);
  });

  test("a car that has used two compounds on fresh hards can reach the end", () => {
    expect(by["16"].windowIn).toBeNull();
  });

  test("rejoin position adds the pit loss to the gap", () => {
    // Leader pits: 0 + 22 = 22s -> behind #16 (15s), ahead of #44 (30s): P3.
    expect(by["1"].rejoin).toMatchObject({ position: 3, ahead: "16", behind: "44" });
    expect(by["1"].rejoin?.marginAhead).toBeCloseTo(7);
  });

  test("undercut risk when the car behind is within 3s and the window is open", () => {
    expect(by["1"].threat).toBe("4");
    expect(by["4"].threat).toBeNull();
  });

  test("pit loss is measured from this race's stops when available", () => {
    expect(pitLossSeconds({})).toEqual({ seconds: 22, measured: false });
    expect(pitLossSeconds({ PitLaneTimeCollection: { PitTimes: { 1: { Duration: "20.1" }, 4: { Duration: "21.0" }, 16: { Duration: "24.5" } } } })).toEqual({ seconds: 21, measured: true });
  });
});
