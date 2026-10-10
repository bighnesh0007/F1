import { Suspense } from "react";
import { TeamPage } from "@/components/people/TeamPage";

export const metadata = { title: "Team" };

export default function TeamRoute() {
  return (
    <Suspense>
      <TeamPage />
    </Suspense>
  );
}
