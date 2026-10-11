"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Pause, Play, RotateCcw, Swords } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { useSettings } from "@/lib/settings";
import { countryFlag, localDay, parseLapTime } from "@/lib/format";
import { TRACK_STATUS } from "@/lib/live";
import type { ArchivedSession, CircuitMap, LapTelemetry, Replay } from "@/lib/types";
import { buildTrack } from "@/lib/track";
import { CompareView } from "@/components/centre/ComparePanel";
import { Card, Empty, ErrorNote, Segmented, Skeleton, cn } from "@/components/ui";
import { boardAt, buildCheckpoints, compareCar, kindOf, lapHistory, lastBefore, remainingAt, retirements } from "./board";
import { QualiCompare } from "./QualiCompare";
import { ReplayMap } from "./ReplayMap";
import { ReplaySide, useReplayRadio } from "./ReplaySide";
import { Timeline } from "./Timeline";
import { DriverPanel } from "./DriverPanel";

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
  const [focus, setFocus] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [lapChoice, setLapChoice] = useState<number | "fastest">("fastest");
  const [vs, setVs] = useState<string>("fastest");
  // A tap on a car or a row follows that driver, or in compare mode picks it (two at most).
  const pick = (n: string) => {
    if (compareMode) setCompare((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].slice(-2)));
    else {
      setFocus((f) => (f === n ? null : n));
      setLapChoice("fastest");
    }
  };
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
  const track = useMemo(() => (displayMap ? buildTrack(displayMap) : null), [displayMap]);
  const checkpoints = useMemo(() => (replay?.timing ? buildCheckpoints(replay) : null), [replay]);
  const history = useMemo(() => (replay?.timing ? lapHistory(replay) : {}), [replay]);
  const outAt = useMemo(() => (replay?.timing ? retirements(replay) : new Map<string, number>()), [replay]);
  const radio = useReplayRadio(replay ?? EMPTY_REPLAY, t, playing, speed);

  // The lap shown in the driver panel, and the lap it is compared with. Only laps
  // completed by this point of the replay count, so nothing is given away early.
  const panelDriver = compareMode ? compare[0] ?? null : focus;
  const lapsSoFar = (n: string | null) => (n ? (history[n] ?? []).filter((h) => h.t <= t).map((h) => h.entry) : []);
  const fastestOf = (n: string | null) => {
    let best: { lap: number; ms: number } | null = null;
    for (const l of lapsSoFar(n)) {
      const ms = l.time ? parseLapTime(l.time) : null;
      if (ms != null && !l.pit && (!best || ms < best.ms)) best = { lap: l.lap, ms };
    }
    return best;
  };
  const lapA = panelDriver ? (lapChoice === "fastest" ? fastestOf(panelDriver)?.lap ?? null : lapChoice) : null;
  const overallFastest = (() => {
    let best: { n: string; lap: number; ms: number } | null = null;
    for (const d of replay?.drivers ?? []) {
      const f = fastestOf(d.number);
      if (f && (!best || f.ms < best.ms)) best = { n: d.number, ...f };
    }
    return best;
  })();
  const vsKey = compareMode && compare[1] ? compare[1] : vs;
  const lapB =
    vsKey === "none" || !panelDriver
      ? null
      : vsKey === "fastest"
        ? overallFastest && !(overallFastest.n === panelDriver && overallFastest.lap === lapA)
          ? { n: overallFastest.n, lap: overallFastest.lap }
          : null
        : fastestOf(vsKey)
          ? { n: vsKey, lap: fastestOf(vsKey)!.lap }
          : null;
  const lapUrl = (n: string | null, lap: number | null) => (replay && n && lap ? `/api/replay/lap?path=${encodeURIComponent(replay.path)}&driver=${n}&lap=${lap}` : null);
  const lapAData = useApi<LapTelemetry>(lapUrl(panelDriver, lapA), { keepPrevious: true });
  const lapBData = useApi<LapTelemetry>(lapUrl(lapB?.n ?? null, lapB?.lap ?? null), { keepPrevious: true });

  if (error && !replay) return <ErrorNote message={error} />;
  if (!replay || !checkpoints) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-10 text-muted"><Loader2 className="animate-spin" size={18} /> Loading the session. Big races can take a few seconds…</div>
      </Card>
    );
  }

  const kind = kindOf(replay);
  const racing = kind === "race" || kind === "sprint";
  const qualifying = kind === "quali" || kind === "sprintQuali";
  const board = boardAt(replay, checkpoints, t);
  const lap = lastBefore(replay.laps, t);
  const status = lastBefore(replay.trackStatus, t);
  const part = lastBefore(replay.parts ?? [], t)?.[1] ?? 1;
  const remaining = racing ? null : remainingAt(replay, t);
  const track_ = status ? TRACK_STATUS[status[1]] : null;
  const comparing = compareMode && compare.length === 2;
  const highlighted = compareMode ? compare : [focus ?? settings.favouriteDriver].filter((n): n is string => !!n && replay.drivers.some((d) => d.number === n));
  const driverOf = (n: string | null) => replay.drivers.find((d) => d.number === n) ?? null;
  const sessionLabel = { race: "Race", sprint: "Sprint", quali: "Qualifying", sprintQuali: "Sprint qualifying", practice: "Practice" }[kind];
  const lapAValid = lapAData.data && lapAData.data.driver === panelDriver && lapAData.data.lap === lapA ? lapAData.data : null;
  const lapBValid = lapB && lapBData.data && lapBData.data.driver === lapB.n && lapBData.data.lap === lapB.lap ? lapBData.data : null;
  const vsOptions = [
    { value: "none", label: "Nothing" },
    { value: "fastest", label: overallFastest ? `Fastest lap so far (${driverOf(overallFastest.n)?.tla})` : "Fastest lap so far" },
    ...replay.drivers.filter((d) => d.number !== panelDriver).map((d) => ({ value: d.number, label: `${d.tla}'s fastest lap` })),
  ];
  const closeCompare = () => {
    setCompareMode(false);
    setCompare([]);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">← All sessions</button>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Card
            title={`${replay.meeting} · ${replay.session}`}
            icon={<History size={15} />}
            right={
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                <span className={cn("rounded-lg px-2 py-1 font-semibold", racing ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted")}>{sessionLabel}</span>
                {racing && lap && <span className="tnum rounded-lg bg-surface-2 px-2 py-1 font-bold">Lap {lap[1]}{lap[2] ? `/${lap[2]}` : ""}</span>}
                {qualifying && <span className="rounded-lg bg-surface-2 px-2 py-1 font-bold">{kind === "sprintQuali" ? "SQ" : "Q"}{part}</span>}
                {remaining != null && <span className="tnum rounded-lg bg-surface-2 px-2 py-1 font-bold" title="Time left">{countdown(remaining)}</span>}
                {track_ && track_.tone !== "green" && <span className={cn("rounded-lg px-2 py-1 font-bold uppercase", track_.tone === "red" ? "bg-red-600 text-white" : "bg-yellow-400 text-black")}>{track_.label}</span>}
                {(racing || qualifying) && (
                  <button
                    onClick={() => {
                      setCompareMode(!compareMode);
                      setCompare(!compareMode && focus ? [focus] : []);
                    }}
                    aria-pressed={compareMode}
                    className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold", compareMode ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink")}
                  >
                    <Swords size={13} /> Compare
                  </button>
                )}
              </div>
            }
            bodyClassName="px-2 pb-3"
          >
            {racing && lap?.[2] ? (
              <div className="mx-2 mb-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, (lap[1] / lap[2]) * 100)}%` }} />
              </div>
            ) : null}
            {displayMap && track ? (
              <ReplayMap
                replay={replay}
                map={displayMap}
                track={track}
                t={t}
                board={board}
                outAt={outAt}
                highlighted={highlighted}
                dimOthers={comparing}
                onPick={pick}
                lap={lapAValid}
                betweenPair={comparing && racing ? [compare[0], compare[1]] : null}
              />
            ) : (
              <Skeleton className="aspect-[4/3]" />
            )}

            <div className="mt-2 space-y-2 px-2">
              <Timeline replay={replay} t={t} duration={duration} onSeek={seek} focus={compareMode ? null : focus} outAt={outAt} clock={clock} />
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
              {!focus && !compareMode && <p className="text-xs text-muted">Tap a car or a name to follow that driver: onboard data, lap telemetry and tyre wear appear below.</p>}
            </div>
          </Card>

          {compareMode && qualifying && <QualiCompare replay={replay} board={board} picked={compare} part={part} kind={kind} onRemove={(n) => setCompare((prev) => prev.filter((x) => x !== n))} onClose={closeCompare} />}
          {compareMode && racing && (
            <CompareView
              picked={compare}
              cars={compare.filter((n) => board[n]).map((n) => compareCar(n, board[n], history[n], t))}
              lap={lap?.[1] ?? null}
              total={lap?.[2] ?? null}
              driver={(n) => {
                const d = driverOf(n);
                return { tla: d?.tla ?? n, colour: d?.teamColour ?? "888888", fullName: d?.fullName ?? "", headshot: d?.headshot ?? null };
              }}
              onRemove={(n) => setCompare((prev) => prev.filter((x) => x !== n))}
              onClose={closeCompare}
            />
          )}
          {panelDriver && driverOf(panelDriver) && (!compareMode || comparing) && (
            <DriverPanel
              key={panelDriver}
              replay={replay}
              driver={driverOf(panelDriver)!}
              t={t}
              laps={lapsSoFar(panelDriver)}
              lapA={{ data: lapAValid, loading: lapAData.loading, error: lapAData.error }}
              lapB={{ data: lapBValid, driver: lapB ? driverOf(lapB.n) : null }}
              lapNumber={lapA}
              onLapNumber={setLapChoice}
              vs={vsKey}
              onVs={setVs}
              vsOptions={compareMode ? vsOptions.filter((o) => o.value === vsKey) : vsOptions}
              map={displayMap}
              onClose={() => (compareMode ? closeCompare() : setFocus(null))}
            />
          )}
        </div>

        <ReplaySide replay={replay} board={board} t={t} kind={kind} part={part} focus={compareMode ? compare.at(-1) ?? null : focus} onPick={pick} radio={radio} speed={speed} clock={clock} />
      </div>
    </div>
  );
}

const EMPTY_REPLAY = { path: "", radio: [] } as unknown as Replay;

function countdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")} left`;
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
