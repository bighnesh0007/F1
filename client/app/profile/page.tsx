import { Suspense } from "react";
import { ProfileView } from "@/components/account/ProfileView";

export const metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileView />
    </Suspense>
  );
}
