"use client";

import { useApi } from "./useApi";

export type CircuitExtras = {
  from: string | null;
  sectorPoints: [[number, number], [number, number]] | null;
  pitLane: [number, number][] | null;
  pitLoss: number | null;
};

// What the server learnt about a circuit from its most recent archived race: the
// exact sector lines, the real pit lane and how long a pit stop usually costs.
export function useCircuitExtras(circuitKey: number | string | null | undefined) {
  const { data } = useApi<CircuitExtras>(circuitKey ? `/api/circuit-extras?key=${circuitKey}` : null);
  return data;
}
