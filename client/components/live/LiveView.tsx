"use client";

import Link from "next/link";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { useSettings, type LivePanel } from "@/lib/settings";
import { useApi } from "@/lib/useApi";
import type { Weekend } from "@/lib/types";
import { Segmented, cn } from "@/components/ui";
import { SessionBar } from "./SessionBar";
import { TimingTower } from "./TimingTower";
import { LiveTrackMap } from "./LiveTrackMap";
import { Insights } from "./Insights";
import { BattlesPanel, FeedPanel, RadioPanel, WeatherPanel } from "./SidePanels";
import { DriverSheet } from "./DriverSheet";

type MobileTab = "timing" | "track" | "feed" | "insights";

export function LiveView() {
  const { settings } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>("timing");
  const { data: weekend } = useApi<Weekend>("/api/weekend");
  // During a session, the current race weekend is the one being shown.
  const circuit = weekend?.current?.circuit;

  const panels: Record<LivePanel, React.ReactNode> = {
    battles: <BattlesPanel onSelect={setSelected} />,
    feed: <FeedPanel />,
    weather: <WeatherPanel lat={circuit?.lat} lon={circuit?.lon} />,
    radio: <RadioPanel />,
  };
  const visible = settings.livePanels.filter((p) => p.visible);
  const show = (t: MobileTab) => (tab === t ? "" : "max-lg:hidden");

  return (
    <div className="space-y-4">
      <SessionBar
        action={
          <Link href="/live" className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-ink shadow-card hover:opacity-90">
            <Maximize2 size={14} /> Open race centre
          </Link>
        }
      />
      <div className="lg:hidden [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "timing", label: "Timing" },
            { value: "track", label: "Track" },
            { value: "feed", label: "Feed" },
            { value: "insights", label: "Insights" },
          ]}
        />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(330px,390px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)_minmax(320px,370px)]">
        <div className={cn("lg:sticky lg:top-20", show("timing"))}>
          <TimingTower onSelect={setSelected} />
        </div>
        <div className="min-w-0 space-y-4">
          <div className={show("track")}>
            <LiveTrackMap onSelect={setSelected} />
          </div>
          <div className={show("insights")}>
            <Insights />
          </div>
          {/* Side panels sit under the map until the screen is wide enough for a third column. */}
          <div className={cn("space-y-4 2xl:hidden", show("feed"))}>
            {visible.map((p) => <div key={p.id}>{panels[p.id]}</div>)}
          </div>
        </div>
        <div className="hidden space-y-4 2xl:block">
          {visible.map((p) => <div key={p.id}>{panels[p.id]}</div>)}
        </div>
      </div>
      <DriverSheet number={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
