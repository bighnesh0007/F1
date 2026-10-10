"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapPin, Satellite, Waypoints } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { useApi } from "@/lib/useApi";
import { estimateFraction, type Track } from "@/lib/track";
import type { CarProgress } from "@/lib/live";
import type { CircuitMap } from "@/lib/types";
import { CarDot, CircuitMapView } from "@/components/track/CircuitMapView";
import { Card, Empty, Skeleton, cn } from "@/components/ui";

const SLOW_TRACK_STATUSES = new Set(["4", "6", "7"]);

export function LiveTrackMap({
  onSelect,
  focus = null,
  mapClassName = "aspect-[4/3]",
  overlay,
}: {
  onSelect: (number: string) => void;
  /** A driver to highlight, on top of the favourite. */
  focus?: string | null;
  mapClassName?: string;
  /** Drawn over the bottom of the map (e.g. the latest race control message). */
  overlay?: React.ReactNode;
}) {
  const { topics, trace, connection } = useLive();
  const info = topics.SessionInfo;
  const key = info?.Meeting?.Circuit?.Key;
  const location = info?.Meeting?.Location;
  const query = key || location ? `/api/circuit-map?${new URLSearchParams({ ...(key ? { key: String(key) } : {}), ...(location ? { locality: location } : {}) })}` : null;
  const { data: map, loading } = useApi<CircuitMap>(query);

  const entries: Record<string, { X: number; Y: number; Status?: string }> = topics.Position?.Entries ?? {};
  const hasRealPositions = Object.values(entries).some((p) => p && (p.X || p.Y));

  // With real positions but no matching map, draw the outline traced from the cars.
  const tracedMap = useMemo<CircuitMap | null>(() => {
    const longest = [...trace].sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length < 150) return null;
    // Only once it spans a real circuit (> 1 km across), not a car idling in the pit lane.
    const xs = longest.map((p) => p.x);
    const ys = longest.map((p) => p.y);
    if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 10_000) return null;
    return { source: "outline", name: info?.Meeting?.Circuit?.ShortName ?? "Circuit", x: longest.map((p) => p.x), y: longest.map((p) => p.y), time: null, rotation: 0, startsAtFinish: false, corners: [] };
  }, [trace, info]);

  // Use real positions when they can be drawn on a matching map; otherwise estimate.
  const realMode = hasRealPositions && (map?.source === "multiviewer" || tracedMap != null);
  const displayMap = realMode && map?.source !== "multiviewer" ? tracedMap ?? null : map;

  const mode = realMode ? "live" : "estimated";
  const badge =
    mode === "live" ? (
      <span className="flex items-center gap-1.5 text-xs text-muted"><Satellite size={13} /> Live GPS</span>
    ) : (
      <span className="flex items-center gap-1.5 text-xs text-muted" title="Positions are estimated from timing data (typically within about 30 m). Add an F1 TV token for exact positions.">
        <Waypoints size={13} /> Estimated from timing
      </span>
    );

  return (
    <Card title="Track" icon={<MapPin size={15} />} right={badge} bodyClassName="px-2 pb-2">
      {!displayMap ? (
        loading ? (
          <Skeleton className={cn("mx-2 mb-2", mapClassName)} />
        ) : (
          <Empty title="Track map unavailable">
            {connection?.authenticated ? "Waiting for car positions…" : "The circuit layout couldn't be loaded."}
          </Empty>
        )
      ) : (
        <div className="relative">
          <CircuitMapView map={displayMap} className={cn("w-full", mapClassName)} showCorners={!realMode || displayMap.source === "multiviewer"}>
            {(track) => (realMode ? <RealCars track={track} entries={entries} onSelect={onSelect} focus={focus} /> : <EstimatedCars track={track} onSelect={onSelect} focus={focus} />)}
          </CircuitMapView>
          {overlay}
        </div>
      )}
    </Card>
  );
}

function RealCars({ track, entries, onSelect, focus }: { track: Track; entries: Record<string, { X: number; Y: number; Status?: string }>; onSelect: (n: string) => void; focus: string | null }) {
  const { get } = useDrivers();
  const { settings } = useSettings();
  const { topics } = useLive();
  const lines = topics.TimingData?.Lines ?? {};
  const cars = Object.entries(entries)
    .filter(([, p]) => p && (p.X || p.Y))
    .map(([n, p]) => {
      const d = get(n);
      const s = track.toScreen(p.X, p.Y);
      const dim = Boolean(lines[n]?.InPit) || p.Status === "OffTrack";
      const highlight = settings.favouriteDriver === n || focus === n;
      // Parked cars bunch up in the pit lane; drop their labels to keep the map readable.
      return { number: n, tla: d.tla, colour: d.colour, x: s.x, y: s.y, dim, highlight, hideLabel: dim && !highlight };
    })
    .sort((a, b) => Number(a.highlight) - Number(b.highlight));
  return (
    <g>
      {cars.map((car) => (
        <CarDot key={car.number} car={car} size={track.size} transitionMs={900} onClick={() => onSelect(car.number)} />
      ))}
    </g>
  );
}

// Cars placed by estimated lap progress, animated every frame.
function EstimatedCars({ track, onSelect, focus }: { track: Track; onSelect: (n: string) => void; focus: string | null }) {
  const { topics, feedNow } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const progress = topics.CarProgress as Record<string, CarProgress> | undefined;
  const lines = topics.TimingData?.Lines ?? {};
  const slow = SLOW_TRACK_STATUSES.has(String(topics.TrackStatus?.Status)) ? 1.4 : 1;
  const refs = useRef(new Map<string, SVGGElement>());
  const progressRef = useRef(progress);
  const slowRef = useRef(slow);

  useEffect(() => {
    progressRef.current = progress;
    slowRef.current = slow;
  }, [progress, slow]);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const now = feedNow();
      for (const [n, el] of refs.current) {
        const p = progressRef.current?.[n];
        const f = p ? estimateFraction(p, now, slowRef.current) : null;
        if (f == null) continue;
        const pt = track.at(f);
        el.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [track, feedNow]);

  const hi = (n: string) => settings.favouriteDriver === n || focus === n;
  const numbers = Object.keys(progress ?? {})
    .filter((n) => progress?.[n]?.p != null && !progress?.[n]?.out && !lines[n]?.Retired)
    .sort((a, b) => Number(hi(a)) - Number(hi(b)));

  return (
    <g>
      {numbers.map((n) => {
        const d = get(n);
        const pit = Boolean(progress?.[n]?.pit || lines[n]?.InPit);
        return (
          <g
            key={n}
            ref={(el) => {
              if (el) refs.current.set(n, el);
              else refs.current.delete(n);
            }}
          >
            <CarDot
              car={{ number: n, tla: d.tla, colour: d.colour, x: 0, y: 0, dim: pit, highlight: hi(n), hideLabel: pit && !hi(n) }}
              size={track.size}
              onClick={() => onSelect(n)}
            />
          </g>
        );
      })}
    </g>
  );
}
