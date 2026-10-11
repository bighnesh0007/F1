import { describe, expect, it } from "vitest";
import { alignLaps, drivingNotes, fullThrottleShare, fullThrottleZones, traceAt } from "../lib/telemetry";
import { yellowSectors } from "../lib/flags";
import type { LapTelemetry } from "../lib/types";

// A lap from samples of [metres, speed, throttle, brake] every 100 ms.
function lap(samples: [number, number, number, number][]): LapTelemetry {
  return {
    driver: "1",
    lap: 1,
    lapMs: samples.length * 100,
    t: samples.map((_, i) => i * 100),
    d: samples.map((s) => s[0]),
    speed: samples.map((s) => s[1]),
    throttle: samples.map((s) => s[2]),
    brake: samples.map((s) => s[3]),
    gear: samples.map(() => 7),
    rpm: samples.map(() => 11000),
    drs: samples.map(() => 0),
    x: samples.map(() => null),
    y: samples.map(() => null),
  };
}

describe("telemetry", () => {
  it("finds full-throttle zones and their share of the lap", () => {
    const l = lap([
      [0, 200, 100, 0], [100, 250, 100, 0], [200, 300, 100, 0], [300, 280, 0, 1], [400, 120, 0, 1], [500, 150, 60, 0], [1000, 280, 100, 0],
    ]);
    const zones = fullThrottleZones(l, 100);
    expect(zones.map((z) => [z.from, z.to])).toEqual([[0, 200]]);
    expect(fullThrottleShare(l)).toBe(20);
  });

  it("lines up two laps by distance and gives the time gap", () => {
    const a = lap([[0, 100, 100, 0], [100, 100, 100, 0], [200, 100, 100, 0]]);
    const b = { ...lap([[0, 90, 100, 0], [110, 90, 100, 0], [220, 90, 100, 0]]), t: [0, 120, 240] };
    const pts = alignLaps(a, b);
    expect(pts[2].b).toBe(90);
    expect(pts[2].delta).toBeCloseTo(0.04);
  });

  it("notes lift and coast and speed dropping at full throttle", () => {
    const samples: [number, number, number, number][] = [];
    for (let i = 0; i < 40; i++) samples.push([i * 25, i < 25 ? 250 + i * 3 : 322 - (i - 25), 100, 0]); // fades after the peak
    for (let i = 0; i < 8; i++) samples.push([1000 + i * 20, 300, 0, 0]); // coasting 0.8 s
    samples.push([1170, 290, 0, 1]);
    const notes = drivingNotes(lap(samples));
    expect(notes.some((n) => /Lifts off/.test(n))).toBe(true);
    expect(notes.some((n) => /battery/.test(n))).toBe(true);
  });

  it("reads a session trace at a moment", () => {
    const trace = { t: [0, 500, 1000], speed: [100, 200, 300], throttle: [1, 2, 3], brake: [0, 0, 1], gear: [3, 4, 5], rpm: [1, 2, 3], drs: [0, 0, 12] };
    expect(traceAt(trace, 700)?.speed).toBe(200);
    expect(traceAt(trace, -1)).toBeNull();
  });
});

describe("flags", () => {
  it("tracks yellow sectors until they are cleared", () => {
    const active = yellowSectors([
      { flag: "YELLOW", scope: "Sector", sector: 4 },
      { flag: "DOUBLE YELLOW", scope: "Sector", sector: 5 },
      { flag: "CLEAR", scope: "Sector", sector: 4 },
    ]);
    expect([...active.entries()]).toEqual([[5, "double"]]);
    expect(yellowSectors([{ flag: "YELLOW", scope: "Sector", sector: 2 }, { flag: "GREEN", scope: "Track" }]).size).toBe(0);
  });
});

import { wearByStint } from "../lib/tyres";

describe("tyre wear", () => {
  it("splits stints at pit stops and measures the slowdown per lap", () => {
    const lap = (n: number, time: string, compound: string, pit = false) => ({ lap: n, time, compound, pit });
    const stints = wearByStint([
      lap(1, "1:31.000", "SOFT"), lap(2, "1:31.100", "SOFT"), lap(3, "1:31.200", "SOFT"), lap(4, "1:31.300", "SOFT", true),
      lap(5, "1:45.000", "HARD"), lap(6, "1:32.000", "HARD"), lap(7, "1:32.050", "HARD"), lap(8, "1:32.100", "HARD"),
    ]);
    expect(stints.map((s) => s.compound)).toEqual(["SOFT", "HARD"]);
    expect(stints[0].slope).toBeCloseTo(0.1);
    expect(stints[1].points.map((p) => p.age)).toEqual([2, 3, 4]); // the out-lap is left out
  });
});
