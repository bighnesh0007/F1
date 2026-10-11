import { describe, expect, it } from "vitest";
import { compare, seconds, type CompareCar } from "../lib/compare";

const car = (over: Partial<CompareCar>): CompareCar => ({ number: "1", position: 1, gapToLeader: "LAP 20", interval: "", compound: "HARD", tyreAge: 15, stops: 1, history: [], ...over });
const hist = (gaps: number[], start = 15, time = "1:35.000") => gaps.map((g, i) => ({ lap: start + i, time, position: 2, gap: g ? `+${g}` : "LAP", interval: null, sectors: [], compound: null, pit: false, ts: "" }));

describe("compare", () => {
  it("reads leader and lapped gaps", () => {
    expect(seconds("LAP 12")).toBe(0);
    expect(seconds("+1.234")).toBe(1.234);
    expect(seconds("1L")).toBeNull();
  });

  it("finds a closing car and when it catches up", () => {
    const leader = car({ number: "1", history: hist([0, 0, 0, 0, 0]).map((l) => ({ ...l, position: 1 })) });
    const chaser = car({ number: "44", position: 2, gapToLeader: "+2.300", interval: "+2.300", compound: "MEDIUM", tyreAge: 5, history: hist([4.3, 3.8, 3.3, 2.8, 2.3], 15, "1:34.500") });
    const c = compare(chaser, leader, 20, 62);
    expect(c.ahead.number).toBe("1");
    expect(c.gap).toBeCloseTo(2.3);
    expect(c.closing).toBeCloseTo(0.5);
    expect(c.lapsToDrs).toBeCloseTo(2.6);
    expect(c.catchLap).toBe(24);
    expect(c.chance).toBe("High");
    expect(c.reasons.join(" ")).toMatch(/fresher/);
  });

  it("uses the gap to the leader when the cars aren't next to each other", () => {
    const c = compare(car({ number: "4", position: 3, gapToLeader: "+5.000" }), car({ number: "16", position: 6, gapToLeader: "+9.500" }), null, null);
    expect(c.gap).toBeCloseTo(4.5);
    expect(c.chance).toBe("Low");
  });
});
