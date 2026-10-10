"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Maximize, Minimize, X } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { list, sessionIsActive, type LiveEvent } from "@/lib/live";
import { countryFlag } from "@/lib/format";
import { LiveTrackMap } from "@/components/live/LiveTrackMap";
import { describeEvent } from "@/components/live/SidePanels";
import { CompactTower, FlagPill } from "./CompactTower";
import { LatestMessageBanner } from "./RaceControl";

// Big-screen layout for a TV or second monitor: map, timing and a ticker, large text,
// no navigation.
export function TvMode() {
  const { topics, connection } = useLive();
  const { get } = useDrivers();
  const [full, setFull] = useState(false);
  const info = topics.SessionInfo;
  const lap = topics.LapCount;
  const events = list<LiveEvent>(topics.Events)
    .filter((e) => ["overtake", "pitOut", "fastestLap", "retired", "raceControl"].includes(e.type))
    .slice(-4)
    .reverse();

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg text-ink">
      <header className="flex items-center gap-4 border-b border-line px-6 py-3">
        <span className="flex items-center gap-2 text-sm font-bold tracking-wide text-accent uppercase">
          <span className="live-dot h-2 w-2 rounded-full bg-accent" /> Live
        </span>
        <h1 className="truncate font-display text-3xl font-bold">
          {countryFlag(info?.Meeting?.Country?.Name)} {info?.Meeting?.Name ?? "F1 Live"} <span className="text-muted">· {info?.Name}</span>
        </h1>
        <div className="ml-auto flex items-center gap-3">
          {lap?.CurrentLap != null && (
            <span className="tnum font-display text-3xl font-bold">
              Lap {lap.CurrentLap}
              {lap.TotalLaps ? <span className="text-muted">/{lap.TotalLaps}</span> : null}
            </span>
          )}
          <FlagPill className="text-lg" />
          <button onClick={toggleFull} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label={full ? "Exit full screen" : "Full screen"}>
            {full ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
          <Link href="/live" className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Exit TV mode">
            <X size={22} />
          </Link>
        </div>
      </header>

      {!sessionIsActive(topics, connection) ? (
        <p className="m-auto text-2xl text-muted">No session is live right now.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,28vw)] gap-4 p-4">
          <div className="min-h-0 [&_section]:h-full">
            <LiveTrackMap onSelect={() => {}} mapClassName="h-[calc(100vh-235px)]" overlay={<LatestMessageBanner />} />
          </div>
          <div className="scroll-thin min-h-0 overflow-y-auto rounded-2xl border border-line bg-surface p-2">
            <CompactTower large />
          </div>
        </div>
      )}

      <footer className="flex items-center gap-6 overflow-hidden border-t border-line px-6 py-3 text-lg whitespace-nowrap">
        {events.map((e, i) => {
          const d = describeEvent(e, (n) => (n ? get(n).tla : ""));
          return (
            <span key={`${e.ts}-${i}`} className="flex items-center gap-2">
              <span className={d.tone}>{d.icon}</span>
              <span className="font-semibold">{d.title}</span>
              {d.detail && <span className="text-muted">{d.detail}</span>}
            </span>
          );
        })}
      </footer>
    </div>
  );
}
