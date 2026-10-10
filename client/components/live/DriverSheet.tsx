"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Star, Trophy } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { useApi } from "@/lib/useApi";
import { isRaceSession, list, TYRES, type LapEntry } from "@/lib/live";
import { formatLapTime, ordinal, parseLapTime } from "@/lib/format";
import { driverSeason, teammateBattles } from "@/lib/season";
import type { SeasonRound, Standings } from "@/lib/types";
import { Headshot, Sheet, Spoiler, Tyre, cn } from "@/components/ui";

export function DriverSheet({ number, onClose }: { number: string | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(number)} onClose={onClose} title="Driver">
      {number && <DriverCard number={number} />}
    </Sheet>
  );
}

function DriverCard({ number }: { number: string }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const { settings, update } = useSettings();
  const d = get(number);
  const line = topics.TimingData?.Lines?.[number];
  const app = topics.TimingAppData?.Lines?.[number];
  const stints = list<{ Compound?: string; TotalLaps?: number; StartLaps?: number; New?: string | boolean }>(app?.Stints);
  const race = isRaceSession(topics);
  const grid = Number(app?.GridPos) || null;
  const pos = Number(line?.Position) || null;
  const favourite = settings.favouriteDriver === number;

  const laps = useMemo(
    () =>
      Object.values<LapEntry>(topics.LapHistory?.[number] ?? {})
        .filter((l) => l?.lap != null)
        .sort((a, b) => a.lap - b.lap)
        .map((l) => ({ lap: l.lap, time: l.pit ? null : parseLapTime(l.time) })),
    [topics.LapHistory, number],
  );
  const lapTimes = laps.map((l) => l.time).filter((t): t is number => t != null).sort((a, b) => a - b);
  const cutoff = lapTimes.length ? lapTimes[Math.floor(lapTimes.length / 2)] * 1.12 : Infinity;
  const chartLaps = laps.map((l) => ({ ...l, time: l.time != null && l.time <= cutoff ? l.time : null }));

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: `linear-gradient(135deg, #${d.colour}40, transparent 70%)` }}>
        <div className="flex items-end gap-4">
          <Headshot src={d.headshot} colour={d.colour} size={88} alt={d.tla} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-4xl leading-none font-bold" style={{ color: `#${d.colour}` }}>{number}</p>
            <p className="mt-1 font-display text-xl leading-tight font-bold">{d.fullName}</p>
            <p className="text-sm text-muted">{d.team}</p>
          </div>
          <button
            onClick={() => update({ favouriteDriver: favourite ? null : number, favouriteTeamColour: favourite ? null : d.colour })}
            className={cn("rounded-full border p-2.5", favourite ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink")}
            aria-label={favourite ? "Remove favourite" : "Make favourite"}
            title={favourite ? "Your favourite driver" : "Make favourite"}
          >
            <Star size={18} className={favourite ? "fill-current" : ""} />
          </button>
        </div>
      </div>

      {line && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">This session</h3>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Position" value={pos ? ordinal(pos) : "–"} sub={race && grid && pos ? (grid - pos > 0 ? `+${grid - pos} from grid` : grid - pos < 0 ? `${grid - pos} from grid` : "Same as grid") : undefined} />
            <Tile label={race ? "Gap" : "To fastest"} value={line.GapToLeader || line.TimeDiffToFastest || (pos === 1 ? "Leader" : "–")} />
            <Tile label="Interval" value={line.IntervalToPositionAhead?.Value || line.TimeDiffToPositionAhead || "–"} />
            <Tile label="Best lap" value={line.BestLapTime?.Value || "–"} />
            <Tile label="Last lap" value={line.LastLapTime?.Value || "–"} />
            <Tile label="Laps · stops" value={`${line.NumberOfLaps ?? 0} · ${line.NumberOfPitStops ?? 0}`} />
          </div>
        </section>
      )}

      {stints.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">Tyres</h3>
          <div className="flex flex-wrap items-center gap-2">
            {stints.map((s, i) => (
              <span key={i} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-1.5 text-sm">
                <Tyre compound={s.Compound} size={20} />
                <span className="text-muted">
                  {TYRES[s.Compound ?? ""]?.name ?? "?"} · {Math.max((s.TotalLaps ?? 0) - (s.StartLaps ?? 0), 0)} laps{s.New === true || s.New === "true" ? " · new" : ""}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {chartLaps.filter((l) => l.time != null).length >= 2 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">Lap times</h3>
          <div className="h-36">
            <ResponsiveContainer>
              <LineChart data={chartLaps} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <XAxis dataKey="lap" stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                <YAxis stroke="var(--faint)" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={formatLapTime} width={60} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.[0]?.value != null ? (
                      <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs shadow-card">
                        Lap {label}: <b className="tnum">{formatLapTime(Number(payload[0].value))}</b>
                      </div>
                    ) : null
                  }
                />
                <Line dataKey="time" stroke={`#${d.colour}`} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <SeasonSection code={d.tla} />
    </div>
  );
}

function SeasonSection({ code }: { code: string }) {
  const { data: standings } = useApi<Standings>("/api/standings");
  const { data: rounds } = useApi<SeasonRound[]>("/api/season-results");
  const entry = standings?.drivers.find((x) => x.driver.code === code);
  const season = rounds ? driverSeason(rounds, code) : null;
  const battle = rounds ? teammateBattles(rounds).find((b) => b.a.code === code || b.b.code === code) : null;
  if (!entry && !season) return null;
  const mine = battle ? (battle.a.code === code ? 0 : 1) : 0;
  const other = 1 - mine;
  const mate = battle ? (mine === 0 ? battle.b : battle.a) : null;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
        <Trophy size={14} /> {standings?.season ?? ""} season
        {entry && <Link href={`/drivers/${entry.driver.id}`} className="ml-auto text-xs font-semibold text-accent">Career →</Link>}
      </h3>
      <Spoiler label="Season stats hidden">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Championship" value={entry?.position ? ordinal(entry.position) : "–"} sub={entry ? `${entry.points} pts` : undefined} />
          <Tile label="Wins" value={String(season?.wins ?? entry?.wins ?? 0)} sub={season ? `${season.podiums} podiums` : undefined} />
          <Tile label="Poles" value={String(season?.poles ?? 0)} sub={season?.bestFinish ? `Best: ${ordinal(season.bestFinish)}` : undefined} />
        </div>
        {battle && mate && (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <p className="mb-2 text-xs font-semibold text-muted">Teammate battle vs {mate.name}</p>
            {[
              { label: "Races ahead", v: battle.race },
              { label: "Qualifying ahead", v: battle.quali },
              { label: "Points", v: battle.points },
            ].map((row) => {
              const total = row.v[mine] + row.v[other] || 1;
              return (
                <div key={row.label} className="mb-2 last:mb-0">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="tnum font-bold">{row.v[mine]}</span>
                    <span className="text-muted">{row.label}</span>
                    <span className="tnum font-bold">{row.v[other]}</span>
                  </div>
                  <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
                    <div className="rounded-full bg-accent" style={{ width: `${(row.v[mine] / total) * 100}%` }} />
                    <div className="flex-1 rounded-full bg-surface-3" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Spoiler>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      <p className="font-display text-lg leading-tight font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
