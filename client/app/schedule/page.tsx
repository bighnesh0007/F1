import { Suspense } from "react";
import { ScheduleView } from "@/components/race/ScheduleView";
import { Seeded } from "@/components/Seeded";
import { yearQueryFrom } from "@/lib/year-query";

export const metadata = { title: "Schedule" };

export default function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  return (
    <Suspense>
      <SeededSchedule searchParams={searchParams} />
    </Suspense>
  );
}

async function SeededSchedule({ searchParams }: { searchParams: PageProps<"/schedule">["searchParams"] }) {
  const q = await yearQueryFrom(searchParams);
  return (
    <Seeded paths={[`/api/schedule${q}`, `/api/season-results${q}`]}>
      <ScheduleView />
    </Seeded>
  );
}
