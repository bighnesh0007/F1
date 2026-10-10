"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bell, BellRing, CalendarPlus, CalendarDays, CloudSun, Flag, Trophy } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useSettings } from "@/lib/settings";
import { useDrivers, useTeamColour } from "@/lib/drivers";
import { downloadWeekendIcs } from "@/lib/ics";
import { countryFlag, dateRange, localDay, localTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import type { RaceDetail, Standings, Weekend } from "@/lib/types";
import { Card, Countdown, ErrorNote, Skeleton, Spoiler, TeamBar } from "@/components/ui";
import { CircuitMapView } from "@/components/track/CircuitMapView";
import { CircuitGuide, useCircuitMap } from "@/components/race/CircuitGuide";
import { SessionList } from "@/components/race/SessionList";
import { Podium } from "@/components/race/Podium";

export function WeekendView() {
  const { data, error } = useApi<Weekend>("/api/weekend", { refreshMs: 10 * 60_000 });
  const now = useNow(30_000);

  if (error && !data) return <ErrorNote message={error} />;
  if (!data) return <WeekendSkeleton />;

  const race = data.current;
  if (!race) {
    return (
      <Card>
        <p className="font-display text-2xl font-bold">The season is over</p>
        <p className="text-muted">See you next year. Meanwhile, relive the races in Replay.</p>
      </Card>
    );
  }

  const nextSession = now == null ? null : race.sessions.find((s) => Date.parse(s.start) > now) ?? null;

  return (
    <div className="space-y-4">
      <Hero race={race} nextSession={nextSession} totalRounds={data.totalRounds} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="space-y-4">
          <Card title="Weekend schedule" icon={<CalendarDays size={15} />} right={<ReminderButton />}>
            <SessionList sessions={race.sessions} />
            <button
              onClick={() => downloadWeekendIcs(race)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              <CalendarPlus size={15} /> Add weekend to calendar
            </button>
          </Card>
          <RadarCard lat={race.circuit.lat} lon={race.circuit.lon} />
        </div>
        <CircuitGuide circuit={race.circuit} circuitKey={race.circuitKey} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.previous && <LastRace season={data.previous.season} round={data.previous.round} />}
        <ChampionshipSnapshot />
      </div>
    </div>
  );
}

function Hero({ race, nextSession, totalRounds }: { race: NonNullable<Weekend["current"]>; nextSession: { name: string; start: string } | null; totalRounds: number }) {
  const { data: map } = useCircuitMap(race.circuit, race.circuitKey);
  const first = race.sessions[0]?.start ?? race.date;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--accent),transparent_55%)] opacity-[0.13]" />
      {map && (
        <div className="pointer-events-none absolute -right-6 -bottom-10 hidden w-[44%] max-w-lg opacity-60 md:block">
          <CircuitMapView map={map} showCorners={false} className="w-full" />
        </div>
      )}
      <div className="relative max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Flag size={14} className="text-accent" /> Round {race.round} of {totalRounds}
          {race.sprint && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Sprint weekend</span>}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight font-bold sm:text-5xl">
          <span className="mr-2">{countryFlag(race.circuit.country)}</span>
          {race.name}
        </h1>
        <p className="mt-1 text-muted">
          {race.circuit.name} · {dateRange(first, race.date)}
        </p>
        {nextSession ? (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">
              <span className="text-accent">Up next:</span> {nextSession.name} · {localDay(nextSession.start)}, {localTime(nextSession.start)}
            </p>
            <Countdown to={nextSession.start} />
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted">This weekend&apos;s sessions are done. Live timing appears here automatically when the next one starts.</p>
        )}
      </div>
    </section>
  );
}

function ReminderButton() {
  const { settings, update } = useSettings();
  const toggle = async () => {
    if (!settings.reminders && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      if ((await Notification.requestPermission()) !== "granted") return;
    }
    update({ reminders: !settings.reminders });
  };
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
      {settings.reminders ? <BellRing size={14} className="text-accent" /> : <Bell size={14} />}
      {settings.reminders ? `${settings.reminderMinutes} min reminders on` : "Remind me"}
    </button>
  );
}

function RadarCard({ lat, lon }: { lat: number; lon: number }) {
  const [show, setShow] = useState(false);
  return (
    <Card title="Weather radar" icon={<CloudSun size={15} />}>
      {show ? (
        <iframe
          title="Rain radar at the circuit"
          className="aspect-video w-full rounded-xl border border-line"
          src={`https://www.rainviewer.com/map.html?loc=${lat},${lon},8&oFa=0&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`}
          loading="lazy"
        />
      ) : (
        <button onClick={() => setShow(true)} className="w-full rounded-xl bg-surface-2 py-6 text-sm font-medium text-muted hover:text-ink">
          Show live rain radar around the circuit
        </button>
      )}
      <p className="mt-2 text-xs text-faint">Radar by RainViewer.</p>
    </Card>
  );
}

function LastRace({ season, round }: { season: number; round: number }) {
  const { data, error } = useApi<RaceDetail>(`/api/race/${season}/${round}`);
  return (
    <Card
      title="Last race"
      icon={<Flag size={15} />}
      right={
        <Link href={`/schedule/${round}?year=${season}`} className="flex items-center gap-1 text-xs font-semibold text-accent">
          Full summary <ArrowRight size={13} />
        </Link>
      }
    >
      {error && !data ? (
        <ErrorNote message={error} />
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <p className="mb-3 font-display text-lg font-bold">
            {countryFlag(data.circuit.country)} {data.name}
          </p>
          <Spoiler label="Podium hidden">
            <Podium results={data.results} />
          </Spoiler>
        </>
      )}
    </Card>
  );
}

function ChampionshipSnapshot() {
  const { data, error } = useApi<Standings>("/api/standings");
  const { byCode } = useDrivers();
  const teamColour = useTeamColour();
  const leader = data?.drivers[0]?.points ?? 0;
  return (
    <Card
      title={`Championship${data?.round ? ` after round ${data.round}` : ""}`}
      icon={<Trophy size={15} />}
      right={
        <Link href="/standings" className="flex items-center gap-1 text-xs font-semibold text-accent">
          All standings <ArrowRight size={13} />
        </Link>
      }
    >
      {error && !data ? (
        <ErrorNote message={error} />
      ) : !data ? (
        <Skeleton className="h-40" />
      ) : (
        <Spoiler label="Standings hidden">
          <ol className="space-y-1">
            {data.drivers.slice(0, 5).map((d) => (
              <li key={d.driver.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                <span className="w-5 text-center font-display font-bold">{d.position}</span>
                <TeamBar colour={byCode(d.driver.code)?.colour ?? teamColour(d.team)} className="h-5" />
                <span className="flex-1 font-medium">{d.driver.name}</span>
                <span className="text-xs text-faint">{d.position === 1 ? "" : `−${leader - d.points}`}</span>
                <span className="tnum w-12 text-right font-display font-bold">{d.points}</span>
              </li>
            ))}
          </ol>
        </Spoiler>
      )}
    </Card>
  );
}

function WeekendSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
