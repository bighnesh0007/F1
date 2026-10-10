import { Suspense } from "react";
import { StandingsView } from "@/components/standings/StandingsView";

export const metadata = { title: "Standings" };

export default function StandingsPage() {
  return (
    <Suspense>
      <StandingsView />
    </Suspense>
  );
}
