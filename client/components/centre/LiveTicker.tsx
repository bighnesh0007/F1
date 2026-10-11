"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, Flag, Pause, Play, Radio, Timer, Wrench, Zap } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { LIVETIMING_STATIC, TYRES, list, type LiveEvent } from "@/lib/live";
import { localTime } from "@/lib/format";
import { TeamBar, cn } from "@/components/ui";

const SHOWN = new Set(["overtake", "pitIn", "pitOut", "fastestLap", "retired", "radio", "raceControl"]);
// Race control is chatty (track limits, DRS); only the messages that change the race.
const IMPORTANT_RC = /PENALTY|SAFETY CAR|RED FLAG|INVESTIGAT|DISQUALIF|CHEQUERED|STOPPED|RETIRED|CRASH|COLLISION/i;

// A strip under the session bar with everything that just happened: overtakes,
// pit stops, fastest laps, retirements, team radio (play it right there) and the
// race control messages that matter. Newest first; tap a driver to follow them.
export function LiveTicker({ onSelect }: { onSelect: (n: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const { settings } = useSettings();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const path = topics.SessionInfo?.Path as string | undefined;
  const transcripts: Record<string, string> = topics.RadioTranscripts ?? {};

  const events = list<LiveEvent>(topics.Events)
    .filter((e) => SHOWN.has(e.type) && (e.type !== "raceControl" || IMPORTANT_RC.test(e.message ?? "")))
    .slice(-30)
    .reverse();

  const toggle = (clip: string) => {
    const el = audio.current;
    if (!el || !path) return;
    if (playing === clip && !el.paused) return el.pause();
    el.src = `${LIVETIMING_STATIC}${path}${clip}`;
    el.play().then(() => setPlaying(clip)).catch(() => setPlaying(null));
  };

  if (events.length === 0) return null;

  return (
    <div className="relative">
      <audio ref={audio} preload="none" onPause={() => setPlaying(null)} onEnded={() => setPlaying(null)} />
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="log" aria-live="polite" aria-label="Live race ticker">
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const key = `${e.type}-${e.ts}-${e.driver ?? ""}-${e.path ?? e.message ?? ""}`;
            const d = e.driver ? get(e.driver) : null;
            const mine = Boolean(settings.favouriteDriver && (e.driver === settings.favouriteDriver || e.passed === settings.favouriteDriver));
            const item = describe(e, (n) => (n ? get(n).tla : ""));
            const isRadio = e.type === "radio" && e.path;
            const active = isRadio && playing === e.path;
            return (
              <motion.div
                key={key}
                layout={settings.reduceMotion ? false : "position"}
                initial={{ opacity: 0, x: -24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                className={cn(
                  "flex max-w-[300px] min-w-[210px] shrink-0 items-start gap-2.5 rounded-xl border bg-surface px-3 py-2 shadow-card",
                  mine ? "border-accent/70" : "border-line",
                )}
                style={d ? { backgroundImage: `linear-gradient(135deg, #${d.colour}26, transparent 60%)` } : undefined}
              >
                {isRadio ? (
                  <button
                    onClick={() => toggle(e.path!)}
                    aria-label={active ? "Pause team radio" : `Play team radio from ${d?.tla ?? "driver"}`}
                    className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", active ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink hover:bg-accent hover:text-accent-ink")}
                  >
                    {active ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                  </button>
                ) : (
                  <span className={cn("mt-1 shrink-0", item.tone)}>{item.icon}</span>
                )}
                <button onClick={() => e.driver && onSelect(e.driver)} className="min-w-0 flex-1 text-left" disabled={!e.driver}>
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                    {d && <TeamBar colour={d.colour} className="h-3" />}
                    {item.label} · {localTime(e.ts, { second: "2-digit" })}
                  </p>
                  <p className="line-clamp-2 text-sm leading-snug font-semibold">{item.title}</p>
                  {isRadio && transcripts[e.path!] ? (
                    <p className="line-clamp-2 text-xs leading-snug text-muted italic">&ldquo;{transcripts[e.path!]}&rdquo;</p>
                  ) : item.detail ? (
                    <p className="truncate text-xs text-muted">{item.detail}</p>
                  ) : null}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function describe(e: LiveEvent, tla: (n?: string) => string) {
  const lap = e.lap ? `Lap ${e.lap}` : "";
  switch (e.type) {
    case "overtake":
      return { label: "Overtake", icon: <ArrowRightLeft size={15} />, tone: "text-good", title: `${tla(e.driver)} up to P${e.position}`, detail: [`passed ${tla(e.passed)}`, lap].filter(Boolean).join(" · ") };
    case "pitIn":
      return { label: "Pit stop", icon: <Wrench size={15} />, tone: "text-yellow", title: `${tla(e.driver)} into the pits`, detail: [e.position ? `from P${e.position}` : "", lap].filter(Boolean).join(" · ") };
    case "pitOut": {
      const tyre = e.compound ? TYRES[e.compound]?.name ?? e.compound : null;
      const change = e.change ? (e.change > 0 ? `+${e.change}` : `${e.change}`) : null;
      return { label: "Pit exit", icon: <Wrench size={15} />, tone: "text-yellow", title: `${tla(e.driver)} rejoins${e.position ? ` P${e.position}` : ""}`, detail: [tyre && `${e.newTyres ? "New" : "Used"} ${tyre}`, change && `${change} places`].filter(Boolean).join(" · ") };
    }
    case "fastestLap":
      return { label: "Fastest lap", icon: <Timer size={15} />, tone: "text-purple", title: `${tla(e.driver)} ${e.time ?? ""}`, detail: lap };
    case "retired":
      return { label: "Retired", icon: <Zap size={15} />, tone: "text-bad", title: `${tla(e.driver)} is out`, detail: lap };
    case "radio":
      return { label: "Team radio", icon: <Radio size={15} />, tone: "text-blue-500", title: tla(e.driver), detail: "Tap play to listen" };
    default:
      return { label: "Race control", icon: <Flag size={15} />, tone: "text-yellow", title: e.message ?? "", detail: lap };
  }
}
