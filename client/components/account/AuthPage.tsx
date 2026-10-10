import { Suspense } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/clerk";

// Clerk's sign-in / sign-up, framed to match the app.
export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="mb-6 text-center">
        <h1 className="font-display text-3xl font-bold">{mode === "sign-in" ? "Welcome back" : "Join the grid"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "sign-in" ? "Sign in to your F1 Live profile." : "Pick your team, predict races and climb the rankings."}
        </p>
      </div>
      {clerkEnabled ? (
        // Clerk's forms read the URL, which must happen inside a Suspense boundary.
        <Suspense>
          {mode === "sign-in" ? (
            <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/profile" />
          ) : (
            <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/profile?welcome=1" />
          )}
        </Suspense>
      ) : (
        <p className="max-w-md rounded-2xl border border-line bg-surface p-5 text-center text-sm text-muted shadow-card">
          Sign-in isn&apos;t set up on this server yet. Add your Clerk keys to <code className="text-ink">.env</code> (see the README) and restart.
        </p>
      )}
    </div>
  );
}
