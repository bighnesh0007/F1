import { Suspense } from "react";
import { ScheduleView } from "@/components/race/ScheduleView";

export const metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleView />
    </Suspense>
  );
}
