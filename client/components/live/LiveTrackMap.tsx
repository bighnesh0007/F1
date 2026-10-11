"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Satellite, Swords, Waypoints } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { useApi } from "@/lib/useApi";
import { buildTrack, estimateFraction, findStraights, offsetAt, pathBetween, type Track } from "@/lib/track";
import { list, type CarProgress, type LiveEvent } from "@/lib/live";
import type { CircuitMap } from "@/lib/types";
import { CarDot, CircuitMapView, LayerChip, SECTOR_COLOURS } from "@/components/track/CircuitMapView";
import { Card, Empty, Skeleton, cn } from "@/components/ui";

const SLOW_TRACK_STATUSES = new Set(["4", "6", "7"]);
const PIT_WINDOW = 0.05; // the pit lane is drawn alongside the lap from −5 % to +5 % around the line
const DEFAULT_LANE_S = 22;

type Layers = { sectors: boolean; straights: boolean; pit: boolean };

export function LiveTrackMap({
  onSelect,
  focus = null,
  mapClassName = "aspect-[4/3]",
  overlay,
  compare = [],
  compareMode = false,
  onCompareMode,
}: {
  onSelect: (number: string) => void;
  /** A driver to highlight, on top of the favourite. */
  focus?: string | null;
  mapClassName?: string;
  /** Drawn over the bottom of the map (e.g. the latest race control message). */
  overlay?: React.ReactNode;
  /** Two drivers to compare: highlighted, with the stretch of track between them. */
  compare?: string[];
  compareMode?: boolean;
  onCompareMode?: (on: boolean) => void;
}) {
  const [layers, setLayers] = useState<Layers>({ sectors: true, straights: true, pit: true });
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

  const lines = topics.TimingData?.Lines;
  const sectorSplits = useMemo(() => sectorFractions(lines), [lines]);
  const exact = displayMap?.source === "multiviewer";
  const straights = useMemo(() => (displayMap && exact ? findStraights(buildFor(displayMap)) : []), [displayMap, exact]);

  const header = (
    <div className="flex items-center gap-2">
      {onCompareMode && (
        <button
          onClick={() => onCompareMode(!compareMode)}
          aria-pressed={compareMode}
          className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold", compareMode ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink")}
        >
          <Swords size={13} /> Compare
        </button>
      )}
      {badge}
    </div>
  );

  return (
    <Card title="Track" icon={<MapPin size={15} />} right={header} bodyClassName="px-2 pb-2">
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
          <CircuitMapView
            map={displayMap}
            className={cn("w-full", mapClassName)}
            showCorners={!realMode || exact}
            trackScale={1.5}
            cornerBadges={exact}
            sectors={exact && layers.sectors ? sectorSplits : null}
            straights={layers.straights ? straights : null}
            under={(track) => (exact && !realMode && layers.pit ? <PitLaneShape track={track} /> : null)}
          >
            {(track) =>
              realMode ? (
                <RealCars track={track} entries={entries} onSelect={onSelect} focus={focus} compare={compare} />
              ) : (
                <EstimatedCars track={track} onSelect={onSelect} focus={focus} compare={compare} pitOnMap={exact && layers.pit} />
              )
            }
          </CircuitMapView>
          {overlay}
          {compareMode && compare.length < 2 && (
            <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold shadow-card backdrop-blur">
              {compare.length === 0 ? "Tap two cars to compare them" : "Tap one more car"}
            </p>
          )}
        </div>
      )}
      {displayMap && exact && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1 text-[11px]">
          <LayerChip on={layers.sectors} onClick={() => setLayers((l) => ({ ...l, sectors: !l.sectors }))} disabled={!sectorSplits} title="Track coloured by timing sector (boundaries estimated from sector times)">
            {SECTOR_COLOURS.map((c, i) => <span key={i} className="h-1.5 w-3 rounded-full" style={{ background: c }} />)} Sectors
          </LayerChip>
          <LayerChip on={layers.straights} onClick={() => setLayers((l) => ({ ...l, straights: !l.straights }))} disabled={straights.length === 0} title="Long straights where cars run at full power (worked out from the track shape)">
            <span className="h-0 w-4 border-t-2 border-dashed border-green-500" /> Full-power straights
          </LayerChip>
          {!realMode && (
            <LayerChip on={layers.pit} onClick={() => setLayers((l) => ({ ...l, pit: !l.pit }))} title="Cars in the pits move along the pit lane (drawn approximately)">
              <span className="h-0 w-4 border-t-2 border-dotted border-yellow" /> Pit lane
            </LayerChip>
          )}
        </div>
      )}
    </Card>
  );
}

function RealCars({ track, entries, onSelect, focus, compare }: { track: Track; entries: Record<string, { X: number; Y: number; Status?: string }>; onSelect: (n: string) => void; focus: string | null; compare: string[] }) {
  const { get } = useDrivers();
  const { settings } = useSettings();
  const { topics } = useLive();
  const lines = topics.TimingData?.Lines ?? {};
  const comparing = compare.length === 2;
  const cars = Object.entries(entries)
    .filter(([, p]) => p && (p.X || p.Y))
    .map(([n, p]) => {
      const d = get(n);
      const s = track.toScreen(p.X, p.Y);
      const picked = compare.includes(n);
      const dim = Boolean(lines[n]?.InPit) || p.Status === "OffTrack" || (comparing && !picked);
      const highlight = picked || (!comparing && (settings.favouriteDriver === n || focus === n));
      // Parked cars bunch up in the pit lane; drop their labels to keep the map readable.
      return { number: n, tla: d.tla, colour: d.colour, x: s.x, y: s.y, dim, highlight, hideLabel: dim && !highlight };
    })
    .sort((a, b) => Number(a.highlight) - Number(b.highlight));
  // The stretch of track between the two compared cars.
  let between: string | null = null;
  if (comparing) {
    const [fa, fb] = compare.map((n) => (entries[n] ? nearestFraction(track, track.toScreen(entries[n].X, entries[n].Y)) : null));
    const [pa, pb] = compare.map((n) => Number(lines[n]?.Position) || 99);
    if (fa != null && fb != null) between = pa < pb ? pathBetween(track, fb, fa) : pathBetween(track, fa, fb);
  }
  return (
    <g>
      {between && <path d={between} fill="none" stroke="var(--accent)" strokeWidth={track.size / 70} strokeLinecap="round" opacity={0.55} />}
      {cars.map((car) => (
        <CarDot key={car.number} car={car} size={track.size} transitionMs={900} onClick={() => onSelect(car.number)} />
      ))}
    </g>
  );
}

function nearestFraction(track: Track, p: { x: number; y: number }) {
  let best = 0;
  let bestD = Infinity;
  track.points.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return track.fractions[best];
}

// Cars placed by estimated lap progress, animated every frame.
function EstimatedCars({ track, onSelect, focus, compare, pitOnMap }: { track: Track; onSelect: (n: string) => void; focus: string | null; compare: string[]; pitOnMap: boolean }) {
  const { topics, feedNow } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const progress = topics.CarProgress as Record<string, CarProgress> | undefined;
  const lines = useMemo(() => topics.TimingData?.Lines ?? {}, [topics.TimingData]);
  const slow = SLOW_TRACK_STATUSES.has(String(topics.TrackStatus?.Status)) ? 1.4 : 1;
  const refs = useRef(new Map<string, SVGGElement>());
  const between = useRef<SVGPathElement>(null);

  // When each car went into the pits, and the usual time in the lane here.
  const pitIns = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of list<LiveEvent>(topics.Events)) if (e.type === "pitIn" && e.driver) out.set(e.driver, Date.parse(e.ts));
    return out;
  }, [topics.Events]);
  const laneS = useMemo(() => {
    const times = Object.values<{ Duration?: string }>(topics.PitLaneTimeCollection?.PitTimes ?? {})
      .map((p) => Number(p?.Duration))
      .filter((v) => v > 5 && v < 60)
      .sort((a, b) => a - b);
    return times.length ? times[Math.floor(times.length / 2)] : DEFAULT_LANE_S;
  }, [topics.PitLaneTimeCollection]);

  const state = useRef({ progress, slow, lines, pitIns, laneS, compare, pitOnMap });
  useEffect(() => {
    state.current = { progress, slow, lines, pitIns, laneS, compare, pitOnMap };
  }, [progress, slow, lines, pitIns, laneS, compare, pitOnMap]);

  useEffect(() => {
    let frame = 0;
    const pitOffset = (track.size / 34) * 1.5 * 1.7;
    const draw = () => {
      const now = feedNow();
      const st = state.current;
      const fractions = new Map<string, number>();
      for (const [n, el] of refs.current) {
        const p = st.progress?.[n];
        const line = st.lines[n];
        let pt;
        if (st.pitOnMap && (p?.pit || line?.InPit || line?.PitOut)) {
          // In the pits: move along the pit lane by the time since the car came in.
          const since = st.pitIns.get(n);
          const k = line?.PitOut ? 0.95 : since ? Math.min(0.9, Math.max(0, (now - since) / 1000 / st.laneS)) : 0.5;
          pt = offsetAt(track, -PIT_WINDOW + 2 * PIT_WINDOW * k, pitOffset);
        } else {
          const f = p ? estimateFraction(p, now, st.slow) : null;
          if (f == null) continue;
          fractions.set(n, f);
          pt = track.at(f);
        }
        el.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }
      if (between.current) {
        const [a, b] = st.compare;
        const fa = a ? fractions.get(a) : undefined;
        const fb = b ? fractions.get(b) : undefined;
        if (fa != null && fb != null) {
          const aAhead = (Number(st.lines[a]?.Position) || 99) < (Number(st.lines[b]?.Position) || 99);
          between.current.setAttribute("d", aAhead ? pathBetween(track, fb, fa, 0, 60) : pathBetween(track, fa, fb, 0, 60));
        } else between.current.setAttribute("d", "");
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [track, feedNow]);

  const comparing = compare.length === 2;
  const hi = (n: string) => (comparing ? compare.includes(n) : settings.favouriteDriver === n || focus === n || compare.includes(n));
  const numbers = Object.keys(progress ?? {})
    .filter((n) => progress?.[n]?.p != null && !progress?.[n]?.out && !lines[n]?.Retired)
    .sort((a, b) => Number(hi(a)) - Number(hi(b)));

  return (
    <g>
      {comparing && <path ref={between} fill="none" stroke="var(--accent)" strokeWidth={track.size / 70} strokeLinecap="round" opacity={0.55} />}
      {numbers.map((n) => {
        const d = get(n);
        const pit = Boolean(progress?.[n]?.pit || lines[n]?.InPit);
        const dim = pit || (comparing && !compare.includes(n));
        return (
          <g
            key={n}
            ref={(el) => {
              if (el) refs.current.set(n, el);
              else refs.current.delete(n);
            }}
          >
            <CarDot
              car={{ number: n, tla: d.tla, colour: d.colour, x: 0, y: 0, dim, highlight: hi(n), hideLabel: dim && !hi(n) }}
              size={track.size}
              onClick={() => onSelect(n)}
            />
          </g>
        );
      })}
    </g>
  );
}

// A dotted lane beside the start/finish straight, labelled PIT.
function PitLaneShape({ track }: { track: Track }) {
  const offset = (track.size / 34) * 1.5 * 1.7;
  const d = pathBetween(track, -PIT_WINDOW, PIT_WINDOW, offset, 40);
  const label = offsetAt(track, 0, offset * 1.9);
  return (
    <g pointerEvents="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--surface-3)" strokeWidth={track.size / 70} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#eab308" strokeWidth={track.size / 400} strokeDasharray={`${track.size / 300} ${track.size / 150}`} strokeLinecap="round" opacity={0.8} />
      <text x={label.x} y={label.y} fontSize={track.size / 55} textAnchor="middle" dominantBaseline="central" fill="#eab308" className="font-display font-bold select-none">
        PIT
      </text>
    </g>
  );
}

// Where sectors 2 and 3 start, as lap fractions, from the drivers' sector times
// (median across the field, so one slow lap doesn't move the boundaries).
function sectorFractions(lines: Record<string, { Sectors?: Record<string, { Value?: string; PreviousValue?: string }> }> | undefined): [number, number] | null {
  const s1: number[] = [];
  const s2: number[] = [];
  const s3: number[] = [];
  for (const line of Object.values(lines ?? {})) {
    const v = list<{ Value?: string; PreviousValue?: string }>(line?.Sectors).map((x) => Number(x?.Value || x?.PreviousValue));
    if (v.length === 3 && v.every((x) => x > 5 && x < 200)) {
      s1.push(v[0]);
      s2.push(v[1]);
      s3.push(v[2]);
    }
  }
  if (s1.length === 0) return null;
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const [a, b, c] = [median(s1), median(s2), median(s3)];
  const total = a + b + c;
  return [a / total, (a + b) / total];
}

const trackCache = new WeakMap<CircuitMap, Track>();
function buildFor(map: CircuitMap) {
  let t = trackCache.get(map);
  if (!t) trackCache.set(map, (t = buildTrack(map)));
  return t;
}
