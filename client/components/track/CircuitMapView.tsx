"use client";

import { useMemo } from "react";
import { buildTrack, type Track } from "@/lib/track";
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
}: {
  map: CircuitMap;
  className?: string;
  showCorners?: boolean;
  children?: (track: Track) => React.ReactNode;
  extraPadding?: number;
}) {
  const track = useMemo(() => buildTrack(map), [map]);
  const { bounds, size, points } = track;
  const pad = size * (0.07 + extraPadding);
  const viewBox = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.maxX - bounds.minX + pad * 2} ${bounds.maxY - bounds.minY + pad * 2}`;
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(" ") + " Z";

  const finish = map.startsAtFinish && points.length > 3 ? finishLine(points, size) : null;

  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={`Map of ${map.name}`}>
      <path d={path} fill="none" stroke="var(--surface-3)" strokeWidth={size / 34} strokeLinejoin="round" strokeLinecap="round" />
      <path d={path} fill="none" stroke="var(--border-strong)" strokeWidth={size / 110} strokeLinejoin="round" strokeLinecap="round" />
      {finish && <line {...finish} stroke="var(--text)" strokeWidth={size / 160} strokeLinecap="round" />}
      {showCorners &&
        map.corners.map((c) => {
          const r = (c.angle * Math.PI) / 180;
          const off = track.toScreen(c.x + Math.cos(r) * 650, c.y + Math.sin(r) * 650);
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
