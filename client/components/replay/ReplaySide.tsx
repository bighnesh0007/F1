"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Pause, Play } from "lucide-react";
import { LIVETIMING_STATIC } from "@/lib/live";
import type { Replay } from "@/lib/types";
import { Card, Segmented, TeamBar, cn } from "@/components/ui";
import { flagSwatch } from "@/components/centre/RaceControl";
import { SpeedTraps } from "@/components/live/SpeedTraps";
import { PracticeBoard, QualiBoard, RaceBoard } from "./Boards";
import type { Board, SessionKind } from "./board";

type Tab = "order" | "speed" | "radio" | "control";

// Team radio in a replay: clips play by themselves as the replay reaches them
// (at up to 5× speed, so they don't pile up), or on demand.
export function useReplayRadio(replay: Replay, t: number, running: boolean, speed: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const lastT = useRef(t);

  const play = (clip: string) => {
    if (!audio.current) {
      const el = new Audio();
      el.preload = "none";
      el.onplay = () => setCurrent(el.dataset.clip ?? null);
      el.onpause = () => setCurrent(null);
      el.onended = () => setCurrent(null);
      audio.current = el;
    }
    const el = audio.current;
    if (el.dataset.clip === clip && !el.paused) return el.pause();
    el.dataset.clip = clip;
    el.src = `${LIVETIMING_STATIC}${replay.path}${clip}`;
    el.play().catch(() => {});
  };
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  useEffect(() => {
    const prev = lastT.current;
    lastT.current = t;
    if (!auto || !running || speed > 5 || t < prev || t - prev > 5000) return;
    const clip = replay.radio?.find(([ct]) => ct > prev && ct <= t);
    if (clip && audio.current?.paused !== false) playRef.current(clip[2]);
  }, [t, auto, running, speed, replay.radio]);

  useEffect(() => () => audio.current?.pause(), []);

  return { current, play, auto, setAuto };
}

export function ReplaySide({
  replay,
  board,
  t,
  kind,
  part,
  focus,
  onPick,
  radio,
  speed,
  clock,
}: {
  replay: Replay;
  board: Board;
  t: number;
  kind: SessionKind;
  part: number;
  focus: string | null;
  onPick: (n: string) => void;
  radio: ReturnType<typeof useReplayRadio>;
  speed: number;
  clock: (ms: number) => string;
}) {
  const [tab, setTab] = useState<Tab>("order");
  const clips = (replay.radio ?? []).filter(([ct]) => ct <= t);
  const messages = replay.raceControl.filter((m) => m.t <= t);
  const racing = kind === "race" || kind === "sprint";
  const driver = (n: string) => replay.drivers.find((d) => d.number === n);

  return (
    <Card bodyClassName="px-3 pb-3 pt-3">
      <div className="mb-3 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "order", label: racing ? "Order" : kind === "practice" ? "Laps" : "Times" },
            { value: "speed", label: "Speed" },
            { value: "radio", label: `Radio${clips.length ? ` ${clips.length}` : ""}` },
            { value: "control", label: `Control${messages.length ? ` ${messages.length}` : ""}` },
          ]}
        />
      </div>
      <div className="scroll-thin -mr-2 max-h-[min(72vh,780px)] overflow-y-auto pr-2">
        {tab === "order" &&
          (racing ? (
            <RaceBoard replay={replay} board={board} focus={focus} onFocus={onPick} />
          ) : kind === "practice" ? (
            <PracticeBoard replay={replay} board={board} focus={focus} onFocus={onPick} />
          ) : (
            <QualiBoard replay={replay} board={board} focus={focus} onFocus={onPick} part={part} kind={kind} />
          ))}

        {tab === "speed" && (
          <SpeedTraps
            focus={focus}
            onSelect={onPick}
            rows={replay.drivers.map((d) => ({ number: d.number, tla: d.tla, team: d.team, colour: d.teamColour, speeds: { st: board[d.number]?.st, fl: board[d.number]?.fl, i1: board[d.number]?.i1, i2: board[d.number]?.i2 } }))}
          />
        )}

        {tab === "radio" && (
          <div>
            <button
              onClick={() => radio.setAuto(!radio.auto)}
              aria-pressed={radio.auto}
              className={cn("mb-1 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold", radio.auto ? "border-accent/60 bg-accent/10" : "border-line text-muted")}
            >
              <span className={cn("h-3.5 w-6 shrink-0 rounded-full p-0.5", radio.auto ? "bg-accent" : "bg-surface-3")}>
                <span className={cn("block h-2.5 w-2.5 rounded-full bg-white transition-transform", radio.auto && "translate-x-2.5")} />
              </span>
              Play radio as it happens
            </button>
            <p className="mb-2 px-1 text-[11px] text-muted">{speed > 5 ? "Plays at 5× speed or slower." : "Clips play when the replay reaches them."}</p>
            {clips.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No team radio yet.</p>
            ) : (
              <ul className="space-y-1">
                {clips
                  .slice()
                  .reverse()
                  .map(([ct, n, clip]) => {
                    const d = driver(n);
                    const on = radio.current === clip;
                    return (
                      <li key={clip}>
                        <button onClick={() => radio.play(clip)} className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2", (on || focus === n) && "bg-surface-2", on && "ring-1 ring-accent/60")}>
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", on ? "bg-accent text-accent-ink" : "bg-surface-3")}>
                            {on ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                          </span>
                          <TeamBar colour={d?.teamColour} className="h-5" />
                          <span className="min-w-0 flex-1">
                            <span className="font-display font-bold">{d?.tla ?? n}</span>
                            <span className="ml-2 text-xs text-muted">{d?.team}</span>
                          </span>
                          <span className="tnum text-xs text-faint">{clock(ct)}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        )}

        {tab === "control" &&
          (messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No messages yet.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {messages
                .slice()
                .reverse()
                .map((m, idx) => {
                  const swatch = flagSwatch({ Flag: m.flag ?? undefined, Category: m.category, Message: m.message });
                  return (
                    <li key={idx} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-4 w-6 shrink-0 items-center justify-center rounded border border-line" style={swatch ? { background: swatch.bg } : undefined} title={swatch?.label}>
                        {!swatch && <Flag size={10} className="text-faint" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-faint">{clock(m.t)}{m.lap ? ` · Lap ${m.lap}` : ""}</p>
                        <p className="leading-snug">{m.message}</p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          ))}
      </div>
    </Card>
  );
}

