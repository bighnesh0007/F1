"use client";

import { useEffect, useState } from "react";
import { TRACK_STATUS, type ConnectionInfo, type Topics } from "@/lib/live";

export function SessionHeader({
  topics,
  connection,
  streamOpen,
}: {
  topics: Topics;
  connection: ConnectionInfo | null;
  streamOpen: boolean;
}) {
  const info = topics.SessionInfo;
  const track = TRACK_STATUS[topics.TrackStatus?.Status];
  const lap = topics.LapCount;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      <div>
        <p className="text-lg font-semibold">
          {info ? `${info.Meeting?.Name ?? ""} · ${info.Name ?? ""}` : "No session data yet"}
        </p>
        {info && (
          <p className="text-sm text-neutral-400">
            {[info.Meeting?.Circuit?.ShortName, info.Meeting?.Country?.Name].filter(Boolean).join(", ")}
            {topics.SessionStatus?.Status && ` · ${topics.SessionStatus.Status}`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {lap?.CurrentLap != null && (
          <Stat label="Lap" value={`${lap.CurrentLap}${lap.TotalLaps ? ` / ${lap.TotalLaps}` : ""}`} />
        )}
        <Clock clock={topics.ExtrapolatedClock} />
        {track && <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${track.className}`}>{track.label}</span>}
        <ConnectionBadge connection={connection} streamOpen={streamOpen} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="font-mono font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ExtrapolatedClock gives the remaining time at a point in time; count down from it locally.
function Clock({ clock }: { clock?: { Utc?: string; Remaining?: string; Extrapolating?: boolean } }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (!clock?.Remaining || now === null) return null;

  const [h, m, s] = clock.Remaining.split(":").map(Number);
  let remaining = (h * 3600 + m * 60 + s) * 1000;
  if (clock.Extrapolating && clock.Utc) remaining -= now - Date.parse(clock.Utc);
  remaining = Math.max(0, remaining);
  const total = Math.round(remaining / 1000);
  const text = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return <Stat label="Remaining" value={text} />;
}

function ConnectionBadge({ connection, streamOpen }: { connection: ConnectionInfo | null; streamOpen: boolean }) {
  const live = streamOpen && connection?.status === "connected";
  const label = !streamOpen ? "Server offline" : live ? "Live" : connection?.status === "connecting" ? "Connecting" : "F1 feed offline";
  return (
    <span
      title={connection?.lastError ?? undefined}
      className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-2.5 py-1 text-xs"
    >
      <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-red-500" : "bg-neutral-500"}`} />
      {label}
    </span>
  );
}
