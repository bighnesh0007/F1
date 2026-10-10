"use client";

import { CloudRain, Droplets, Thermometer, Timer, Wind, WifiOff } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { TRACK_STATUS } from "@/lib/live";
import { countryFlag, localTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cn } from "@/components/ui";

const TONES = {
  green: "bg-green-600 text-white",
  yellow: "bg-yellow-400 text-black",
  sc: "bg-yellow-400 text-black",
  red: "bg-red-600 text-white",
};

export function SessionBar({ action }: { action?: React.ReactNode }) {
  const { topics, connection, streamOpen, staleSince } = useLive();
  const info = topics.SessionInfo;
  const track = TRACK_STATUS[String(topics.TrackStatus?.Status)];
  const lap = topics.LapCount;
  const weather = topics.WeatherData;
  const raining = Number(weather?.Rainfall) > 0;
  const live = streamOpen && staleSince == null && connection?.status === "connected";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {staleSince != null && (
        <p role="status" className="flex items-center gap-2 border-b border-line bg-yellow/15 px-5 py-1.5 text-xs font-semibold text-ink">
          <WifiOff size={13} /> No connection. Showing the last timing received at {localTime(new Date(staleSince).toISOString(), { second: "2-digit" })}; it updates again once you&apos;re back online.
        </p>
      )}
      <div className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {live ? (
              <span className="flex items-center gap-1.5 text-accent"><span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />Live</span>
            ) : (
              <span>{streamOpen ? "Reconnecting" : "Offline"}</span>
            )}
            <span>·</span>
            <span>{info?.Name}</span>
            {topics.SessionStatus?.Status && topics.SessionStatus.Status !== "Started" && <span className="normal-case">· {statusLabel(topics.SessionStatus.Status)}</span>}
          </div>
          <h1 className="truncate font-display text-2xl leading-tight font-bold">
            <span className="mr-2">{countryFlag(info?.Meeting?.Country?.Name)}</span>
            {info?.Meeting?.Name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {lap?.CurrentLap != null && (
            <Stat label="Lap">
              {lap.CurrentLap}
              {lap.TotalLaps ? <span className="text-muted">/{lap.TotalLaps}</span> : null}
            </Stat>
          )}
          <Clock />
          {track && <span className={cn("rounded-xl px-3 py-2 text-xs font-bold tracking-wide uppercase", TONES[track.tone])}>{track.label}</span>}
          {weather && (
            <div className="hidden items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted lg:flex">
              <span className="flex items-center gap-1"><Thermometer size={13} />Air {weather.AirTemp}°</span>
              <span className="flex items-center gap-1">Track {weather.TrackTemp}°</span>
              <span className="flex items-center gap-1"><Wind size={13} />{weather.WindSpeed} m/s</span>
              {raining ? (
                <span className="flex items-center gap-1 font-semibold text-blue-500"><CloudRain size={13} />Rain</span>
              ) : (
                <span className="flex items-center gap-1"><Droplets size={13} />{weather.Humidity}%</span>
              )}
            </div>
          )}
          {action}
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  return { Inactive: "Not started", Finished: "Finished", Finalised: "Final results", Ends: "Ended", Aborted: "Suspended" }[status] ?? status;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-1.5 text-center">
      <div className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</div>
      <div className="tnum font-display text-lg leading-tight font-bold">{children}</div>
    </div>
  );
}

// ExtrapolatedClock gives the remaining time at a moment; count down from it locally.
function Clock() {
  const { topics, feedNow, staleSince } = useLive();
  const now = useNow(1000);
  const clock = topics.ExtrapolatedClock;
  if (!clock?.Remaining || now == null) return null;
  const [h, m, s] = String(clock.Remaining).split(":").map(Number);
  let remaining = (h * 3600 + m * 60 + s) * 1000;
  // Without a connection the clock is frozen at the last value received.
  if (clock.Extrapolating && clock.Utc && staleSince == null) remaining -= feedNow() - Date.parse(clock.Utc);
  const total = Math.max(0, Math.round(remaining / 1000));
  const text = `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return (
    <Stat label="Remaining">
      <span className="flex items-center gap-1"><Timer size={14} className="text-faint" />{text}</span>
    </Stat>
  );
}
