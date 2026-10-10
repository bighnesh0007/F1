"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Radio, Volume2 } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { list, LIVETIMING_STATIC } from "@/lib/live";
import { localTime } from "@/lib/format";
import { Headshot, TeamBar, cn } from "@/components/ui";

type Capture = { Utc?: string; RacingNumber?: string; Path?: string };

const AUTO_KEY = "f1.radioAutoplay";

// The auto-play choice is remembered on this device.
const autoListeners = new Set<() => void>();
function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
function writeAuto(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {}
  autoListeners.forEach((l) => l());
}
function subscribeAuto(listener: () => void) {
  autoListeners.add(listener);
  return () => {
    autoListeners.delete(listener);
  };
}

// Team radio as a player: one clip at a time, with an option to play new clips as
// they come in (queued if one is already playing).
export function RadioPlayer({ focus }: { focus: string | null }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const path = topics.SessionInfo?.Path as string | undefined;
  const transcripts: Record<string, string> = topics.RadioTranscripts ?? {};
  const captures = list<Capture>(topics.TeamRadio?.Captures).filter((c) => c.Path);
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Capture | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [played, setPlayed] = useState<Set<string>>(() => new Set());
  const auto = useSyncExternalStore(subscribeAuto, readAuto, () => false);
  const [onlyFocus, setOnlyFocus] = useState(false);
  const [failed, setFailed] = useState(false);
  const queue = useRef<Capture[]>([]);
  const seen = useRef<string | null>(null);

  const play = (c: Capture) => {
    if (!path || !audio.current) return;
    setFailed(false);
    setCurrent(c);
    setProgress(0);
    setPlayed((prev) => new Set(prev).add(c.Path!));
    audio.current.src = `${LIVETIMING_STATIC}${path}${c.Path}`;
    audio.current.play().catch(() => setPlaying(false));
  };
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  // Newest clip; anything newer than what we've seen is "new radio".
  const newest = captures.at(-1);
  useEffect(() => {
    if (!newest?.Path) return;
    if (seen.current == null) {
      seen.current = newest.Path; // clips from before the page opened aren't auto-played
      return;
    }
    if (newest.Path === seen.current) return;
    seen.current = newest.Path;
    if (!auto) return;
    if (onlyFocus && focus && newest.RacingNumber !== focus) return;
    if (audio.current && !audio.current.paused) queue.current.push(newest);
    else playRef.current(newest);
  }, [newest, auto, onlyFocus, focus]);

  const toggleAuto = () => writeAuto(!auto);

  const shown = captures.filter((c) => !onlyFocus || !focus || c.RacingNumber === focus).reverse();
  const d = current ? get(current.RacingNumber) : null;

  return (
    <div className="space-y-3">
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
          const next = queue.current.shift();
          if (next) playRef.current(next);
        }}
      />

      <div className="relative overflow-hidden rounded-2xl border border-line p-3" style={d ? { background: `linear-gradient(135deg, #${d.colour}33, transparent 75%)` } : undefined}>
        {current && d ? (
          <div className="flex items-center gap-3">
            <Headshot src={d.headshot} colour={d.colour} size={52} alt={d.tla} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">
                {playing ? <><Volume2 size={11} className="text-accent" /> Now playing</> : "Last played"}
              </p>
              <p className="truncate font-display text-lg leading-tight font-bold">{d.fullName}</p>
              <p className="text-xs text-muted">{d.team} · {localTime(current.Utc, { second: "2-digit" })}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progress * 100}%`, background: `#${d.colour}` }} />
              </div>
              {transcripts[current.Path!] && <p className="mt-2 text-sm leading-snug italic">&ldquo;{transcripts[current.Path!]}&rdquo;</p>}
              {failed && <p className="mt-1 text-xs text-bad">This clip couldn&apos;t be loaded.</p>}
            </div>
            <button
              onClick={() => (playing ? audio.current?.pause() : audio.current?.play().catch(() => {}))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-card"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 py-2 text-sm text-muted">
            <Radio size={16} className="text-faint" /> Pick a clip below, or turn on auto-play to hear new radio as it happens.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Toggle on={auto} onClick={toggleAuto}>Auto-play new radio</Toggle>
        {focus && (
          <Toggle on={onlyFocus} onClick={() => setOnlyFocus((v) => !v)}>
            Only {get(focus).tla}
          </Toggle>
        )}
      </div>

      {!path || shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No team radio yet.</p>
      ) : (
        <ul className="space-y-1">
          {shown.slice(0, 80).map((c) => {
            const driver = get(c.RacingNumber);
            const active = current?.Path === c.Path;
            return (
              <li key={c.Path}>
                <button
                  onClick={() => (active && playing ? audio.current?.pause() : play(c))}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2", active && "bg-surface-2 ring-1 ring-accent/50")}
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", active && playing ? "bg-accent text-accent-ink" : "bg-surface-3 text-muted")}>
                    {active && playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                  </span>
                  <TeamBar colour={driver.colour} className="h-5" />
                  <span className="min-w-0 flex-1">
                    <span className="font-display font-bold">{driver.tla}</span>
                    <span className="ml-2 text-sm text-muted">{driver.fullName}</span>
                    {transcripts[c.Path!] && <span className="mt-0.5 block text-xs leading-snug text-muted italic">&ldquo;{transcripts[c.Path!]}&rdquo;</span>}
                  </span>
                  {!played.has(c.Path!) && <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Not played yet" />}
                  <span className="tnum text-xs text-faint">{localTime(c.Utc, { second: "2-digit" })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink")}
    >
      <span className={cn("h-3.5 w-6 rounded-full p-0.5 transition-colors", on ? "bg-accent" : "bg-surface-3")}>
        <span className={cn("block h-2.5 w-2.5 rounded-full bg-white transition-transform", on && "translate-x-2.5")} />
      </span>
      {children}
    </button>
  );
}
