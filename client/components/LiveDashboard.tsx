"use client";

import { useLiveTiming } from "@/lib/useLiveTiming";
import { SessionHeader } from "./SessionHeader";
import { TimingTower } from "./TimingTower";
import { RaceControl } from "./RaceControl";
import { Weather } from "./Weather";
import { TeamRadio } from "./TeamRadio";
import { TrackMap } from "./TrackMap";

export function LiveDashboard() {
  const { topics, connection, streamOpen, trace } = useLiveTiming();
  const hasSession = Boolean(topics.SessionInfo);

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader topics={topics} connection={connection} streamOpen={streamOpen} />
      {!hasSession ? (
        <Panel title="Live timing">
          <p className="text-sm text-neutral-400">
            {connection?.status === "connected"
              ? "Connected to F1 live timing. Waiting for session data…"
              : "Connecting to F1 live timing… Data appears here while a session is on (and shortly before and after)."}
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <TimingTower topics={topics} />
          <div className="flex flex-col gap-4">
            <TrackMap topics={topics} trace={trace} authenticated={connection?.authenticated ?? false} />
            <Weather weather={topics.WeatherData} />
            <RaceControl messages={topics.RaceControlMessages} />
            <TeamRadio topics={topics} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/60">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
