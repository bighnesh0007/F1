"use client";

import { useState } from "react";
import { Check, Loader2, Lock, Star, Users } from "lucide-react";
import { api, useAuth } from "@/lib/auth";
import { clerkEnabled } from "@/lib/clerk";
import { useApi } from "@/lib/useApi";
import { useTeamColour } from "@/lib/drivers";
import { useNow } from "@/lib/useNow";
import type { FantasyHistory, FantasyMarket } from "@/lib/types-user";
import { Card, Countdown, Skeleton, TeamBar, cn } from "@/components/ui";
import { SignInCta } from "@/components/account/ClerkControls";

const DRIVERS = 5;
const TEAMS = 2;

export function FantasyView({ season, round }: { season: number; round: number }) {
  const [version, setVersion] = useState(0);
  const { data, error } = useApi<FantasyMarket>(`/api/game/fantasy/${season}/${round}?v=${version}`, { keepPrevious: true });
  const { user } = useAuth();
  if (error && !data) return <Card><p className="text-sm text-muted">{error}</p></Card>;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <Builder key={`${data.season}:${data.round}`} market={data} onSaved={() => setVersion((v) => v + 1)} />
      {user && <FantasyHistoryCard version={version} />}
    </div>
  );
}

function Builder({ market, onSaved }: { market: FantasyMarket; onSaved: () => void }) {
  const { user } = useAuth();
  const now = useNow(30_000);
  const teamColour = useTeamColour();
  const [drivers, setDrivers] = useState<string[]>(market.myTeam?.drivers ?? []);
  const [teams, setTeams] = useState<string[]>(market.myTeam?.constructors ?? []);
  const [captain, setCaptain] = useState<string | null>(market.myTeam?.captain ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const locked = now != null && now >= Date.parse(market.lockAt);
  const price = (id: string) => market.drivers.find((d) => d.id === id)?.price ?? market.constructors.find((c) => c.id === id)?.price ?? 0;
  const cost = Math.round([...drivers, ...teams].reduce((s, id) => s + price(id), 0) * 10) / 10;
  const left = Math.round((market.budget - cost) * 10) / 10;
  const complete = drivers.length === DRIVERS && teams.length === TEAMS && captain != null && left >= 0;
  const scored = market.myTeam?.status === "scored";

  const toggleDriver = (id: string) => {
    setMessage(null);
    if (drivers.includes(id)) {
      setDrivers(drivers.filter((x) => x !== id));
      if (captain === id) setCaptain(null);
    } else if (drivers.length < DRIVERS) {
      setDrivers([...drivers, id]);
      if (!captain) setCaptain(id);
    }
  };
  const toggleTeam = (id: string) => {
    setMessage(null);
    setTeams(teams.includes(id) ? teams.filter((x) => x !== id) : teams.length < TEAMS ? [...teams, id] : teams);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api(`/api/game/fantasy/${market.season}/${market.round}`, { method: "PUT", body: { drivers, constructors: teams, captain } });
      setMessage({ ok: true, text: "Team saved. You can change it until qualifying starts." });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">Fantasy · Round {market.round}</p>
            <p className="font-display text-2xl font-bold">{market.name}</p>
            <p className="text-sm text-muted">Pick {DRIVERS} drivers and {TEAMS} teams within {market.budget.toFixed(1)}. Your captain scores double.</p>
          </div>
          <div className="text-right">
            {locked ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-muted"><Lock size={14} /> Locked</p>
            ) : (
              <>
                <p className="text-xs text-muted">Locks at qualifying</p>
                <Countdown to={market.lockAt} compact />
              </>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-semibold">
            <span>Spent {cost.toFixed(1)}</span>
            <span className={left < 0 ? "text-bad" : "text-muted"}>{left < 0 ? `${(-left).toFixed(1)} over budget` : `${left.toFixed(1)} left`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cn("h-full rounded-full transition-[width]", left < 0 ? "bg-bad" : "bg-accent")} style={{ width: `${Math.min(100, (cost / market.budget) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {drivers.length}/{DRIVERS} drivers · {teams.length}/{TEAMS} teams{captain ? "" : " · tap ★ to pick a captain"}
          </p>
        </div>
        {scored && market.myTeam?.score != null && (
          <p className="mt-3 rounded-xl bg-good/15 px-3 py-2 text-sm font-semibold text-good">This team scored {market.myTeam.score} points.</p>
        )}
        {message && <p role="status" className={cn("mt-3 rounded-xl px-3 py-2 text-sm", message.ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}>{message.text}</p>}
        {!locked && (
          user ? (
            <button
              onClick={save}
              disabled={!complete || saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-40"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save team
            </button>
          ) : (
            <div className="mt-4">{clerkEnabled ? <SignInCta /> : <p className="text-sm text-muted">Sign-in isn&apos;t set up on this server yet.</p>}</div>
          )
        )}
      </Card>

      <Card title="Drivers" icon={<Users size={15} />}>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {market.drivers.map((d) => {
            const on = drivers.includes(d.id);
            const full = !on && drivers.length >= DRIVERS;
            const points = market.myTeam?.breakdown?.[d.id];
            return (
              <li key={d.id} className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-2", on ? "border-accent bg-accent/10" : "border-line")}>
                <button disabled={locked || full} onClick={() => toggleDriver(d.id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-40">
                  <TeamBar colour={teamColour(d.team)} className="h-6" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{d.name}</span>
                    <span className="block truncate text-xs text-muted">{d.team}</span>
                  </span>
                </button>
                {points != null && on && <span className="tnum text-xs font-bold text-good">{points > 0 ? `+${points}` : points}</span>}
                {on && (
                  <button disabled={locked} onClick={() => setCaptain(d.id)} aria-label={`Make ${d.name} captain`} title="Captain scores double" className={cn("rounded-lg p-1", captain === d.id ? "text-yellow" : "text-faint hover:text-muted")}>
                    <Star size={16} className={captain === d.id ? "fill-current" : ""} />
                  </button>
                )}
                <span className="tnum w-10 text-right font-display text-sm font-bold">{d.price.toFixed(1)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Teams" icon={<Users size={15} />}>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {market.constructors.map((c) => {
            const on = teams.includes(c.id);
            const full = !on && teams.length >= TEAMS;
            return (
              <li key={c.id}>
                <button
                  disabled={locked || full}
                  onClick={() => toggleTeam(c.id)}
                  aria-pressed={on}
                  className={cn("flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left disabled:opacity-40", on ? "border-accent bg-accent/10" : "border-line")}
                >
                  <TeamBar colour={teamColour(c.name)} className="h-6" />
                  <span className="flex-1 text-sm font-semibold">{c.name}</span>
                  {on && market.myTeam?.breakdown?.[c.id] != null && <span className="tnum text-xs font-bold text-good">+{market.myTeam.breakdown[c.id]}</span>}
                  <span className="tnum font-display text-sm font-bold">{c.price.toFixed(1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Scoring: championship points from the race and sprint, +1 per place gained from the grid (up to +10, down to −5), −5 for not finishing. Teams score their drivers&apos; championship points. Prices follow the standings.
        </p>
      </Card>
    </>
  );
}

function FantasyHistoryCard({ version }: { version: number }) {
  const { data } = useApi<FantasyHistory[]>(`/api/game/fantasy/history?v=${version}`);
  const scored = (data ?? []).filter((t) => t.status === "scored");
  if (!scored.length) return null;
  return (
    <Card title="Your fantasy weekends">
      <ul className="space-y-1">
        {scored.map((t) => (
          <li key={`${t.season}-${t.round}`} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
            <span>
              {t.season} · Round {t.round}
              {t.carried && <span className="ml-2 text-xs text-muted">(carried over)</span>}
            </span>
            <span className="tnum font-display font-bold">{t.score}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
