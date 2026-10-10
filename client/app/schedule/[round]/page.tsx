import { Suspense } from "react";
import { RoundView } from "@/components/race/RoundView";
import { Seeded } from "@/components/Seeded";
import { yearQueryFrom } from "@/lib/year-query";

export const metadata = { title: "Race weekend" };

export default function RoundPage({ searchParams }: PageProps<"/schedule/[round]">) {
  return (
    <Suspense>
      <SeededRound searchParams={searchParams} />
    </Suspense>
  );
}

async function SeededRound({ searchParams }: { searchParams: PageProps<"/schedule/[round]">["searchParams"] }) {
  const q = await yearQueryFrom(searchParams);
  return (
    <Seeded paths={[`/api/schedule${q}`]}>
      <RoundView />
    </Seeded>
  );
}
