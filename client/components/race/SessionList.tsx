"use client";

import { CheckCircle2 } from "lucide-react";
import type { ScheduleSession } from "@/lib/types";
import { localDay, localTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cn } from "@/components/ui";

const DURATION_MS: Record<string, number> = { Race: 2.5 * 3600_000, Sprint: 3600_000 };

export function SessionList({ sessions }: { sessions: ScheduleSession[] }) {
  const now = useNow(30_000);
  const nextIndex = now == null ? -1 : sessions.findIndex((s) => Date.parse(s.start) + (DURATION_MS[s.key] ?? 3600_000) > now);
  return (
    <ol className="space-y-1.5">
      {sessions.map((s, i) => {
        const start = Date.parse(s.start);
        const live = now != null && now >= start && i === nextIndex;
        const done = now != null && (nextIndex === -1 || i < nextIndex);
        const next = i === nextIndex && !live;
        return (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5",
              live ? "bg-accent text-accent-ink" : next ? "bg-surface-2 ring-1 ring-accent/50" : "bg-surface-2",
              done && "opacity-60",
            )}
          >
            <div className="w-24 shrink-0">
              <p className="text-xs font-semibold">{now != null ? localDay(s.start) : ""}</p>
              <p className={cn("tnum font-display text-lg leading-tight font-bold", live && "text-accent-ink")}>{now != null ? localTime(s.start) : " "}</p>
            </div>
            <p className="flex-1 font-medium">{s.name}</p>
            {live && <span className="flex items-center gap-1.5 text-xs font-bold"><span className="live-dot h-1.5 w-1.5 rounded-full bg-accent-ink" />LIVE</span>}
            {next && <span className="text-xs font-semibold text-accent">Up next</span>}
            {done && <CheckCircle2 size={16} className="text-faint" />}
          </li>
        );
      })}
    </ol>
  );
}
