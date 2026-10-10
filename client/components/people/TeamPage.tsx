"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useTeamColour } from "@/lib/drivers";
import { nationalityFlag } from "@/lib/format";
import type { Standings, TeamHistory } from "@/lib/types";
import { Card, ErrorNote, Skeleton, Spoiler } from "@/components/ui";
import { BarsBySeason } from "./BarsBySeason";
import { TeamNews } from "@/components/news/NewsView";

export function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<TeamHistory>(`/api/team/${id}`);
  const { data: standings } = useApi<Standings>("/api/standings");
  const teamColour = useTeamColour();
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const t = data.totals;
  const colour = teamColour(data.team.name);
  const drivers = standings?.drivers.filter((d) => d.teamId === data.team.id) ?? [];
  const constructor = standings?.constructors.find((c) => c.teamId === data.team.id);
  const first = t.firstSeason ?? data.winsBySeason[0]?.season ?? 1950;
  const bySeason = new Map(data.winsBySeason.map((w) => [w.season, w.wins]));
  const lastSeason = Math.max(first, ...data.winsBySeason.map((w) => w.season), standings?.season ? Number(standings.season) : first);
  const seasons = Array.from({ length: lastSeason - first + 1 }, (_, i) => ({ season: first + i, value: bySeason.get(first + i) ?? 0 }));

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-line p-6 shadow-card" style={{ background: `linear-gradient(120deg, #${colour}55, var(--surface) 60%)` }}>
        <h1 className="font-display text-4xl font-bold">{data.team.name}</h1>
        <p className="text-muted">
          {nationalityFlag(data.team.nationality)} {data.team.nationality}
          {t.firstSeason ? ` · in F1 since ${t.firstSeason}` : ""}
        </p>
        {t.titles > 0 && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-surface/80 px-4 py-2 font-display text-lg font-bold shadow-card">
            <Trophy size={18} className="text-yellow" /> {t.titles}× Constructors&apos; Champion
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Titles", t.titles],
          ["Wins", t.wins],
          ["Poles", t.poles],
          ["Seasons", t.seasons],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card">
            <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
            <p className="tnum font-display text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Wins by season">
            <BarsBySeason data={seasons} label="Wins" />
            {t.titleYears.length > 0 && <p className="mt-3 text-sm text-muted">Constructors&apos; champion in {t.titleYears.join(", ")}.</p>}
            {t.lastWin && <p className="mt-1 text-sm text-muted">Latest win: {t.lastWin.driver.name}, {t.lastWin.season} {t.lastWin.name}.</p>}
          </Card>
          <Card title="Most wins for the team">
            <ol className="space-y-1">
              {data.topWinners.map((w, i) => (
                <li key={w.id}>
                  <Link href={`/drivers/${w.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className="w-5 text-center font-display font-bold">{i + 1}</span>
                    <span className="flex-1 font-medium">{w.name}</span>
                    <span className="tnum font-display font-bold">{w.count}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          {drivers.length > 0 && (
            <Card title={`${standings?.season ?? ""} season`}>
              <Spoiler label="Standings hidden">
                {constructor && <p className="mb-2 text-sm text-muted">P{constructor.position} in the constructors&apos; championship with {constructor.points} points.</p>}
                <ul className="space-y-1">
                  {drivers.map((d) => (
                    <li key={d.driver.id}>
                      <Link href={`/drivers/${d.driver.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                        <span className="w-8 font-display font-bold">P{d.position}</span>
                        <span className="flex-1 font-medium">{d.driver.name}</span>
                        <span className="tnum text-sm text-muted">{d.points} pts</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Spoiler>
            </Card>
          )}
          <TeamNews query={data.team.name.replace(/ F1 Team$/, "")} title={`News about ${data.team.name}`} />
        </div>
      </div>
    </div>
  );
}
