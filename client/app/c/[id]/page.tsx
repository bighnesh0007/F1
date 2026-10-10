import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { serverJson } from "@/lib/og";

type Call = { race: string; season: number; market: string; pick: string; earned: number; user: { displayName: string; handle: string } | null };

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await params;
  const call = await serverJson<Call>(`/api/game/calls/${encodeURIComponent(id)}`);
  const title = call ? `${call.user?.displayName ?? "A fan"} called ${call.pick} (+${call.earned} pts)` : "A call on F1 Live";
  return {
    title,
    description: call ? `${call.market} · ${call.season} ${call.race}. Make your own calls on F1 Live.` : undefined,
    openGraph: { title, images: [`/og/call/${id}`] },
    twitter: { card: "summary_large_image", title, images: [`/og/call/${id}`] },
  };
}

// Landing page for a shared call: the card, and a way into the game.
async function SharedCall({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await serverJson<Call>(`/api/game/calls/${encodeURIComponent(id)}`);
  if (!call) return <p className="py-16 text-center text-muted">This call isn&apos;t available.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/og/call/${id}`} alt={`${call.user?.displayName} called ${call.pick}`} className="w-full rounded-2xl border border-line shadow-card" />
      <p className="text-muted">
        {call.user ? <Link href={`/u/${call.user.handle}`} className="font-semibold text-ink hover:underline">{call.user.displayName}</Link> : "A fan"} called {call.pick} ({call.market}, {call.season} {call.race}).
      </p>
      <Link href="/play" className="inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-ink">Make your own calls</Link>
    </div>
  );
}

export default function SharedCallPage(props: PageProps<"/c/[id]">) {
  return (
    <Suspense>
      <SharedCall params={props.params} />
    </Suspense>
  );
}
