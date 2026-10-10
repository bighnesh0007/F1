"use client";

import { History, MapPinned, Medal, Timer } from "lucide-react";
import { useApi } from "@/lib/useApi";
import type { Circuit, CircuitHistory, CircuitMap } from "@/lib/types";
import { CircuitMapView } from "@/components/track/CircuitMapView";
import { Card, Skeleton, Spoiler } from "@/components/ui";

export function useCircuitMap(circuit: Circuit | undefined, circuitKey?: number | null) {
  const params = circuit
    ? new URLSearchParams({ locality: circuit.locality, country: circuit.country, name: circuit.name, circuitId: circuit.id, ...(circuitKey ? { key: String(circuitKey) } : {}) })
    : null;
  return useApi<CircuitMap>(params ? `/api/circuit-map?${params}` : null);
}

export function CircuitGuide({ circuit, circuitKey, className }: { circuit: Circuit; circuitKey?: number | null; className?: string }) {
  const { data: map, loading } = useCircuitMap(circuit, circuitKey);
  const { data: history, error: historyError } = useApi<CircuitHistory>(`/api/circuit-history/${circuit.id}`);

  return (
    <Card title="Circuit guide" icon={<MapPinned size={15} />} className={className}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="font-display text-lg leading-tight font-bold">{circuit.name}</p>
          <p className="text-sm text-muted">{circuit.locality}, {circuit.country}</p>
          {map ? (
            <CircuitMapView map={map} className="mt-2 aspect-[4/3] w-full" />
          ) : loading ? (
            <Skeleton className="mt-2 aspect-[4/3] w-full" />
          ) : (
            <p className="mt-4 text-sm text-muted">Track layout unavailable.</p>
          )}
          {map && (
            <p className="text-xs text-faint">
              {map.corners.length ? `${map.corners.length} corners` : ""}
              {map.length ? `${map.corners.length ? " · " : ""}${(map.length / 1000).toFixed(3)} km lap` : ""}
            </p>
          )}
        </div>
        <div className="space-y-3">
          {!history && historyError ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">Circuit history isn&apos;t available right now.</p>
          ) : !history ? (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-28" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Fact icon={<History size={13} />} label="First Grand Prix" value={history.firstRace ? String(history.firstRace) : "New circuit"} sub={history.races ? `${history.races} races held` : undefined} />
                <Fact
                  icon={<Timer size={13} />}
                  label="Race lap record"
                  value={history.lapRecord?.time ?? "–"}
                  sub={history.lapRecord ? `${history.lapRecord.driver.name}, ${history.lapRecord.season}` : undefined}
                />
              </div>
              {history.mostWins.length > 0 && (
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><Medal size={13} /> Most wins here</p>
                  <ul className="space-y-1 text-sm">
                    {history.mostWins.slice(0, 3).map((d) => (
                      <li key={d.id} className="flex justify-between"><span>{d.name}</span><span className="tnum font-semibold">{d.count}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {history.winners.length > 0 && (
                <Spoiler label="Past winners hidden">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <p className="mb-1.5 text-xs font-semibold text-muted">Recent winners</p>
                    <ul className="space-y-1 text-sm">
                      {history.winners.slice(0, 5).map((w) => (
                        <li key={w.season} className="flex justify-between gap-2">
                          <span className="tnum text-muted">{w.season}</span>
                          <span className="flex-1 truncate">{w.driver.name}</span>
                          <span className="truncate text-xs text-faint">{w.team}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Spoiler>
              )}
              <p className="text-xs text-faint">Lap record counts fastest race laps since 2004. DRS zone data isn&apos;t published in any free source.</p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-faint uppercase">{icon}{label}</p>
      <p className="font-display text-lg leading-tight font-bold">{value}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}
