"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, CalendarPlus, ChevronDown, ChevronUp, Flag, Gauge, Sparkles, Timer, TrendingUp, Wrench, Zap } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useYearParam, yearQuery } from "@/lib/useYear";
import { useNow } from "@/lib/useNow";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { countryFlag, dateRange } from "@/lib/format";
import { downloadWeekendIcs } from "@/lib/ics";
import type { Race, RaceDetail, Result } from "@/lib/types";
import { Card, Countdown, ErrorNote, Skeleton, Spoiler, TeamBar, cn } from "@/components/ui";
import { CircuitGuide } from "./CircuitGuide";
import { SessionList } from "./SessionList";
import { Podium } from "./Podium";

export function RoundView() {
  const { round } = useParams<{ round: string }>();
  const year = useYearParam();
  const now = useNow(60_000);
  const { data: races, error } = useApi<Race[]>(`/api/schedule${yearQuery(year)}`);
  const race = races?.find((r) => r.round === Number(round));
  const done = race && now != null && Date.parse(race.date) + 2.5 * 3600_000 < now;

  if (error && !races) return <ErrorNote message={error} />;
  if (!races) return <Skeleton className="h-96 rounded-3xl" />;
  if (!race) return <p className="text-muted">Round not found.</p>;

  const nextSession = now != null ? race.sessions.find((s) => Date.parse(s.start) > now) : null;

  return (
    <div className="space-y-4">
      <Link href={`/schedule${yearQuery(year)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft size={15} /> {race.season} calendar
      </Link>

      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--accent),transparent_55%)] opacity-[0.12]" />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Flag size={14} className="text-accent" /> Round {race.round} · {race.season}
            {race.sprint && <span className="flex items-center gap-0.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px]"><Zap size={11} />Sprint weekend</span>}
          </p>
          <h1 className="mt-1 font-display text-3xl leading-tight font-bold sm:text-5xl">
            <span className="mr-2">{countryFlag(race.circuit.country)}</span>
            {race.name}
          </h1>
          <p className="mt-1 text-muted">
            {race.circuit.name} · {now ? dateRange(race.sessions[0]?.start ?? race.date, race.date) : ""}
          </p>
          {nextSession && (
            <div className="mt-5">
              <p className="mb-2 text-sm"><span className="font-medium text-accent">Up next:</span> {nextSession.name}</p>
              <Countdown to={nextSession.start} />
            </div>
          )}
        </div>
      </section>

      {done && <RaceSummary season={race.season} round={race.round} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card title="Sessions" right={!done ? (
          <button onClick={() => downloadWeekendIcs(race)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
            <CalendarPlus size={14} /> Add to calendar
          </button>
        ) : null}>
          <SessionList sessions={race.sessions} />
        </Card>
        <CircuitGuide circuit={race.circuit} />
      </div>
    </div>
  );
}

function RaceSummary({ season, round }: { season: number; round: number }) {
  const { data, error } = useApi<RaceDetail>(`/api/race/${season}/${round}`);
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  if (!data.results.length) return <Card><p className="text-muted">Results aren&apos;t published yet. Check back shortly.</p></Card>;
  return (
    <Spoiler label="Race result hidden" className="py-16">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Card title="Podium" icon={<Sparkles size={15} />}>
            <Podium results={data.results} />
          </Card>
          <KeyMoments race={data} />
        </div>
        <PositionChart race={data} />
        <div className={cn("grid gap-4", data.pitStops.length > 0 && "xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
          <ResultsTable results={data.results} />
          <PitStops race={data} />
        </div>
      </div>
    </Spoiler>
  );
}

function KeyMoments({ race }: { race: RaceDetail }) {
  const r = race.results;
  const fastest = r.find((x) => x.fastestLap?.rank === 1);
  const finishers = r.filter((x) => x.grid > 0);
  const climber = [...finishers].sort((a, b) => b.grid - b.position - (a.grid - a.position))[0];
  const dnfs = r.filter((x) => !/finished|lap/i.test(x.status));
  const quickestStop = [...race.pitStops].filter((p) => Number(p.duration) > 0).sort((a, b) => Number(a.duration) - Number(b.duration))[0];
  const nameOf = (id: string) => r.find((x) => x.driver.id === id)?.driver.name ?? id;

  // Lead changes from lap-by-lap positions.
  const leaders: string[] = [];
  const laps = Math.max(0, ...Object.values(race.positions).map((p) => p.length));
  for (let lap = 0; lap < laps; lap++) {
    const leader = Object.entries(race.positions).find(([, p]) => p[lap] === 1)?.[0];
    if (leader && leaders.at(-1) !== leader) leaders.push(leader);
  }

  const items = [
    { icon: <Flag size={15} />, label: "Winner", value: r[0].driver.name, sub: `${r[0].team}${r[0].time ? ` · ${r[0].time}` : ""}${r[0].grid ? ` · from P${r[0].grid}` : ""}` },
    fastest && { icon: <Timer size={15} />, label: "Fastest lap", value: fastest.fastestLap!.time, sub: `${fastest.driver.name} · lap ${fastest.fastestLap!.lap}` },
    climber && climber.grid - climber.position > 0 && { icon: <TrendingUp size={15} />, label: "Biggest climber", value: `+${climber.grid - climber.position} places`, sub: `${climber.driver.name}, P${climber.grid} → P${climber.position}` },
    leaders.length > 1 && { icon: <Gauge size={15} />, label: "Lead changes", value: String(leaders.length - 1), sub: `${new Set(leaders).size} different leaders` },
    quickestStop && { icon: <Wrench size={15} />, label: "Quickest pit stop", value: `${Number(quickestStop.duration).toFixed(1)}s`, sub: `${nameOf(quickestStop.driverId)} · lap ${quickestStop.lap} (time in pit lane)` },
    { icon: <Zap size={15} />, label: "Did not finish", value: String(dnfs.length), sub: dnfs.slice(0, 3).map((d) => `${d.driver.code} (${d.status})`).join(", ") || "Everyone made it" },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string; sub: string }[];

  return (
    <Card title="Key moments" icon={<Sparkles size={15} />}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><span className="text-accent">{it.icon}</span>{it.label}</p>
            <p className="font-display text-lg leading-tight font-bold">{it.value}</p>
            <p className="truncate text-xs text-muted">{it.sub}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function useResultColours(results: Result[]) {
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  return useMemo(() => {
    const seen = new Map<string, number>();
    const out: Record<string, { colour: string; dash?: string }> = {};
    for (const r of results) {
      const colour = byCode(r.driver.code)?.colour ?? teamColour(r.team);
      const n = seen.get(r.teamId) ?? 0;
      seen.set(r.teamId, n + 1);
      out[r.driver.id] = { colour: `#${colour}`, dash: n > 0 ? "5 4" : undefined };
    }
    return out;
  }, [results, byCode, teamColour]);
}

function PositionChart({ race }: { race: RaceDetail }) {
  const { byCode } = useDrivers();
  const { settings } = useSettings();
  const styles = useResultColours(race.results);
  const favourite = race.results.find((r) => byCode(r.driver.code)?.number === settings.favouriteDriver)?.driver.id;
  const defaults = [...new Set([...(favourite ? [favourite] : []), ...race.results.slice(0, 3).map((r) => r.driver.id)])];
  const [picked, setPicked] = useState<string[] | null>(null);
  const highlighted = picked ?? defaults;

  const ids = Object.keys(race.positions);
  const laps = Math.max(0, ...ids.map((id) => race.positions[id].length));
  const data = useMemo(() => {
    const rows: Record<string, number | null>[] = [];
    const grid = Object.fromEntries(race.results.map((r) => [r.driver.id, r.grid || null]));
    rows.push({ lap: 0, ...grid });
    for (let lap = 1; lap <= laps; lap++) {
      const row: Record<string, number | null> = { lap };
      for (const id of ids) row[id] = race.positions[id][lap - 1] ?? null;
      rows.push(row);
    }
    return rows;
  }, [race, ids, laps]);

  if (laps < 2) return null;
  const code = (id: string) => race.results.find((r) => r.driver.id === id)?.driver.code ?? id;
  const toggle = (id: string) => setPicked(highlighted.includes(id) ? highlighted.filter((x) => x !== id) : [...highlighted, id].slice(-5));
  const ordered = race.results.map((r) => r.driver.id).filter((id) => ids.includes(id));

  return (
    <Card title="Position changes, lap by lap" icon={<TrendingUp size={15} />}>
      <div className="scroll-thin -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {ordered.map((id) => {
          const on = highlighted.includes(id);
          return (
            <button key={id} onClick={() => toggle(id)} aria-pressed={on} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-xs font-bold", on ? "border-transparent bg-surface-3" : "border-line text-faint")}>
              <span className="h-2 w-2 rounded-full" style={{ background: on ? styles[id]?.colour : "var(--border-strong)" }} />
              {code(id)}
            </button>
          );
        })}
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="lap" stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => (v === 0 ? "Grid" : v)} />
            <YAxis reversed domain={[1, "dataMax"]} allowDecimals={false} stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `P${v}`} width={44} interval={0} ticks={[1, 5, 10, 15, 20]} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card">
                    <p className="mb-1 font-semibold">{label === 0 ? "Grid" : `Lap ${label}`}</p>
                    {payload
                      .filter((p) => highlighted.includes(String(p.dataKey)) && p.value != null)
                      .sort((a, b) => Number(a.value) - Number(b.value))
                      .map((p) => (
                        <p key={String(p.dataKey)} className="flex gap-2"><span className="w-6 tnum text-muted">P{p.value}</span><b className="font-display">{code(String(p.dataKey))}</b></p>
                      ))}
                  </div>
                ) : null
              }
            />
            {ids.filter((id) => !highlighted.includes(id)).map((id) => (
              <Line key={id} dataKey={id} stroke="var(--border-strong)" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
            ))}
            {highlighted.filter((id) => ids.includes(id)).map((id) => (
              <Line key={id} dataKey={id} stroke={styles[id]?.colour} strokeDasharray={styles[id]?.dash} strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-faint">Pick drivers above to highlight them. Dashed lines are the second driver of a team.</p>
    </Card>
  );
}

function ResultsTable({ results }: { results: Result[] }) {
  const styles = useResultColours(results);
  return (
    <Card title="Classification" bodyClassName="px-2 pb-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-faint">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Pos</th>
              <th className="px-2 py-1.5 font-semibold">Driver</th>
              <th className="px-2 py-1.5 text-right font-semibold">Grid</th>
              <th className="px-2 py-1.5 text-right font-semibold">Time / status</th>
              <th className="px-2 py-1.5 text-right font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const delta = r.grid ? r.grid - r.position : 0;
              return (
                <tr key={r.driver.id} className="border-t border-line">
                  <td className="px-2 py-1.5 font-display font-bold">{r.positionText}</td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <TeamBar colour={styles[r.driver.id]?.colour.slice(1)} />
                      <span className="font-medium">{r.driver.name}</span>
                      <span className="hidden truncate text-xs text-muted sm:inline">{r.team}</span>
                    </span>
                  </td>
                  <td className="tnum px-2 py-1.5 text-right">
                    <span className="inline-flex items-center gap-1">
                      {r.grid || "Pit"}
                      {delta !== 0 && (
                        <span className={cn("flex items-center text-xs", delta > 0 ? "text-good" : "text-bad")}>
                          {delta > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{Math.abs(delta)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="tnum px-2 py-1.5 text-right text-muted">{r.time ?? r.status}</td>
                  <td className="tnum px-2 py-1.5 text-right font-semibold">{r.points || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PitStops({ race }: { race: RaceDetail }) {
  const styles = useResultColours(race.results);
  const laps = Math.max(1, ...Object.values(race.positions).map((p) => p.length));
  if (!race.pitStops.length) return null;
  const byDriver = race.results.map((r) => ({ r, stops: race.pitStops.filter((p) => p.driverId === r.driver.id) }));
  return (
    <Card title="Pit stops" icon={<Wrench size={15} />}>
      <div className="space-y-1.5">
        {byDriver.map(({ r, stops }) => (
          <div key={r.driver.id} className="grid grid-cols-[44px_1fr_20px] items-center gap-2">
            <span className="font-display text-xs font-bold">{r.driver.code}</span>
            <div className="relative h-4 rounded-full bg-surface-2">
              {stops.map((s) => (
                <span
                  key={s.stop}
                  title={`Stop ${s.stop} · lap ${s.lap} · ${s.duration}s in the pit lane`}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                  style={{ left: `${(s.lap / laps) * 100}%`, background: styles[r.driver.id]?.colour }}
                />
              ))}
            </div>
            <span className="tnum text-right text-xs text-muted">{stops.length}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint"><span>Lap 1</span><span>Lap {laps}</span></div>
    </Card>
  );
}
