"use client";

import { useMemo } from "react";
import { TRACK_STATUS } from "@/lib/live";
import type { Replay } from "@/lib/types";
import { cn } from "@/components/ui";

type Marker = { t: number; kind: "pit" | "up" | "down" | "radio" | "out"; label: string };

const MARKER_STYLE: Record<Marker["kind"], string> = {
  pit: "bg-yellow",
  up: "bg-good",
  down: "bg-bad",
  radio: "bg-[var(--series-1)]",
  out: "bg-bad",
};

// The scrubber: safety car and red flag periods as coloured bands, and dots for
// what happened to the followed driver (pit stops, places gained or lost, radio).
// Without a driver it shows only retirements. Click a dot to jump just before it.
export function Timeline({ replay, t, duration, onSeek, focus, outAt, clock }: { replay: Replay; t: number; duration: number; onSeek: (t: number) => void; focus: string | null; outAt: Map<string, number>; clock: (ms: number) => string }) {
  const bands = useMemo(() => {
    const out: { from: number; to: number; tone: string }[] = [];
    replay.trackStatus.forEach(([st, status], idx) => {
      const tone = TRACK_STATUS[status]?.tone;
      if (tone === "sc" || tone === "red") out.push({ from: st, to: replay.trackStatus[idx + 1]?.[0] ?? duration, tone });
    });
    return out;
  }, [replay, duration]);

  const markers = useMemo<Marker[]>(() => {
    const tla = (n: string) => replay.drivers.find((d) => d.number === n)?.tla ?? n;
    if (!focus) return [...outAt.entries()].map(([n, at]) => ({ t: at, kind: "out" as const, label: `${tla(n)} retires` }));
    const out: Marker[] = [];
    for (const s of replay.stops ?? []) if (s.n === focus) out.push({ t: s.t, kind: "pit", label: `Pit stop · lap ${s.lap}${s.sc ? " · under safety car" : ""}` });
    for (const [rt, n] of replay.radio ?? []) if (n === focus) out.push({ t: rt, kind: "radio", label: "Team radio" });
    // Places gained or lost, from the running order (not counting pit stops' own swaps).
    let prev: number | null = null;
    for (const [rt, n, change] of replay.timing) {
      if (n !== focus || change.p == null) continue;
      if (prev != null && change.p !== prev && rt > 60_000) out.push({ t: rt, kind: change.p < prev ? "up" : "down", label: `${change.p < prev ? "Up" : "Down"} to P${change.p}` });
      prev = change.p;
    }
    const retired = outAt.get(focus);
    if (retired != null) out.push({ t: retired, kind: "out", label: "Retires" });
    return out;
  }, [replay, focus, outAt]);

  return (
    <div>
      <div className="relative h-6">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3">
          {bands.map((b, i) => (
            <span key={i} className={cn("absolute inset-y-0", b.tone === "red" ? "bg-red-500" : "bg-yellow-400")} style={{ left: `${(b.from / duration) * 100}%`, width: `${((b.to - b.from) / duration) * 100}%` }} />
          ))}
          <span className="absolute inset-y-0 left-0 bg-accent/70" style={{ width: `${(t / duration) * 100}%` }} />
        </div>
        <input type="range" min={0} max={duration} step={500} value={t} onChange={(e) => onSeek(Number(e.target.value))} className="absolute inset-0 w-full cursor-pointer opacity-0" aria-label="Seek" />
      </div>
      {markers.length > 0 && (
        <div className="relative h-3" aria-label="Moments">
          {markers.map((m, i) => (
            <button
              key={i}
              onClick={() => onSeek(Math.max(0, m.t - 2000))}
              title={`${clock(m.t)} · ${m.label}`}
              aria-label={`${m.label} at ${clock(m.t)}`}
              className={cn("absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-surface transition-transform hover:scale-150", MARKER_STYLE[m.kind])}
              style={{ left: `${(m.t / duration) * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
