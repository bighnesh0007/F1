import { Suspense } from "react";
import { LoginView } from "@/components/account/LoginView";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
