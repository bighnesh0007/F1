import { Suspense } from "react";
import { HomeView } from "@/components/live/HomeView";
import { Seeded } from "@/components/Seeded";

export default function LivePage() {
  return (
    <Suspense fallback={<HomeView />}>
      <Seeded paths={["/api/weekend", "/api/standings"]}>
        <HomeView />
      </Seeded>
    </Suspense>
  );
}
