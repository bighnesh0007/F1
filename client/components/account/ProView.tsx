"use client";

import { PricingTable } from "@clerk/nextjs";
import { Check, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { Card } from "@/components/ui";

const PERKS = [
  "Ask the AI analyst up to 100 questions an hour (20 on the free plan)",
  "Run up to 50 private leagues (10 free)",
  "A Supporter badge on your profile",
  "Helps keep F1 Live running: no ads, now or later",
];

// F1 Live Pro, sold through Clerk Billing (plans are set up in the Clerk dashboard).
export function ProView() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <p className="flex items-center gap-2 text-sm font-semibold text-accent"><Crown size={16} /> F1 Live Pro</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Support F1 Live, get a little extra</h1>
        <p className="mt-1 text-muted">Everything you use today stays free. Pro adds:</p>
        <ul className="mt-4 space-y-2">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm"><Check size={16} className="mt-0.5 shrink-0 text-good" /> {p}</li>
          ))}
        </ul>
        {user?.pro && <p className="mt-4 rounded-xl bg-good/15 px-3 py-2 text-sm font-semibold text-good">You&apos;re on Pro. Thank you!</p>}
      </section>
      <Card title="Plans">
        {clerkEnabled ? (
          <PricingTable />
        ) : (
          <p className="text-sm text-muted">Subscriptions aren&apos;t set up on this server yet.</p>
        )}
      </Card>
    </div>
  );
}
