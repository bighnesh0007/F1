import { Suspense } from "react";
import { PlayView } from "@/components/play/PlayView";
import { Seeded } from "@/components/Seeded";

export const metadata = { title: "Predict & play" };

export default function PlayPage() {
  return (
    <Suspense fallback={<PlayView />}>
      <Seeded paths={["/api/weekend"]}>
        <PlayView />
      </Seeded>
    </Suspense>
  );
}
