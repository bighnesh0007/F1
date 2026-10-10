import { describe, expect, test } from "vitest";
import { applyUpdate, deepMerge, list, sessionIsActive } from "../lib/live";
import { estimateFraction, TIMING_LAG_MS } from "../lib/track";
import { formatLapTime, ordinal, parseLapTime } from "../lib/format";

describe("live state", () => {
  test("merges updates without mutating the previous state", () => {
    const before = { TimingData: { Lines: { 1: { Position: "1" } } } };
    const after = applyUpdate(before, { topic: "TimingData", data: { Lines: { 1: { Gap: "+1" } } }, replace: false });
    expect(after.TimingData.Lines[1]).toEqual({ Position: "1", Gap: "+1" });
    expect(before.TimingData.Lines[1]).toEqual({ Position: "1" });
  });

  test("handles deletions and index-keyed lists", () => {
    expect(deepMerge({ a: 1, b: 2 }, { _deleted: ["a"] })).toEqual({ b: 2 });
    expect(list({ 10: "c", 2: "b", 1: "a" })).toEqual(["a", "b", "c"]);
    expect(list(null)).toEqual([]);
  });

  test("a running session is active only while connected", () => {
    const topics = { SessionInfo: { Name: "Race" }, SessionStatus: { Status: "Started" } };
    const connected = { status: "connected" as const, authenticated: false, lastMessageAt: null, lastError: null };
    expect(sessionIsActive(topics, connected)).toBe(true);
    expect(sessionIsActive(topics, { ...connected, status: "disconnected" })).toBe(false);
    expect(sessionIsActive({}, connected)).toBe(false);
  });
});

describe("car position estimate", () => {
  test("moves with time but never past the next timing point", () => {
    const p = { p: 0.5, pMax: 0.55, t: 0, lapMs: 90_000 };
    expect(estimateFraction(p, 9_000 + TIMING_LAG_MS)).toBeCloseTo(0.554, 3);
    expect(estimateFraction({ ...p, pMax: undefined }, 9_000 + TIMING_LAG_MS)).toBeCloseTo(0.6, 5);
    expect(estimateFraction({ p: 0.5 }, 1000)).toBeNull();
  });

  test("allows for timing delay, wrapping back over the finish line", () => {
    const start = { p: 0, pMax: 0.05, t: 0, lapMs: 100_000 };
    expect(estimateFraction(start, 0)).toBeCloseTo(1 - TIMING_LAG_MS / 100_000, 5);
    expect(estimateFraction(start, TIMING_LAG_MS)).toBe(0);
  });
});

describe("formatting", () => {
  test("lap times round-trip", () => {
    expect(parseLapTime("1:32.090")).toBeCloseTo(92.09);
    expect(formatLapTime(92.09)).toBe("1:32.090");
    expect(formatLapTime(null)).toBe("–");
  });
  test("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});
