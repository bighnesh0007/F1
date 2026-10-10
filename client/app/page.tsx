"use client";

import { useLive } from "@/lib/live-context";
import { sessionIsActive } from "@/lib/live";
import { LiveView } from "@/components/live/LiveView";
import { WeekendView } from "@/components/live/WeekendView";

export default function LivePage() {
  const { topics, connection } = useLive();
  return sessionIsActive(topics, connection) ? <LiveView /> : <WeekendView />;
}
