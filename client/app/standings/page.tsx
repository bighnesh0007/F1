import { Suspense } from "react";
import { StandingsView } from "@/components/standings/StandingsView";
import { Seeded } from "@/components/Seeded";
import { yearQueryFrom } from "@/lib/year-query";

export const metadata = { title: "Standings" };

export default function StandingsPage({ searchParams }: PageProps<"/standings">) {
  return (
    <Suspense>
      <SeededStandings searchParams={searchParams} />
    </Suspense>
  );
}

async function SeededStandings({ searchParams }: { searchParams: PageProps<"/standings">["searchParams"] }) {
  const q = await yearQueryFrom(searchParams);
  return (
    <Seeded paths={[`/api/standings${q}`, `/api/schedule${q}`]}>
      <StandingsView />
    </Seeded>
  );
}
