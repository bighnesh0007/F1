import { Suspense } from "react";
import { PublicProfileView } from "@/components/account/PublicProfileView";

export const metadata = { title: "Fan profile" };

export default function PublicProfilePage() {
  return (
    <Suspense>
      <PublicProfileView />
    </Suspense>
  );
}
