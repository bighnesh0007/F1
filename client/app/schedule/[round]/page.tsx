import { Suspense } from "react";
import { RoundView } from "@/components/race/RoundView";

export const metadata = { title: "Race weekend" };

export default function RoundPage() {
  return (
    <Suspense>
      <RoundView />
    </Suspense>
  );
}
