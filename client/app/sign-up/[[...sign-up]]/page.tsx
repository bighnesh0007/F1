import { AuthPage } from "@/components/account/AuthPage";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}
