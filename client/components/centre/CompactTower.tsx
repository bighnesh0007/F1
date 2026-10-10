"use client";

import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { isRaceSession, list, TRACK_STATUS } from "@/lib/live";
import { TeamBar, Tyre, cn } from "@/components/ui";
import { useTowerRows } from "@/components/live/TimingTower";

// A dense timing list for small windows (picture-in-picture) and the TV view.
export function CompactTower({ large = false, limit }: { large?: boolean; limit?: number }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const rows = useTowerRows().slice(0, limit);
  const race = isRaceSession(topics);
  return (
    <ol className={cn("space-y-0.5", large ? "text-xl" : "text-[13px]")}>
      {rows.map((row) => {
        const t = row.timing;
        const d = get(row.number);
        const gap = race
          ? row.position === 1
            ? t.NumberOfLaps ? `Lap ${t.NumberOfLaps}` : "Leader"
            : t.IntervalToPositionAhead?.Value || t.GapToLeader
          : t.TimeDiffToFastest ?? list(t.Stats).at(-1)?.TimeDiffToFastest ?? t.BestLapTime?.Value;
        const status = t.InPit ? "PIT" : t.Retired ? "OUT" : null;
        return (
          <li key={row.number} className={cn("grid items-center gap-2 rounded-lg px-2", large ? "grid-cols-[2.2em_1fr_auto_1.6em] py-1" : "grid-cols-[1.6em_1fr_auto_18px] py-0.5", (t.Retired || t.Stopped) && "opacity-45")}>
            <span className="tnum text-center font-display font-bold">{row.position < 99 ? row.position : "–"}</span>
            <span className="flex min-w-0 items-center gap-2">
              <TeamBar colour={d.colour} className={large ? "h-6 shrink-0" : "h-4 shrink-0"} />
              <span className="shrink-0 font-display font-bold">{d.tla}</span>
              {status && <span className="rounded bg-surface-3 px-1 text-[0.65em] font-bold text-muted">{status}</span>}
            </span>
            <span className="tnum text-right text-muted">{gap || "–"}</span>
            <Tyre compound={row.stint?.Compound} size={large ? 26 : 16} />
          </li>
        );
      })}
    </ol>
  );
}

export function FlagPill({ className }: { className?: string }) {
  const { topics } = useLive();
  const track = TRACK_STATUS[String(topics.TrackStatus?.Status)];
  if (!track) return null;
  const tone = { green: "bg-green-600 text-white", yellow: "bg-yellow-400 text-black", sc: "bg-yellow-400 text-black", red: "bg-red-600 text-white" }[track.tone];
  return <span className={cn("rounded-lg px-2.5 py-1 font-bold tracking-wide uppercase", tone, className)}>{track.label}</span>;
}
