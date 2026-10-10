"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Share2, UserPlus } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { localDay } from "@/lib/format";
import type { FantasyEntry, FeedItem } from "@/lib/types-user";
import { Card, Empty, Skeleton, cn } from "@/components/ui";
import { Avatar, Points } from "@/components/account/Avatar";

// Shares a link with the phone's share sheet, or copies it.
export async function shareLink(url: string, title: string) {
  const full = new URL(url, window.location.origin).toString();
  if (navigator.share) {
    try {
      await navigator.share({ title, url: full });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard?.writeText(full).catch(() => {});
  return "copied";
}

export function ShareButton({ url, title, label = "Share", className }: { url: string; title: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        const r = await shareLink(url, title);
        if (r !== "cancelled") {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }
      }}
      className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-3 hover:text-ink", className)}
      title="Share a picture card"
    >
      {done ? <Check size={13} className="text-good" /> : <Share2 size={13} />} {done ? "Link ready" : label}
    </button>
  );
}

export function FriendsBoard() {
  const { data, error } = useApi<(FantasyEntry & { correct: number; picks: number; me?: boolean; streak?: number })[]>("/api/friends/leaderboard");
  if (error && !data) return <p className="text-sm text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-40" />;
  if (data.length <= 1)
    return (
      <Empty icon={<UserPlus size={18} />} title="Follow fans to rank against them">
        Open anyone&apos;s profile from the rankings and tap Follow.
      </Empty>
    );
  return (
    <ol className="space-y-1">
      {data.map((e, i) => (
        <li key={e.handle}>
          <Link href={`/u/${e.handle}`} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2", e.me && "bg-surface-2 ring-1 ring-accent/50")}>
            <span className="w-5 text-center font-display font-bold">{i + 1}</span>
            <Avatar name={e.displayName} src={e.avatarUrl} team={e.team} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.me ? "You" : e.displayName}</span>
              <span className="block truncate text-[11px] text-muted">
                {e.correct}/{e.picks} correct{e.streak ? ` · 🔥 ${e.streak}` : ""}
              </span>
            </span>
            <Points value={e.points} className="text-sm" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function FantasyBoard({ season }: { season: number }) {
  const { data, error } = useApi<FantasyEntry[]>(`/api/game/fantasy/leaderboard?season=${season}`);
  if (error && !data) return <p className="text-sm text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No fantasy scores yet">Teams are scored after each race.</Empty>;
  return (
    <ol className="space-y-1">
      {data.slice(0, 25).map((e, i) => (
        <li key={e.handle}>
          <Link href={`/u/${e.handle}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
            <span className="w-5 text-center font-display font-bold">{i + 1}</span>
            <Avatar name={e.displayName} src={e.avatarUrl} team={e.team} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.displayName}</span>
              <span className="block text-[11px] text-muted">{e.rounds} weekends · best {e.best}</span>
            </span>
            <span className="tnum font-display font-bold">{e.points}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function FriendsFeed() {
  const { data } = useApi<FeedItem[]>("/api/friends/feed", { refreshMs: 60_000 });
  if (!data?.length) return null;
  return (
    <Card title="Friends' calls">
      <ul className="scroll-thin -mr-2 max-h-80 space-y-1.5 overflow-y-auto pr-2">
        {data.slice(0, 30).map((f, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2 text-sm">
            <Avatar name={f.user?.displayName ?? "?"} src={f.user?.avatarUrl} team={f.user?.team} size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <Link href={`/u/${f.user?.handle}`} className="font-semibold hover:underline">{f.user?.displayName}</Link> picked <b>{f.pick}</b>
              </p>
              <p className="truncate text-xs text-muted">{f.market} · {f.race.replace(" Grand Prix", " GP")} · {localDay(f.at)}</p>
            </div>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", f.status === "correct" ? "bg-good/15 text-good" : f.status === "wrong" ? "bg-bad/10 text-bad" : "bg-surface-3 text-muted")}>
              {f.status === "correct" ? `+${f.earned}` : f.status === "open" ? "locked" : f.status}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
