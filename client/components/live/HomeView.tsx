"use client";

import { useLive } from "@/lib/live-context";
import { sessionIsActive } from "@/lib/live";
import { LiveView } from "./LiveView";
import { WeekendView } from "./WeekendView";

export function HomeView() {
  const { topics, connection } = useLive();
  return sessionIsActive(topics, connection) ? <LiveView /> : <WeekendView />;
}
