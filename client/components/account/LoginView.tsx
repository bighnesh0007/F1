"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Segmented } from "@/components/ui";

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, register, googleAvailable } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/profile";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await login(email, password);
      else await register(email, password, name);
      router.push(mode === "signup" ? "/profile?welcome=1" : next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_60%)] opacity-[0.14]" />
        <div className="relative">
          <h1 className="font-display text-3xl font-bold">{mode === "signin" ? "Welcome back" : "Join the grid"}</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "signin" ? "Sign in to your F1 Live profile." : "Pick your team, predict races and climb the leaderboard. You start with 1,000 Pit Coins."}
          </p>

          <div className="mt-5 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
            <Segmented value={mode} onChange={setMode} options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
          </div>

          {googleAvailable && (
            <>
              <a
                href={`/api/auth/google?next=${encodeURIComponent(mode === "signup" ? "/profile?welcome=1" : next)}`}
                className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface-2 py-2.5 text-sm font-semibold hover:bg-surface-3"
              >
                <GoogleIcon /> Continue with Google
              </a>
              <div className="my-4 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            </>
          )}

          <form onSubmit={submit} className={googleAvailable ? "space-y-3" : "mt-5 space-y-3"}>
            {mode === "signup" && <Field label="Display name" value={name} onChange={setName} autoComplete="nickname" placeholder="e.g. PapayaPilot" />}
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete={mode === "signin" ? "current-password" : "new-password"} hint={mode === "signup" ? "At least 8 characters" : undefined} />
            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 font-semibold text-accent-ink disabled:opacity-60">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-faint">Pit Coins are just for fun: they can&apos;t be bought, sold or cashed out.</p>
    </div>
  );
}

function Field({ label, hint, onChange, ...input }: { label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input {...input} onChange={(e) => onChange(e.target.value)} required className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 outline-none focus:border-accent" />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
