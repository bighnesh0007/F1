"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, History, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { useSettings } from "@/lib/settings";
import { countryFlag, localDay } from "@/lib/format";
import { TRACK_STATUS } from "@/lib/live";
import type { ArchivedSession, CircuitMap, Replay } from "@/lib/types";
import { CarDot, CircuitMapView } from "@/components/track/CircuitMapView";
import { Card, Empty, ErrorNote, Segmented, Skeleton, TeamBar, cn } from "@/components/ui";

const SPEEDS = [1, 5, 15, 30, 60];

export function ReplayView() {
  const now = useNow(3600_000);
  const thisYear = now ? new Date(now).getFullYear() : null;
  const [year, setYear] = useState<number | null>(null);
  const season = year ?? thisYear;
  const { data: sessions, error } = useApi<ArchivedSession[]>(season ? `/api/replay/sessions?year=${season}` : null);
  const [path, setPath] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ArchivedSession[]>();
    for (const s of sessions ?? []) map.set(s.meeting, [...(map.get(s.meeting) ?? []), s]);
    return [...map.entries()];
  }, [sessions]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Replay</h1>
          <p className="text-sm text-muted">Watch any finished session again, with every car on the map.</p>
        </div>
        {thisYear && (
          <select value={season ?? ""} onChange={(e) => { setYear(Number(e.target.value)); setPath(null); }} className="rounded-xl border border-line bg-surface px-3 py-2 font-display font-bold outline-none">
            {Array.from({ length: thisYear - 2017 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {path ? (
        <Player path={path} onBack={() => setPath(null)} />
      ) : error && !sessions ? (
        <ErrorNote message={error} />
      ) : !sessions ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      ) : grouped.length === 0 ? (
        <Card><Empty icon={<History size={28} />} title="No finished sessions yet this season">Pick an earlier season above.</Empty></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {grouped.map(([meeting, list]) => (
            <Card key={meeting}>
              <p className="font-display text-lg font-bold"><span className="mr-1.5">{countryFlag(list[0].country)}</span>{meeting}</p>
              <p className="mb-3 text-xs text-muted">{list[0].location} · {now ? localDay(list[0].start) : ""}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.slice().reverse().map((s) => (
                  <button
                    key={s.path}
                    onClick={() => setPath(s.path)}
                    className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-2", s.type === "Race" ? "border-accent/60" : "border-line")}
                  >
                    <Play size={12} className="text-accent" /> {s.name}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Player({ path, onBack }: { path: string; onBack: () => void }) {
  const { data: replay, error } = useApi<Replay>(`/api/replay?path=${encodeURIComponent(path)}`);
  const { data: map } = useApi<CircuitMap>(replay?.circuitKey ? `/api/circuit-map?key=${replay.circuitKey}&locality=${encodeURIComponent(replay.location ?? "")}` : null);
  const { settings } = useSettings();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const last = useRef<number | null>(null);
  const tRef = useRef(0);
  const seek = (value: number) => {
    tRef.current = value;
    setT(value);
  };
  const duration = replay ? (replay.frames.length - 1) * replay.stepMs : 0;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (ts: number) => {
      if (last.current != null) {
        const next = Math.min(tRef.current + (ts - last.current) * speed, duration);
        tRef.current = next;
        setT(next);
        if (next >= duration) {
          setPlaying(false);
          return;
        }
      }
      last.current = ts;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      last.current = null;
    };
  }, [playing, speed, duration]);

  // The outline map only matches F1 coordinates when it comes from MultiViewer;
  // otherwise trace the track from the replay's own car positions.
  const displayMap = useMemo<CircuitMap | null>(() => {
    if (!replay) return null;
    if (map?.source === "multiviewer") return map;
    return traceFromFrames(replay);
  }, [map, replay]);

  if (error && !replay) return <ErrorNote message={error} />;
  if (!replay) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-10 text-muted"><Loader2 className="animate-spin" size={18} /> Loading the session. Big races can take a few seconds…</div>
      </Card>
    );
  }

  const i = Math.min(Math.floor(t / replay.stepMs), replay.frames.length - 1);
  const k = (t % replay.stepMs) / replay.stepMs;
  const frame = replay.frames[i];
  const nextFrame = replay.frames[Math.min(i + 1, replay.frames.length - 1)];
  const order = orderAt(replay, t);
  const lap = [...replay.laps].reverse().find(([lt]) => lt <= t);
  const status = [...replay.trackStatus].reverse().find(([st]) => st <= t);
  const messages = replay.raceControl.filter((m) => m.t <= t).slice(-4).reverse();
  const track = status ? TRACK_STATUS[status[1]] : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← All sessions</button>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title={`${replay.meeting} · ${replay.session}`}
          icon={<History size={15} />}
          right={
            <div className="flex items-center gap-2 text-xs">
              {lap && <span className="rounded-lg bg-surface-2 px-2 py-1 font-semibold">Lap {lap[1]}{lap[2] ? `/${lap[2]}` : ""}</span>}
              {track && track.tone !== "green" && <span className="rounded-lg bg-yellow-400 px-2 py-1 font-bold text-black uppercase">{track.label}</span>}
            </div>
          }
          bodyClassName="px-2 pb-3"
        >
          {displayMap ? (
            <CircuitMapView map={displayMap} className="aspect-[4/3] w-full" showCorners={displayMap.source === "multiviewer"}>
              {(trk) =>
                replay.drivers.map((d, idx) => {
                  const x0 = frame[idx * 2];
                  const y0 = frame[idx * 2 + 1];
                  if (x0 == null || y0 == null) return null;
                  const x1 = nextFrame[idx * 2] ?? x0;
                  const y1 = nextFrame[idx * 2 + 1] ?? y0;
                  const p = trk.toScreen(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
                  const out = order.get(d.number) === 0;
                  if (out) return null;
                  return <CarDot key={d.number} car={{ number: d.number, tla: d.tla, colour: d.teamColour ?? "888888", x: p.x, y: p.y, highlight: settings.favouriteDriver === d.number }} size={trk.size} />;
                })
              }
            </CircuitMapView>
          ) : (
            <Skeleton className="aspect-[4/3]" />
          )}

          <div className="mt-2 space-y-3 px-2">
            <Timeline replay={replay} t={t} duration={duration} onSeek={seek} />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  if (t >= duration) seek(0);
                  setPlaying(!playing);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink shadow-card"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              <button onClick={() => seek(0)} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Restart"><RotateCcw size={16} /></button>
              <span className="tnum text-sm text-muted">{clock(t)} / {clock(duration)}</span>
              <div className="ml-auto">
                <Segmented size="sm" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))} />
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Running order">
            <ol className="space-y-0.5">
              {replay.drivers
                .filter((d) => order.get(d.number))
                .sort((a, b) => order.get(a.number)! - order.get(b.number)!)
                .map((d) => (
                  <li key={d.number} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-sm", settings.favouriteDriver === d.number && "bg-surface-2 ring-1 ring-accent/50")}>
                    <span className="w-6 text-center font-display font-bold">{order.get(d.number)}</span>
                    <TeamBar colour={d.teamColour} />
                    <span className="font-display font-bold">{d.tla}</span>
                    <span className="truncate text-xs text-muted">{d.team}</span>
                  </li>
                ))}
            </ol>
          </Card>
          <Card title="Race control" icon={<Flag size={15} />}>
            {messages.length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : (
              <ul className="space-y-2 text-sm">
                {messages.map((m, idx) => (
                  <li key={idx}>
                    <p className="text-xs text-faint">{clock(m.t)}{m.lap ? ` · Lap ${m.lap}` : ""}</p>
                    <p>{m.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Timeline({ replay, t, duration, onSeek }: { replay: Replay; t: number; duration: number; onSeek: (t: number) => void }) {
  // Coloured bands for safety cars and red flags along the scrubber.
  const bands = useMemo(() => {
    const out: { from: number; to: number; tone: string }[] = [];
    replay.trackStatus.forEach(([st, status], idx) => {
      const tone = TRACK_STATUS[status]?.tone;
      if (tone === "sc" || tone === "red") out.push({ from: st, to: replay.trackStatus[idx + 1]?.[0] ?? duration, tone });
    });
    return out;
  }, [replay, duration]);
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3">
        {bands.map((b, i) => (
          <span key={i} className={cn("absolute inset-y-0", b.tone === "red" ? "bg-red-500" : "bg-yellow-400")} style={{ left: `${(b.from / duration) * 100}%`, width: `${((b.to - b.from) / duration) * 100}%` }} />
        ))}
        <span className="absolute inset-y-0 left-0 bg-accent/70" style={{ width: `${(t / duration) * 100}%` }} />
      </div>
      <input type="range" min={0} max={duration} step={1000} value={t} onChange={(e) => onSeek(Number(e.target.value))} className="relative w-full cursor-pointer opacity-0" aria-label="Seek" />
    </div>
  );
}

function orderAt(replay: Replay, t: number) {
  const positions = new Map<string, number>();
  for (const [ot, n, pos] of replay.order) {
    if (ot > t) break;
    positions.set(n, pos);
  }
  return positions;
}

function traceFromFrames(replay: Replay): CircuitMap | null {
  // Find one clean, closed lap in some car's path: it returns to its starting point
  // after 50–200 samples, without big jumps (garage) or a detour that is too short.
  let best: number[][] | null = null;
  let bestScore = Infinity;
  replay.drivers.forEach((_, idx) => {
    const pts = replay.frames.map((f) => [f[idx * 2], f[idx * 2 + 1]]).filter(([x, y]) => x != null && y != null) as number[][];
    for (let i = 0; i + 50 < pts.length; i += 15) {
      let length = 0;
      let maxStep = 0;
      for (let j = i + 1; j < Math.min(pts.length, i + 200); j++) {
        const step = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        length += step;
        maxStep = Math.max(maxStep, step);
        if (j - i < 50) continue;
        const gap = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
        if (gap < 600 && length > 20_000) {
          // Smooth laps have small maximum steps relative to their length.
          const score = maxStep / length + gap / length;
          if (score < bestScore) {
            bestScore = score;
            best = pts.slice(i, j + 1);
          }
          break;
        }
      }
    }
  });
  const lap = best as number[][] | null;
  if (!lap) return null;
  return { source: "outline", name: replay.meeting, x: lap.map((p) => p[0]), y: lap.map((p) => p[1]), time: null, rotation: 0, startsAtFinish: false, corners: [] };
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
