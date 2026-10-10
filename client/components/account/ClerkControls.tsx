"use client";

// Everything that talks to Clerk in the browser. Only rendered when Clerk is enabled
// (Clerk hooks need <ClerkProvider>).
import { useEffect, useState } from "react";
import { Show, SignInButton, SignUpButton, UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Tells the app which Clerk user is signed in.
export function ClerkBridge() {
  const { isLoaded, userId } = useClerkAuth();
  const { setClerkUserId } = useAuth();
  useEffect(() => {
    if (isLoaded) setClerkUserId(userId ?? null);
  }, [isLoaded, userId, setClerkUserId]);
  return null;
}

export function HeaderAuth({ signedInExtra }: { signedInExtra?: React.ReactNode }) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink">Sign up</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        {signedInExtra}
        <UserButton appearance={{ elements: { avatarBox: { width: 32, height: 32 } } }} />
      </Show>
    </>
  );
}

export function SignInCta({ label = "Sign in to play" }: { label?: string }) {
  return (
    <SignInButton mode="modal">
      <button className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink">{label}</button>
    </SignInButton>
  );
}

// Asks Google (through Clerk) for Calendar access, connecting Google if needed.
export function useConnectGoogleCalendar() {
  const { user } = useUser();
  return async () => {
    if (!user) return;
    const redirectUrl = window.location.href;
    const google = user.externalAccounts.find((a) => String(a.provider).includes("google"));
    const account = google
      ? await google.reauthorize({ additionalScopes: [CALENDAR_SCOPE], redirectUrl })
      : await user.createExternalAccount({ strategy: "oauth_google", additionalScopes: [CALENDAR_SCOPE], redirectUrl });
    const url = account.verification?.externalVerificationRedirectURL;
    if (url) window.location.href = url.toString();
  };
}

export function ConnectGoogleCalendarButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const connect = useConnectGoogleCalendar();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button onClick={() => void connect().catch((err) => setError(err?.errors?.[0]?.longMessage ?? err.message))} className={className}>
        {children}
      </button>
      {error && <span className="block text-xs text-red-500">{error}</span>}
    </>
  );
}

export function useClerkActions() {
  const clerk = useClerk();
  return {
    openAccount: () => clerk.openUserProfile(),
    signOut: () => clerk.signOut({ redirectUrl: "/" }),
  };
}
