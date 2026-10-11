"use client";

import { useMemo, useState } from "react";
import { CloudRain, Wind } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { findStraights, nearestFraction, pathBetween, type Track } from "@/lib/track";
import { fullThrottleZones } from "@/lib/telemetry";
import { yellowSectors } from "@/lib/flags";
import type { CircuitMap, LapTelemetry, Replay } from "@/lib/types";
import { CarDot, CircuitMapView, LayerChip, SECTOR_COLOURS } from "@/components/track/CircuitMapView";
import { FlagOverlay, PitLanePath, SpeedOverlay, Trail, sectorFractions } from "@/components/track/overlays";
import { lastBefore, type Board } from "./board";

type Colour = "sectors" | "speed" | "none";

// The replay map: cars (with trails for the ones you follow), stopped cars and
// incidents, yellow flags, the pit lane, sectors or a speed map, and full-throttle
// zones. Layers are switched with the chips underneath.
export function ReplayMap({
  replay,
  map,
  track,
  t,
  board,
  outAt,
  highlighted,
  dimOthers,
  onPick,
  lap,
  betweenPair,
}: {
  replay: Replay;
  map: CircuitMap;
  track: Track;
  t: number;
  board: Board;
  outAt: Map<string, number>;
  highlighted: string[];
  dimOthers: boolean;
  onPick: (n: string) => void;
  /** A lap's telemetry: enables the speed map and real full-throttle zones. */
  lap: LapTelemetry | null;
  /** Two cars to join with the stretch of track between them. */
  betweenPair: [string, string] | null;
}) {
  const { settings } = useSettings();
  const [colour, setColour] = useState<Colour>("sectors");
  const [throttle, setThrottle] = useState(true);
  const exact = map.source === "multiviewer";

  const sectors = useMemo(() => (exact ? sectorFractions(track, replay.sectorPoints, replay.sectorTimes) : null), [exact, track, replay.sectorPoints, replay.sectorTimes]);
  // Full-throttle zones from the lap's telemetry when there is one, else from the track's shape.
  const zones = useMemo<[number, number][]>(() => {
    if (lap) {
      return fullThrottleZones(lap).flatMap((z) => {
        const [x0, y0, x1, y1] = [lap.x[z.i0], lap.y[z.i0], lap.x[z.i1], lap.y[z.i1]];
        return x0 != null && y0 != null && x1 != null && y1 != null ? [[nearestFraction(track, track.toScreen(x0, y0)), nearestFraction(track, track.toScreen(x1, y1))] as [number, number]] : [];
      });
    }
    return exact ? findStraights(track) : [];
  }, [lap, track, exact]);
  const flags = useMemo(() => yellowSectors(replay.raceControl.filter((m) => m.t <= t)), [replay.raceControl, t]);
  const colourMode: Colour = colour === "speed" && !lap ? "sectors" : colour;

  const i = Math.min(Math.floor(t / replay.stepMs), replay.frames.length - 1);
  const k = (t % replay.stepMs) / replay.stepMs;
  const frame = replay.frames[i];
  const next = replay.frames[Math.min(i + 1, replay.frames.length - 1)];
  const index = new Map(replay.drivers.map((d, idx) => [d.number, idx]));
  const raw = (n: string, f: (number | null)[], g: (number | null)[], kk: number) => {
    const idx = index.get(n)!;
    const [x0, y0] = [f[idx * 2], f[idx * 2 + 1]];
    if (x0 == null || y0 == null) return null;
    const [x1, y1] = [g[idx * 2] ?? x0, g[idx * 2 + 1] ?? y0];
    return { x: x0 + (x1 - x0) * kk, y: y0 + (y1 - y0) * kk };
  };
  const screen = (n: string) => {
    const p = raw(n, frame, next, k);
    return p ? track.toScreen(p.x, p.y) : null;
  };

  // Cars that haven't moved for 10 s away from the pits have stopped on track
  // (unless most of the field has, as on the grid or under a red flag).
  const still = new Set(replay.drivers.filter((d) => isStill(replay, index.get(d.number)!, i) && !board[d.number]?.pit).map((d) => d.number));
  const stopped = still.size <= 4 ? still : new Set<string>();
  const incidents = exact ? recentIncidents(replay, t) : [];
  const weather = lastBefore(replay.weather ?? [], t);

  return (
    <div>
      <div className="relative">
        <CircuitMapView
          map={map}
          className="aspect-[4/3] w-full"
          showCorners={exact}
          cornerBadges={exact}
          trackScale={1.7}
          sectors={colourMode === "sectors" ? sectors : null}
          straights={throttle ? zones : null}
          under={(trk) => (
            <>
              {colourMode === "speed" && lap && <SpeedOverlay track={trk} lap={lap} />}
              {exact && replay.pitLane && <PitLanePath track={trk} points={replay.pitLane} />}
              {exact && <FlagOverlay track={trk} map={map} active={flags} />}
            </>
          )}
        >
          {(trk) => (
            <>
              {incidents.map((m) => {
                const corner = map.corners.find((c) => c.number === m.turn);
                if (!corner) return null;
                const p = trk.toScreen(corner.x, corner.y);
                return <IncidentMarker key={`${m.t}-${m.message}`} x={p.x} y={p.y} size={trk.size} tone={m.tone} label={`T${m.turn} · ${m.label}`} pulse={!settings.reduceMotion} />;
              })}
              {betweenPair &&
                (() => {
                  const [a, b] = betweenPair.map(screen);
                  if (!a || !b) return null;
                  const [fa, fb] = [nearestFraction(trk, a), nearestFraction(trk, b)];
                  const aAhead = (board[betweenPair[0]]?.p ?? 99) < (board[betweenPair[1]]?.p ?? 99);
                  return <path d={aAhead ? pathBetween(trk, fb, fa) : pathBetween(trk, fa, fb)} fill="none" stroke="var(--accent)" strokeWidth={trk.size / 70} strokeLinecap="round" opacity={0.55} />;
                })()}
              {/* Trails for the cars you follow: where they were over the last 3 seconds. */}
              {!settings.reduceMotion &&
                highlighted.map((n) => {
                  const d = replay.drivers[index.get(n) ?? -1];
                  if (!d || board[n]?.out) return null;
                  const pts = [];
                  for (let j = Math.max(0, i - 6); j <= i; j++) {
                    const p = raw(n, replay.frames[j], replay.frames[j], 0);
                    if (p) pts.push(trk.toScreen(p.x, p.y));
                  }
                  const now = screen(n);
                  if (now) pts.push(now);
                  return <Trail key={n} points={pts} colour={d.teamColour ?? "888888"} size={trk.size} />;
                })}
              {replay.drivers.map((d) => {
                const p = screen(d.number);
                if (!p) return null;
                const row = board[d.number];
                // Retired cars show where they stopped for a minute and a half, then leave the map.
                if (row?.out) {
                  const since = t - (outAt.get(d.number) ?? t);
                  return since < 90_000 ? <StoppedCar key={d.number} x={p.x} y={p.y} size={trk.size} colour={d.teamColour} label={`${d.tla} · OUT`} tone="red" /> : null;
                }
                if (stopped.has(d.number)) return <StoppedCar key={d.number} x={p.x} y={p.y} size={trk.size} colour={d.teamColour} label={`${d.tla} · stopped`} tone="yellow" />;
                const mine = highlighted.includes(d.number);
                const dim = ((row?.pit || row?.ko) && !mine) || (dimOthers && !mine);
                return (
                  <CarDot
                    key={d.number}
                    car={{ number: d.number, tla: d.tla, colour: d.teamColour ?? "888888", x: p.x, y: p.y, highlight: mine, dim, hideLabel: (row?.pit || dimOthers) && !mine }}
                    size={trk.size}
                    onClick={() => onPick(d.number)}
                  />
                );
              })}
            </>
          )}
        </CircuitMapView>
        {weather && (
          <p className="pointer-events-none absolute top-1 left-2 flex flex-wrap items-center gap-x-2 rounded-lg bg-surface/80 px-2 py-1 text-[11px] font-semibold text-muted backdrop-blur">
            {weather[1] != null && <span>Air {Math.round(weather[1])}°</span>}
            {weather[2] != null && <span>Track {Math.round(weather[2])}°</span>}
            {weather[4] != null && (
              <span className="flex items-center gap-1">
                <Wind size={11} /> {weather[4].toFixed(1)} m/s{weather[3] != null ? ` from ${compass(weather[3])}` : ""}
              </span>
            )}
            {weather[6] ? (
              <span className="flex items-center gap-1 text-[var(--series-1)]">
                <CloudRain size={11} /> Rain
              </span>
            ) : null}
          </p>
        )}
      </div>

      {exact && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1 text-[11px]">
          <LayerChip on={colourMode === "sectors"} onClick={() => setColour(colourMode === "sectors" ? "none" : "sectors")} disabled={!sectors} title="Track coloured by timing sector">
            {SECTOR_COLOURS.map((c, j) => <span key={j} className="h-1.5 w-3 rounded-full" style={{ background: c }} />)} Sectors
          </LayerChip>
          {lap && (
            <LayerChip on={colourMode === "speed"} onClick={() => setColour(colourMode === "speed" ? "sectors" : "speed")} title="The lap in the panel below, coloured by speed">
              <span className="h-1.5 w-8 rounded-full" style={{ background: "linear-gradient(90deg, var(--speed-slow), var(--speed-fast))" }} /> Speed map
              {colourMode === "speed" && <span className="font-normal text-muted">{Math.min(...lap.speed)}–{Math.max(...lap.speed)} km/h</span>}
            </LayerChip>
          )}
          <LayerChip on={throttle} onClick={() => setThrottle(!throttle)} disabled={zones.length === 0} title={lap ? "Where the lap below is flat out (from telemetry)" : "Long straights (from the track's shape)"}>
            <span className="h-0 w-4 border-t-2 border-dashed border-green-500" /> Full throttle
          </LayerChip>
          {flags.size > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow/20 px-2.5 py-1 font-semibold text-yellow">
              <span className="h-1.5 w-3 rounded-full bg-yellow-400" /> Yellow flag
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// A car that has stopped or retired: a ring with a cross where it came to rest.
function StoppedCar({ x, y, size, colour, label, tone }: { x: number; y: number; size: number; colour: string; label: string; tone: "red" | "yellow" }) {
  const r = size / 60;
  const ring = tone === "red" ? "#ef4444" : "#f59e0b";
  return (
    <g transform={`translate(${x} ${y})`} aria-label={label}>
      <circle r={r * 1.9} fill={ring} opacity={0.18} />
      <circle r={r} fill={`#${colour}`} stroke={ring} strokeWidth={size / 260} />
      <path d={`M${-r * 0.45},${-r * 0.45}L${r * 0.45},${r * 0.45}M${r * 0.45},${-r * 0.45}L${-r * 0.45},${r * 0.45}`} stroke="#fff" strokeWidth={size / 320} strokeLinecap="round" />
      <text x={r * 1.6} y={-r * 1.4} fontSize={size / 46} fontWeight={700} fill={ring} stroke="var(--bg)" strokeWidth={size / 400} paintOrder="stroke" className="font-display select-none">
        {label}
      </text>
    </g>
  );
}

// Where race control has just reported something (from "TURN n" in the message).
function IncidentMarker({ x, y, size, tone, label, pulse }: { x: number; y: number; size: number; tone: "red" | "yellow"; label: string; pulse: boolean }) {
  const r = size / 45;
  const colour = tone === "red" ? "#ef4444" : "#f59e0b";
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r} fill="none" stroke={colour} strokeWidth={size / 300} opacity={0.9}>
        {pulse && <animate attributeName="r" values={`${r * 0.6};${r * 1.6}`} dur="1.6s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      <path d={`M0,${-r * 0.55}L${r * 0.5},${r * 0.35}L${-r * 0.5},${r * 0.35}Z`} fill={colour} />
      <text y={-r * 1.1} fontSize={size / 50} textAnchor="middle" fontWeight={700} fill={colour} stroke="var(--bg)" strokeWidth={size / 400} paintOrder="stroke" className="font-display select-none">
        {label}
      </text>
    </g>
  );
}

function isStill(replay: Replay, idx: number, i: number, seconds = 10) {
  const frames = replay.frames;
  const span = Math.round((seconds * 1000) / replay.stepMs);
  if (i < span) return false;
  const x = frames[i][idx * 2];
  const y = frames[i][idx * 2 + 1];
  if (x == null || y == null) return false;
  for (let j = i - span; j < i; j++) {
    const px = frames[j][idx * 2];
    const py = frames[j][idx * 2 + 1];
    if (px == null || py == null || Math.hypot(px - x, py - y) > 60) return false;
  }
  return true;
}

// Race control messages from the last minute that name a corner.
function recentIncidents(replay: Replay, t: number) {
  const out: { t: number; message: string; turn: number; label: string; tone: "red" | "yellow" }[] = [];
  for (const m of replay.raceControl) {
    if (m.t > t || t - m.t > 60_000) continue;
    const turn = /\bTURNS? (\d+)/i.exec(m.message)?.[1];
    if (!turn) continue;
    const text = m.message.toUpperCase();
    const label = /STOPPED|CRASH|COLLISION|CONTACT|SPUN|INCIDENT|INVESTIGAT|UNSAFE|IMPED/.test(text)
      ? /STOPPED/.test(text) ? "Car stopped" : /IMPED/.test(text) ? "Impeding" : "Incident"
      : /DELETED|TRACK LIMITS/.test(text) ? "Track limits" : null;
    if (!label) continue;
    out.push({ t: m.t, message: m.message, turn: Number(turn), label, tone: label === "Track limits" ? "yellow" : "red" });
  }
  // One marker per corner (the newest), at most four at once.
  const byTurn = new Map(out.map((m) => [m.turn, m]));
  return [...byTurn.values()].slice(-4);
}
