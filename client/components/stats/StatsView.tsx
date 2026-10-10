"use client";

import { useState } from "react";
import { Award, Crown, Flag, GitCompareArrows, Medal, Timer } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { nationalityFlag } from "@/lib/format";
import type { Records, SeasonSummary } from "@/lib/types";
import { Card, ErrorNote, Segmented, Skeleton } from "@/components/ui";

export function StatsView() {
  const [tab, setTab] = useState<"records" | "compare">("records");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Stats & history</h1>
        <p className="text-sm text-muted">Every world championship race since 1950.</p>
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "records", label: "All-time records" },
          { value: "compare", label: "Compare seasons" },
        ]}
      />
      {tab === "records" ? <RecordsView /> : <CompareView />}
    </div>
  );
}

function RecordsView() {
  const { data, error } = useApi<Records>("/api/records");
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Crunching 75 years of results. The first load takes a few seconds…</p>
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
      </div>
    );
  }
  const lists = [
    { title: "Most race wins", icon: <Flag size={15} />, items: data.wins, note: `${data.totalRaces} races` },
    { title: "Most world titles", icon: <Crown size={15} />, items: data.championships, note: `${data.champions.length} seasons` },
    { title: "Most pole positions", icon: <Medal size={15} />, items: data.poles, note: data.polesSince ? `since ${data.polesSince}` : "" },
    { title: "Most fastest laps", icon: <Timer size={15} />, items: data.fastestLaps, note: data.fastestLapsSince ? `since ${data.fastestLapsSince}` : "" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {lists.map((l) => (
          <Card key={l.title} title={l.title} icon={l.icon} right={<span className="text-xs text-faint">{l.note}</span>}>
            <RankList items={l.items} />
          </Card>
        ))}
      </div>
      <Card title="World champions" icon={<Award size={15} />}>
        <div className="scroll-thin grid max-h-96 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {data.champions.map((c) => (
            <p key={c.season} className="flex items-center gap-2 py-0.5 text-sm">
              <span className="tnum w-10 text-muted">{c.season}</span>
              <span className="font-medium">{c.driver.name}</span>
              <span className="truncate text-xs text-faint">{c.team}</span>
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RankList({ items }: { items: { id: string; name: string; nationality: string; count: number }[] }) {
  const max = items[0]?.count || 1;
  return (
    <ol className="space-y-1.5">
      {items.map((d, i) => (
        <li key={d.id} className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2 text-sm">
          <span className="text-right text-xs text-faint">{i + 1}</span>
          <span className="truncate font-medium">
            {nationalityFlag(d.nationality)} {d.name}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.count / max) * 100}%` }} />
          </span>
          <span className="tnum text-right font-display font-bold">{d.count}</span>
        </li>
      ))}
    </ol>
  );
}

function CompareView() {
  const now = useNow(3600_000);
  const thisYear = now ? new Date(now).getFullYear() : 2026;
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const left = a ?? thisYear - 1;
  const right = b ?? thisYear;
  const years = Array.from({ length: thisYear - 1949 }, (_, i) => thisYear - i);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <GitCompareArrows size={18} className="text-accent" />
          <YearSelect value={left} onChange={setA} years={years} />
          <span className="text-sm text-faint">vs</span>
          <YearSelect value={right} onChange={setB} years={years} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            {[[1988, 2024], [2007, 2021], [2010, 2012], [1976, 2008]].map(([x, y]) => (
              <button key={`${x}-${y}`} onClick={() => { setA(x); setB(y); }} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink">
                {x} vs {y}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <SeasonColumn year={left} />
        <SeasonColumn year={right} />
      </div>
    </div>
  );
}

function YearSelect({ value, onChange, years }: { value: number; onChange: (y: number) => void; years: number[] }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-xl border border-line bg-surface-2 px-3 py-2 font-display text-lg font-bold outline-none">
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

function SeasonColumn({ year }: { year: number }) {
  const { data, error } = useApi<SeasonSummary>(`/api/season-summary/${year}`);
  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <Skeleton className="h-[520px] rounded-2xl" />;
  const maxWins = data.winsByTeam[0]?.count || 1;
  const inProgress = data.completed < data.races;
  return (
    <Card title={`${year}${inProgress ? " (in progress)" : ""}`} icon={<Crown size={15} />}>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={inProgress ? "Leader" : "Champion"} value={data.champion?.driver.name ?? "–"} sub={data.champion ? `${data.champion.points} pts · ${data.champion.team}` : ""} />
        <Tile label={inProgress ? "Leading team" : "Constructors"} value={data.constructorChampion?.team ?? "–"} sub={data.constructorChampion ? `${data.constructorChampion.points} pts` : ""} />
        <Tile label="Races" value={`${data.completed}${inProgress ? ` of ${data.races}` : ""}`} sub="" />
        <Tile label="Different winners" value={String(data.differentWinners)} sub={data.winsByDriver[0] ? `Most: ${data.winsByDriver[0].name} (${data.winsByDriver[0].count})` : ""} />
      </div>
      <h3 className="mt-4 mb-2 text-xs font-semibold text-muted">Wins by team</h3>
      <ul className="space-y-1.5">
        {data.winsByTeam.slice(0, 6).map((t) => (
          <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_24px] items-center gap-2 text-sm">
            <span className="truncate">{t.name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(t.count / maxWins) * 100}%` }} /></span>
            <span className="tnum text-right font-bold">{t.count}</span>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 mb-2 text-xs font-semibold text-muted">Top 5 drivers</h3>
      <ol className="space-y-1 text-sm">
        {data.topDrivers.slice(0, 5).map((d) => (
          <li key={d.driver.id} className="flex gap-2">
            <span className="w-4 text-faint">{d.position}</span>
            <span className="flex-1 truncate">{d.driver.name}</span>
            <span className="tnum font-semibold">{d.points}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      <p className="truncate font-display text-base leading-tight font-bold">{value}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}
