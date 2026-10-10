"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Flag, History, Map as MapIcon, MessageCircle, Radio, Timer, Trophy, Tv } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useSettings } from "@/lib/settings";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { useMedia } from "@/lib/useMedia";
import { isRaceSession, list, sessionIsActive } from "@/lib/live";
import { countryFlag, localDay, localTime } from "@/lib/format";
import type { Weekend } from "@/lib/types";
import { Card, Countdown, Segmented, Skeleton, cn } from "@/components/ui";
import { SessionBar } from "@/components/live/SessionBar";
import { TimingTower, useTowerRows } from "@/components/live/TimingTower";
import { LiveTrackMap } from "@/components/live/LiveTrackMap";
import { BattlesPanel, WeatherPanel } from "@/components/live/SidePanels";
import dynamic from "next/dynamic";
import { LatestMessageBanner, RaceControlList, useRaceControl } from "./RaceControl";
import { RadioPlayer } from "./RadioPlayer";
import { PopOutButton } from "./PopOut";
import { Chat } from "./Chat";
import { LivePolls } from "./LivePolls";
import { useWatchedCheckIn } from "./checkin";
import { DriverFocus } from "./DriverFocus";
import { LiveChampionship, PitStops } from "./PitsAndTitle";

// Charts in the driver sheet load when it is first opened.
const Insights = dynamic(() => import("@/components/live/Insights").then((m) => m.Insights));
const DriverSheet = dynamic(() => import("@/components/live/DriverSheet").then((m) => m.DriverSheet));

type SideTab = "control" | "radio" | "chat" | "pits" | "title";
type MobileTab = "track" | "timing" | "driver" | "charts" | "control" | "radio" | "chat";

// A full view of one live session: big map, timing, race control, team radio, a
// driver to follow, pit stops and the live championship.
export function RaceCentre() {
  const { topics, connection } = useLive();
  const { settings } = useSettings();
  const rows = useTowerRows();
  const [picked, setPicked] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [side, setSide] = useState<SideTab>("control");
  const [mobile, setMobile] = useState<MobileTab>("track");
  const messages = useRaceControl();
  const radioCount = list(topics.TeamRadio?.Captures).length;
  const wide = useMedia("(min-width: 1280px)");
  useWatchedCheckIn(sessionIsActive(topics, connection) ? topics.SessionInfo?.Path : null);

  if (!connection) return <CentreSkeleton />;
  if (!sessionIsActive(topics, connection)) return <NotLive />;

  const race = isRaceSession(topics);
  // Follow the driver you picked, else your favourite, else the leader.
  const focus = picked ?? (cleared ? null : (settings.favouriteDriver ?? rows[0]?.number ?? null));
  const select = (n: string) => {
    setPicked(n);
    setCleared(false);
    if (mobile === "track" || mobile === "timing") setMobile("driver");
  };
  const show = (t: MobileTab) => (mobile === t ? "" : "max-lg:hidden");
  const sideTabs = [
    { value: "control" as const, label: `Control${messages.length ? ` ${messages.length}` : ""}` },
    { value: "radio" as const, label: `Radio${radioCount ? ` ${radioCount}` : ""}` },
    { value: "chat" as const, label: "Chat" },
    { value: "pits" as const, label: "Pits" },
    ...(race ? [{ value: "title" as const, label: "Title" }] : []),
  ];
  const sideTab = side === "title" && !race ? "control" : side;

  const sidePanel = (
    <Card
      title={{ control: "Race control", radio: "Team radio", chat: "Chat", pits: "Pit stops", title: "Live championship" }[sideTab]}
      icon={{ control: <Flag size={15} />, radio: <Radio size={15} />, chat: <MessageCircle size={15} />, pits: <Timer size={15} />, title: <Trophy size={15} /> }[sideTab]}
    >
      <div className="mb-3 max-lg:hidden [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented size="sm" value={sideTab} onChange={setSide} options={sideTabs} />
      </div>
      <div className="scroll-thin -mr-2 max-h-[min(70vh,720px)] overflow-y-auto pr-2">
        {sideTab === "control" && <RaceControlList focus={focus} />}
        {sideTab === "radio" && <RadioPlayer focus={focus} />}
        {sideTab === "chat" && <Chat />}
        {sideTab === "pits" && <PitStops focus={focus} />}
        {sideTab === "title" && <LiveChampionship />}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <SessionBar
        action={
          <div className="flex flex-wrap gap-2">
            <PopOutButton />
            <Link href="/live/tv" className="hidden items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink md:flex">
              <Tv size={14} /> TV mode
            </Link>
            <Link href="/" className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
              <ArrowLeft size={14} /> Overview
            </Link>
          </div>
        }
      />

      <div className="scroll-thin -mx-1 overflow-x-auto px-1 lg:hidden [&>div]:flex [&>div]:min-w-full [&_button]:flex-1 [&_button]:px-2.5 [&_button]:whitespace-nowrap">
        <Segmented
          value={mobile}
          onChange={(t) => {
            setMobile(t);
            if (t === "control" || t === "radio" || t === "chat") setSide(t);
          }}
          options={[
            { value: "track", label: "Track" },
            { value: "timing", label: "Timing" },
            { value: "driver", label: "Driver" },
            { value: "charts", label: "Charts" },
            { value: "control", label: "Control" },
            { value: "radio", label: "Radio" },
            { value: "chat", label: "Chat" },
          ]}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(340px,390px)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,390px)_minmax(0,1fr)_minmax(340px,390px)]">
        <div className={cn("lg:sticky lg:top-20", show("timing"))}>
          <TimingTower onSelect={select} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className={show("track")}>
            <LiveTrackMap onSelect={select} focus={focus} mapClassName="aspect-[4/3] lg:aspect-[16/10]" overlay={<LatestMessageBanner />} />
          </div>
          <div className={show("driver")}>
            <DriverFocus
              number={focus}
              onProfile={setProfile}
              onClear={() => {
                setPicked(null);
                setCleared(true);
              }}
            />
          </div>
          <div className={show("track")}>
            <LivePolls />
          </div>
          <div className={show("charts")}>
            <Insights focus={focus} />
          </div>
          {/* The side panel is mounted once (chat and radio keep one connection/player). */}
          {!wide && <div className={cn(mobile === "control" || mobile === "radio" || mobile === "chat" ? "" : "max-lg:hidden")}>{sidePanel}</div>}
          <div className="grid gap-4 max-lg:hidden md:grid-cols-2">
            <BattlesPanel onSelect={select} />
            <WeatherPanel />
          </div>
        </div>

        {wide && <div className="space-y-4 xl:sticky xl:top-20">{sidePanel}</div>}
      </div>

      <DriverSheet number={profile} onClose={() => setProfile(null)} />
    </div>
  );
}

function NotLive() {
  const { data } = useApi<Weekend>("/api/weekend");
  const now = useNow(30_000);
  const race = data?.current;
  const next = now == null ? null : race?.sessions.find((s) => Date.parse(s.start) > now) ?? null;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <Radio size={26} />
          </span>
          <h1 className="font-display text-2xl font-bold">No session is live right now</h1>
          <p className="max-w-md text-muted">
            The race centre fills with the live map, race control, team radio and timing as soon as a session starts. This page switches over by itself.
          </p>
          {race && next && (
            <div className="mt-2 w-full rounded-2xl bg-surface-2 p-4">
              <p className="text-sm font-medium">
                {countryFlag(race.circuit.country)} {race.name} · <span className="text-accent">{next.name}</span>
              </p>
              <p className="mb-3 text-xs text-muted">
                {localDay(next.start)}, {localTime(next.start)}
              </p>
              <Countdown to={next.start} />
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/" className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
              <MapIcon size={15} /> This weekend
            </Link>
            <Link href="/replay" className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
              <History size={15} /> Watch a replay
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CentreSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    </div>
  );
}
