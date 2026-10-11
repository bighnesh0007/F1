"use client";

import { useMemo } from "react";
import { buildTrack, pathBetween, type Track } from "@/lib/track";
import type { CircuitMap } from "@/lib/types";

export type MapCar = {
  number: string;
  tla: string;
  colour: string;
  x: number; // screen space
  y: number;
  dim?: boolean;
  highlight?: boolean;
  label?: string;
  hideLabel?: boolean;
};

// Draws a circuit with numbered corners and the finish line. Cars are drawn by the
// `children` render prop (so callers can animate them however they need).
export function CircuitMapView({
  map,
  className,
  showCorners = true,
  children,
  extraPadding = 0,
  trackScale = 1,
  sectors = null,
  straights = null,
  cornerBadges = false,
  under,
}: {
  map: CircuitMap;
  className?: string;
  showCorners?: boolean;
  children?: (track: Track) => React.ReactNode;
  extraPadding?: number;
  trackScale?: number; // wider tarmac, with edges and a centre line, when > 1
  /** Lap fractions where sectors 2 and 3 start: the track is coloured by sector. */
  sectors?: [number, number] | null;
  /** Long straights to mark with a dashed green line, as [start, end] lap fractions. */
  straights?: [number, number][] | null;
  /** Corner numbers in round badges instead of plain text. */
  cornerBadges?: boolean;
  /** Drawn on the track but below the corner numbers and cars (e.g. a pit lane). */
  under?: (track: Track) => React.ReactNode;
}) {
  const track = useMemo(() => buildTrack(map), [map]);
  const { bounds, size, points } = track;
  const pad = size * (0.07 + extraPadding);
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.maxX - bounds.minX + pad * 2} ${bounds.maxY - bounds.minY + pad * 2}`;
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ") + " Z";

  const finish = map.startsAtFinish && points.length > 3 ? finishLine(points, size) : null;

  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={`Map of ${map.name}`}>
      {trackScale > 1 && <path d={path} fill="none" stroke="var(--border-strong)" strokeWidth={(size / 34) * trackScale + size / 180} strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />}
      <path d={path} fill="none" stroke="var(--surface-3)" strokeWidth={(size / 34) * trackScale} strokeLinejoin="round" strokeLinecap="round" />
      {trackScale > 1 ? (
        <path d={path} fill="none" stroke="var(--border-strong)" strokeWidth={size / 400} strokeDasharray={`${size / 90} ${size / 90}`} strokeLinejoin="round" opacity={0.6} />
      ) : (
        <path d={path} fill="none" stroke="var(--border-strong)" strokeWidth={size / 110} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {sectors &&
        SECTOR_COLOURS.map((colour, i) => {
          const from = i === 0 ? 0 : sectors[i - 1];
          const to = i === 2 ? 1 : sectors[i];
          return <path key={i} d={pathBetween(track, from, to)} fill="none" stroke={colour} strokeWidth={size / 150} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />;
        })}
      {straights?.map(([a, b], i) => (
        <path key={i} d={pathBetween(track, a, b, (size / 34) * trackScale * 0.32)} fill="none" stroke="#22c55e" strokeWidth={size / 170} strokeDasharray={`${size / 120} ${size / 160}`} strokeLinecap="round" opacity={0.95} />
      ))}
      {under?.(track)}
      {finish && <line {...finish} stroke="var(--text)" strokeWidth={size / 160} strokeLinecap="round" />}
      {showCorners &&
        map.corners.map((c) => {
          const r = (c.angle * Math.PI) / 180;
          const off = track.toScreen(c.x + Math.cos(r) * (cornerBadges ? 900 : 650), c.y + Math.sin(r) * (cornerBadges ? 900 : 650));
          if (cornerBadges) {
            return (
              <g key={`${c.number}${c.letter}`} transform={`translate(${off.x} ${off.y})`} className="select-none">
                <circle r={size / 58} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth={size / 600} />
                <text fontSize={size / 66} textAnchor="middle" dominantBaseline="central" fill="var(--muted)" className="font-display font-bold">
                  {`${c.number}${c.letter ?? ""}`}
                </text>
              </g>
            );
          }
          return (
            <text
              key={`${c.number}${c.letter}`}
              x={off.x}
              y={off.y}
              fontSize={size / 42}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--faint)"
              className="font-display font-semibold select-none"
            >
              {`${c.number}${c.letter ?? ""}`}
            </text>
          );
        })}
      {children?.(track)}
    </svg>
  );
}

// Sector 1, 2 and 3, as on F1's own graphics.
export const SECTOR_COLOURS = ["#ef4444", "#3b82f6", "#eab308"];

function finishLine(points: { x: number; y: number }[], size: number) {
  const a = points[0];
  const b = points[3];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (size / 45);
  const ny = (dx / len) * (size / 45);
  return { x1: a.x - nx, y1: a.y - ny, x2: a.x + nx, y2: a.y + ny };
}

export function CarDot({ car, size, onClick, transitionMs }: { car: MapCar; size: number; onClick?: () => void; transitionMs?: number }) {
  const r = size / (car.highlight ? 55 : 68);
  return (
    <g
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${car.tla}, show details` : undefined}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      className="cursor-pointer outline-none [&:focus-visible>circle:first-of-type]:stroke-[var(--accent)]"
      opacity={car.dim ? 0.35 : 1}
      style={{ transform: `translate(${car.x}px, ${car.y}px)`, transition: transitionMs ? `transform ${transitionMs}ms linear` : undefined }}
    >
      {car.highlight && <circle r={r * 1.9} fill={`#${car.colour}`} opacity={0.25} />}
      <circle r={r} fill={`#${car.colour}`} stroke="var(--surface)" strokeWidth={size / 320} />
      {!car.hideLabel && <text
        x={r * 1.5}
        y={0}
        dominantBaseline="central"
        fontSize={size / 38}
        fontWeight={car.highlight ? 700 : 600}
        fill="var(--text)"
        stroke="var(--bg)"
        strokeWidth={size / 400}
        paintOrder="stroke"
        className="font-display select-none"
      >
        {car.label ?? car.tla}
      </text>}
    </g>
  );
}
