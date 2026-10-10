"use client";

import type { Topics } from "@/lib/live";
import type { TracePoint } from "@/lib/useLiveTiming";
import { Panel } from "./LiveDashboard";

// Plots each car's latest X/Y position. The track outline is traced from the
// positions received so far, so it fills in as cars complete laps.
// Position data needs an F1 TV token (F1_AUTH_TOKEN) during live sessions.
export function TrackMap({ topics, trace, authenticated }: { topics: Topics; trace: TracePoint[][]; authenticated: boolean }) {
  const entries: Record<string, { X: number; Y: number; Status?: string }> = topics.Position?.Entries ?? {};
  const drivers = topics.DriverList ?? {};

  const cars = Object.entries(entries).filter(([, p]) => p && (p.X !== 0 || p.Y !== 0));

  if (cars.length === 0) {
    return (
      <Panel title="Track map">
        <p className="text-sm text-neutral-400">
          {authenticated
            ? "Waiting for car position data…"
            : "Live car positions need an F1 TV subscription. Set F1_AUTH_TOKEN on the server to enable them."}
        </p>
      </Panel>
    );
  }

  const all = [...trace.flat(), ...cars.map(([, p]) => ({ x: p.X, y: p.Y }))];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(maxX - minX, maxY - minY) * 0.05 + 1;
  const viewBox = `${minX - pad} ${-(maxY + pad)} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const size = Math.max(maxX - minX, maxY - minY);

  return (
    <Panel title="Track map">
      <svg viewBox={viewBox} className="aspect-square w-full">
        {trace.map((segment, i) => (
          <polyline
            key={i}
            points={segment.map((p) => `${p.x},${-p.y}`).join(" ")}
            fill="none"
            stroke="#404040"
            strokeWidth={size / 120}
            strokeLinejoin="round"
          />
        ))}
        {cars.map(([number, p]) => {
          const d = drivers[number] ?? {};
          return (
            <g key={number}>
              <circle cx={p.X} cy={-p.Y} r={size / 70} fill={`#${d.TeamColour ?? "ccc"}`} stroke="#000" strokeWidth={size / 400} />
              <text x={p.X + size / 50} y={-p.Y + size / 150} fontSize={size / 35} fill="#e5e5e5">
                {d.Tla ?? number}
              </text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}
