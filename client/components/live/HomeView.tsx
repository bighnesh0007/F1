"use client";

import { useLive } from "@/lib/live-context";
import { sessionIsActive } from "@/lib/live";
import dynamic from "next/dynamic";
import { WeekendView } from "./WeekendView";

// The live view (charts, map animation) is only downloaded while a session is on.
const LiveView = dynamic(() => import("./LiveView").then((m) => m.LiveView));

export function HomeView() {
  const { topics, connection } = useLive();
  return sessionIsActive(topics, connection) ? <LiveView /> : <WeekendView />;
}
