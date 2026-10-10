"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { nationalityFlag, ordinal } from "@/lib/format";
import type { DriverCareer } from "@/lib/types";
import { Card, ErrorNote, Headshot, Skeleton, TeamBar, cn } from "@/components/ui";
import { BarsBySeason } from "./BarsBySeason";
import { TeamNews } from "@/components/news/NewsView";

export function DriverPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<DriverCareer>(`/api/driver/${id}`);
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const now = useNow(3600_000);
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const d = data.driver;
  const live = byCode(d.code);
  const colour = live?.colour ?? teamColour(data.seasons[0]?.teams.at(-1));
  const t = data.totals;
  const age = d.dateOfBirth && now != null ? Math.floor((now - Date.parse(d.dateOfBirth)) / (365.25 * 86400_000)) : null;
  const tiles: [string, string | number][] = [
    ["Titles", t.titles],
    ["Wins", t.wins],
    ["Podiums", t.podiums],
    ["Poles", t.poles],
    ["Races", t.races],
    ["Points", t.points.toLocaleString()],
    ["Seasons", t.seasons],
    ["Retirements", t.dnfs],
  ];

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card" style={{ background: `linear-gradient(120deg, #${colour}40, var(--surface) 60%)` }}>
        <div className="flex flex-wrap items-end gap-5">
          <Headshot src={live?.headshot} colour={colour} size={104} alt={d.name} />
          <div className="min-w-0 flex-1">
            {d.number && <p className="font-display text-4xl leading-none font-bold" style={{ color: `#${colour}` }}>{d.number}</p>}
            <h1 className="font-display text-4xl font-bold">{d.name}</h1>
            <p className="text-muted">
              {nationalityFlag(d.nationality)} {d.nationality}
              {age ? ` · ${age} years old` : ""}
              {data.seasons[0] ? ` · ${data.seasons[0].teams.join(" / ")} (${data.seasons[0].season})` : ""}
            </p>
          </div>
          {t.titles > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-surface/80 px-4 py-2 shadow-card">
              <Trophy size={18} className="text-yellow" />
              <span className="font-display text-lg font-bold">{t.titles}× World Champion</span>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-card">
            <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
            <p className="tnum font-display text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Points by season">
            <BarsBySeason data={data.seasons.map((s) => ({ season: s.season, value: s.points }))} label="Points" />
            {t.titleYears.length > 0 && <p className="mt-3 text-sm text-muted">Champion in {t.titleYears.join(", ")}.</p>}
            <p className="mt-1 text-sm text-muted">
              {t.firstRace && <>First race: {t.firstRace.season} {t.firstRace.name}. </>}
              {t.firstWin && <>First win: {t.firstWin.season} {t.firstWin.name}.</>}
            </p>
          </Card>
          <Card title="Season by season">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold tracking-wider text-faint uppercase">
                    <th className="py-1.5">Season</th>
                    <th>Team</th>
                    <th className="text-right">Races</th>
                    <th className="text-right">Wins</th>
                    <th className="text-right">Podiums</th>
                    <th className="text-right">Best</th>
                    <th className="text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data.seasons.map((s) => (
                    <tr key={s.season} className={cn("border-t border-line", t.titleYears.includes(s.season) && "bg-yellow/10")}>
                      <td className="py-1.5 font-semibold">
                        {s.season} {t.titleYears.includes(s.season) && <Trophy size={12} className="inline text-yellow" />}
                      </td>
                      <td className="truncate text-muted">{s.teams.join(" / ")}</td>
                      <td className="tnum text-right">{s.races}</td>
                      <td className="tnum text-right">{s.wins}</td>
                      <td className="tnum text-right">{s.podiums}</td>
                      <td className="tnum text-right">{s.best ? ordinal(s.best) : "–"}</td>
                      <td className="tnum text-right font-semibold">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Latest races">
            <ul className="space-y-1">
              {data.recent.map((r) => (
                <li key={`${r.season}-${r.round}`}>
                  <Link href={`/schedule/${r.round}?year=${r.season}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className={cn("w-9 text-center font-display font-bold", r.position <= 3 && "text-accent")}>{/^\d+$/.test(r.positionText) ? `P${r.positionText}` : r.positionText}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.season} {r.name.replace(" Grand Prix", " GP")}</span>
                      <span className="block text-xs text-muted">{r.grid ? `from P${r.grid}` : "from the pit lane"} · {/finished|lap/i.test(r.status) ? `${r.points} pts` : r.status}</span>
                    </span>
                    <TeamBar colour={teamColour(r.team)} className="h-5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <TeamNews query={d.name.split(" ").at(-1) ?? d.name} title={`News about ${d.name}`} />
        </div>
      </div>
    </div>
  );
}
