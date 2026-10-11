"use client";

import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { SpeedTraps, type Trap } from "@/components/live/SpeedTraps";

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEYS: Record<Trap, string> = { st: "ST", fl: "FL", i1: "I1", i2: "I2" };

// Each driver's best speed through the timing traps this session (TimingStats).
export function LiveSpeedTraps({ focus, onSelect }: { focus: string | null; onSelect: (n: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const lines = topics.TimingStats?.Lines ?? {};
  const rows = Object.entries<any>(lines)
    .filter(([n]) => /^\d+$/.test(n))
    .map(([n, line]) => {
      const d = get(n);
      const speeds = Object.fromEntries((Object.keys(KEYS) as Trap[]).map((k) => [k, Number(line?.BestSpeeds?.[KEYS[k]]?.Value) || null]));
      return { number: n, tla: d.tla, team: d.team, colour: d.colour, speeds };
    });
  return <SpeedTraps rows={rows} focus={focus} onSelect={onSelect} />;
}
