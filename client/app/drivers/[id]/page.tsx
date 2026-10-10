import { Suspense } from "react";
import { DriverPage } from "@/components/people/DriverPage";

export const metadata = { title: "Driver" };

export default function DriverRoute() {
  return (
    <Suspense>
      <DriverPage />
    </Suspense>
  );
}
