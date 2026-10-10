"use client";

import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { readableInk } from "@/lib/settings";
import { teamById } from "@/lib/teams";
import type { Badge } from "@/lib/types-user";
import { Card, ErrorNote, Skeleton, cn } from "@/components/ui";
import { Avatar, Coins } from "./Avatar";

type PublicProfile = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  profile: { team: string | null; driverName: string | null; country: string | null; fanSince: number | null; bio: string | null; quizResult: string | null };
  stats: { bets: number; won: number; profit: number };
  coins: number;
  joined: string;
  badges: Badge[];
};

export function PublicProfileView() {
  const { handle } = useParams<{ handle: string }>();
  const { data, error } = useApi<PublicProfile>(`/api/users/${handle}`);
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-72 rounded-3xl" />;
  const team = teamById(data.profile.team);
  const quiz = teamById(data.profile.quizResult);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="overflow-hidden rounded-3xl border border-line shadow-card" style={{ background: team ? `linear-gradient(120deg, #${team.colour}, #${team.colour}55 55%, var(--surface))` : "var(--surface)" }}>
        <div className="flex flex-wrap items-end gap-4 p-6">
          <Avatar name={data.displayName} src={data.avatarUrl} team={data.profile.team} size={88} className="ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            {team && <p className="text-sm font-semibold opacity-90" style={{ color: readableInk(`#${team.colour}`) }}>{team.tribe} · {team.name}</p>}
            <h1 className="truncate font-display text-4xl font-bold" style={team ? { color: readableInk(`#${team.colour}`) } : undefined}>{data.displayName}</h1>
            <p className={cn("text-sm", team ? "opacity-75" : "text-muted")} style={team ? { color: readableInk(`#${team.colour}`) } : undefined}>
              @{data.handle}
              {data.profile.country ? ` · ${data.profile.country}` : ""}
              {data.profile.fanSince ? ` · fan since ${data.profile.fanSince}` : ""}
            </p>
          </div>
          <div className="rounded-2xl bg-surface/90 px-4 py-2.5 shadow-card"><Coins value={data.coins} className="text-xl" /></div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="About">
          {data.profile.bio ? <p className="text-sm">{data.profile.bio}</p> : <p className="text-sm text-muted">No bio yet.</p>}
          <dl className="mt-3 space-y-1 text-sm">
            {data.profile.driverName && <div className="flex justify-between"><dt className="text-muted">Favourite driver</dt><dd className="font-medium">{data.profile.driverName}</dd></div>}
            {quiz && <div className="flex justify-between"><dt className="text-muted">Quiz says</dt><dd className="font-medium">{quiz.tribe}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Predictions</dt><dd className="font-medium">{data.stats.won}/{data.stats.bets} won</dd></div>
          </dl>
        </Card>
        <Card title="Badges" icon={<Trophy size={15} />}>
          <div className="flex flex-wrap gap-1.5">
            {data.badges.map((b) => (
              <span key={b.id} title={b.description} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">🏆 {b.title}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
