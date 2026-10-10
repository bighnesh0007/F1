"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Trophy, UserCheck, UserPlus } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { ShareButton } from "@/components/play/Social";
import { useApi } from "@/lib/useApi";
import { readableInk } from "@/lib/settings";
import { teamById } from "@/lib/teams";
import type { Badge } from "@/lib/types-user";
import { Card, ErrorNote, Skeleton, cn } from "@/components/ui";
import { Avatar, Points } from "./Avatar";

type PublicProfile = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  profile: { team: string | null; driverName: string | null; country: string | null; fanSince: number | null; bio: string | null; quizResult: string | null };
  stats: { picks: number; correct: number };
  points: number;
  joined: string;
  badges: Badge[];
  followers: number;
  following: number;
  viewerFollows: boolean;
  isMe: boolean;
  streak: number;
  fantasy: number;
};

export function PublicProfileView() {
  const { handle } = useParams<{ handle: string }>();
  const [version, setVersion] = useState(0);
  const { data, error } = useApi<PublicProfile>(`/api/users/${handle}?v=${version}`, { keepPrevious: true });
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const toggleFollow = async () => {
    if (!data) return;
    setBusy(true);
    setFollowError(null);
    try {
      await api(`/api/users/${data.handle}/follow`, { method: data.viewerFollows ? "DELETE" : "POST" });
      setVersion((v) => v + 1);
    } catch (err) {
      setFollowError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
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
          <div className="rounded-2xl bg-surface/90 px-4 py-2.5 shadow-card"><Points value={data.points} className="text-xl" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 bg-surface/90 px-6 py-3 text-sm">
          <span><b className="tnum">{data.followers}</b> <span className="text-muted">followers</span></span>
          <span><b className="tnum">{data.following}</b> <span className="text-muted">following</span></span>
          {data.streak > 0 && <span title="Race weekends in a row with a prediction">🔥 <b>{data.streak}</b> <span className="text-muted">weekend streak</span></span>}
          {data.fantasy > 0 && <span><b className="tnum">{data.fantasy}</b> <span className="text-muted">fantasy points</span></span>}
          <span className="ml-auto flex items-center gap-2">
            <ShareButton url={`/u/${data.handle}`} title={`${data.displayName} on F1 Live`} label="Share profile" />
            {user && !data.isMe && (
              <button
                onClick={toggleFollow}
                disabled={busy}
                className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold", data.viewerFollows ? "border border-line text-muted hover:text-ink" : "bg-accent text-accent-ink")}
              >
                {data.viewerFollows ? <UserCheck size={15} /> : <UserPlus size={15} />} {data.viewerFollows ? "Following" : "Follow"}
              </button>
            )}
          </span>
          {followError && <p className="w-full text-xs text-bad">{followError}</p>}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="About">
          {data.profile.bio ? <p className="text-sm">{data.profile.bio}</p> : <p className="text-sm text-muted">No bio yet.</p>}
          <dl className="mt-3 space-y-1 text-sm">
            {data.profile.driverName && <div className="flex justify-between"><dt className="text-muted">Favourite driver</dt><dd className="font-medium">{data.profile.driverName}</dd></div>}
            {quiz && <div className="flex justify-between"><dt className="text-muted">Quiz says</dt><dd className="font-medium">{quiz.tribe}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Predictions</dt><dd className="font-medium">{data.stats.correct}/{data.stats.picks} correct</dd></div>
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
