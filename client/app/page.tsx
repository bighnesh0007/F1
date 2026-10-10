import { Suspense } from "react";
import { LiveDashboard, Panel } from "@/components/LiveDashboard";
import { WeekendPanel } from "@/components/WeekendPanel";
import { StandingsPanel } from "@/components/StandingsPanel";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          F1 <span className="text-red-500">Live</span>
        </h1>
        <p className="text-xs text-neutral-500">Data: F1 live timing · OpenF1 · Jolpica</p>
      </header>

      <LiveDashboard />

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Suspense fallback={<Loading title="Race weekend" />}>
          <WeekendPanel />
        </Suspense>
        <Suspense fallback={<Loading title="Championship" />}>
          <StandingsPanel />
        </Suspense>
      </div>
    </main>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <p className="text-sm text-neutral-400">Loading…</p>
    </Panel>
  );
}
