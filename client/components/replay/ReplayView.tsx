"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, History, Loader2, Pause, Play, RotateCcw, Swords, Timer } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { useSettings } from "@/lib/settings";
import { countryFlag, localDay } from "@/lib/format";
import { TRACK_STATUS } from "@/lib/live";
import type { ArchivedSession, CircuitMap, Replay } from "@/lib/types";
import { CarDot, CircuitMapView, LayerChip, SECTOR_COLOURS } from "@/components/track/CircuitMapView";
import { buildTrack, findStraights, nearestFraction, pathBetween } from "@/lib/track";
import { CompareView } from "@/components/centre/ComparePanel";
import { Card, Empty, ErrorNote, Segmented, Skeleton, cn } from "@/components/ui";
import { flagSwatch } from "@/components/centre/RaceControl";
import { boardAt, buildCheckpoints, compareCar, kindOf, lapHistory, lastBefore, remainingAt, retirements } from "./board";
import { PracticeBoard, QualiBoard, RaceBoard } from "./Boards";
import { QualiCompare } from "./QualiCompare";

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
  // A tap on a car or a row follows that driver, or in compare mode picks it (two at most).
  const pick = (n: string) => {
    if (compareMode) setCompare((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].slice(-2)));
    else setFocus((f) => (f === n ? null : n));
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
  const [layers, setLayers] = useState({ sectors: true, straights: true });
  const exact = displayMap?.source === "multiviewer";
  // Sector boundaries need a map that starts at the finish line (MultiViewer's).
  const sectorSplits = useMemo<[number, number] | null>(() => {
    const st = replay?.sectorTimes;
    if (!exact || !st) return null;
    const total = st[0] + st[1] + st[2];
    return [st[0] / total, (st[0] + st[1]) / total];
  }, [replay, exact]);
  const straights = useMemo(() => (displayMap ? findStraights(buildTrack(displayMap)) : []), [displayMap]);
  const checkpoints = useMemo(() => (replay?.timing ? buildCheckpoints(replay) : null), [replay]);
  const history = useMemo(() => (replay?.timing ? lapHistory(replay) : {}), [replay]);
  const outAt = useMemo(() => (replay?.timing ? retirements(replay) : new Map<string, number>()), [replay]);

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
  const i = Math.min(Math.floor(t / replay.stepMs), replay.frames.length - 1);
  const k = (t % replay.stepMs) / replay.stepMs;
  const frame = replay.frames[i];
  const nextFrame = replay.frames[Math.min(i + 1, replay.frames.length - 1)];
  const board = boardAt(replay, checkpoints, t);
  const lap = lastBefore(replay.laps, t);
  const status = lastBefore(replay.trackStatus, t);
  const part = lastBefore(replay.parts ?? [], t)?.[1] ?? 1;
  const remaining = racing ? null : remainingAt(replay, t);
  const messages = replay.raceControl.filter((m) => m.t <= t).slice(-6).reverse();
  const track = status ? TRACK_STATUS[status[1]] : null;

  // Cars that haven't moved for 10 s away from the pits have stopped on track
  // (unless most of the field has, as on the grid or under a red flag).
  const still = new Set(replay.drivers.filter((d, idx) => isStill(replay, idx, i) && !board[d.number]?.pit).map((d) => d.number));
  const stoppedOnTrack = still.size <= 4 ? still : new Set<string>();
  const incidents = displayMap?.corners.length ? recentIncidents(replay, t) : [];
  const comparing = compareMode && compare.length === 2;
  // A car's interpolated position on screen, or null when it isn't on the map.
  const carAt = (n: string, trk: { toScreen: (x: number, y: number) => { x: number; y: number } }) => {
    const idx = replay.drivers.findIndex((d) => d.number === n);
    const x0 = frame[idx * 2];
    const y0 = frame[idx * 2 + 1];
    if (idx < 0 || x0 == null || y0 == null) return null;
    const x1 = nextFrame[idx * 2] ?? x0;
    const y1 = nextFrame[idx * 2 + 1] ?? y0;
    return trk.toScreen(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
  };
  const sessionLabel = { race: "Race", sprint: "Sprint", quali: "Qualifying", sprintQuali: "Sprint qualifying", practice: "Practice" }[kind];

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
                {track && track.tone !== "green" && <span className={cn("rounded-lg px-2 py-1 font-bold uppercase", track.tone === "red" ? "bg-red-600 text-white" : "bg-yellow-400 text-black")}>{track.label}</span>}
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
            {displayMap ? (
              <CircuitMapView
                map={displayMap}
                className="aspect-[4/3] w-full"
                showCorners={exact}
                cornerBadges={exact}
                trackScale={1.7}
                sectors={layers.sectors ? sectorSplits : null}
                straights={layers.straights ? straights : null}
              >
                {(trk) => (
                  <>
                    {incidents.map((m) => {
                      const corner = displayMap.corners.find((c) => c.number === m.turn);
                      if (!corner) return null;
                      const p = trk.toScreen(corner.x, corner.y);
                      return <IncidentMarker key={`${m.t}-${m.message}`} x={p.x} y={p.y} size={trk.size} tone={m.tone} label={`T${m.turn} · ${m.label}`} pulse={!settings.reduceMotion} />;
                    })}
                    {comparing && racing && (() => {
                      // The stretch of track from the car behind up to the car ahead.
                      const [a, b] = compare.map((n) => carAt(n, trk));
                      if (!a || !b) return null;
                      const [fa, fb] = [nearestFraction(trk, a), nearestFraction(trk, b)];
                      const aAhead = (board[compare[0]]?.p ?? 99) < (board[compare[1]]?.p ?? 99);
                      return <path d={aAhead ? pathBetween(trk, fb, fa) : pathBetween(trk, fa, fb)} fill="none" stroke="var(--accent)" strokeWidth={trk.size / 70} strokeLinecap="round" opacity={0.55} />;
                    })()}
                    {replay.drivers.map((d) => {
                      const p = carAt(d.number, trk);
                      if (!p) return null;
                      const row = board[d.number];
                      // Retired cars show where they stopped for a minute and a half, then leave the map.
                      if (row?.out) {
                        const since = t - (outAt.get(d.number) ?? t);
                        return since < 90_000 ? <StoppedCar key={d.number} x={p.x} y={p.y} size={trk.size} colour={d.teamColour} label={`${d.tla} · OUT`} tone="red" /> : null;
                      }
                      if (stoppedOnTrack.has(d.number)) return <StoppedCar key={d.number} x={p.x} y={p.y} size={trk.size} colour={d.teamColour} label={`${d.tla} · stopped`} tone="yellow" />;
                      const mine = comparing ? compare.includes(d.number) : compareMode ? compare.includes(d.number) || focus === d.number : focus === d.number || (!focus && settings.favouriteDriver === d.number);
                      const dim = ((row?.pit || row?.ko) && !mine) || (comparing && !mine);
                      return (
                        <CarDot
                          key={d.number}
                          car={{ number: d.number, tla: d.tla, colour: d.teamColour ?? "888888", x: p.x, y: p.y, highlight: mine, dim, hideLabel: (row?.pit || comparing) && !mine }}
                          size={trk.size}
                          onClick={() => pick(d.number)}
                        />
                      );
                    })}
                  </>
                )}
              </CircuitMapView>
            ) : (
              <Skeleton className="aspect-[4/3]" />
            )}
            {displayMap && (sectorSplits || straights.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1 text-[11px]">
                <LayerChip on={layers.sectors} onClick={() => setLayers((l) => ({ ...l, sectors: !l.sectors }))} disabled={!sectorSplits} title="Track coloured by timing sector (boundaries estimated from the session's sector times)">
                  {SECTOR_COLOURS.map((c, i) => <span key={i} className="h-1.5 w-3 rounded-full" style={{ background: c }} />)} Sectors
                </LayerChip>
                <LayerChip on={layers.straights} onClick={() => setLayers((l) => ({ ...l, straights: !l.straights }))} disabled={straights.length === 0} title="Long straights where cars run at full power (worked out from the track shape)">
                  <span className="h-0 w-4 border-t-2 border-dashed border-green-500" /> Full-power straights
                </LayerChip>
              </div>
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

          {compareMode && qualifying && (

            <QualiCompare

              replay={replay}

              board={board}

              picked={compare}

              part={part}

              kind={kind}

              onRemove={(n) => setCompare((prev) => prev.filter((x) => x !== n))}

              onClose={() => {

                setCompareMode(false);

                setCompare([]);

              }}

            />

          )}

          {compareMode && racing && (
            <CompareView
              picked={compare}
              cars={compare.filter((n) => board[n]).map((n) => compareCar(n, board[n], history[n], t))}
              lap={lap?.[1] ?? null}
              total={lap?.[2] ?? null}
              driver={(n) => {
                const d = replay.drivers.find((x) => x.number === n);
                return { tla: d?.tla ?? n, colour: d?.teamColour ?? "888888", fullName: d?.fullName ?? "", headshot: d?.headshot ?? null };
              }}
              onRemove={(n) => setCompare((prev) => prev.filter((x) => x !== n))}
              onClose={() => {
                setCompareMode(false);
                setCompare([]);
              }}
            />
          )}
        </div>

        <div className="space-y-4">
          <Card title={racing ? "Running order" : qualifying ? "Qualifying" : "Fastest laps"} icon={racing ? <Flag size={15} /> : <Timer size={15} />}>
            <div className="scroll-thin -mr-2 max-h-[min(70vh,760px)] overflow-y-auto pr-2">
              {racing ? (
                <RaceBoard replay={replay} board={board} focus={compareMode ? compare.at(-1) ?? null : focus} onFocus={pick} />
              ) : qualifying ? (
                <QualiBoard replay={replay} board={board} focus={compareMode ? compare.at(-1) ?? null : focus} onFocus={pick} part={part} kind={kind} />
              ) : (
                <PracticeBoard replay={replay} board={board} focus={compareMode ? compare.at(-1) ?? null : focus} onFocus={pick} />
              )}
            </div>
          </Card>
          <Card title="Race control" icon={<Flag size={15} />}>
            {messages.length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : (
              <ul className="space-y-2.5 text-sm">
                {messages.map((m, idx) => {
                  const swatch = flagSwatch({ Flag: m.flag ?? undefined, Category: m.category, Message: m.message });
                  return (
                    <li key={idx} className="flex gap-2.5">
                      <span className="mt-0.5 h-4 w-6 shrink-0 rounded border border-line" style={swatch ? { background: swatch.bg } : undefined} title={swatch?.label} />
                      <div className="min-w-0">
                        <p className="text-xs text-faint">{clock(m.t)}{m.lap ? ` · Lap ${m.lap}` : ""}</p>
                        <p className="leading-snug">{m.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// A car that has stopped or retired: a ring with a cross where it came to rest.
function StoppedCar({ x, y, size, colour, label, tone }: { x: number; y: number; size: number; colour: string; label: string; tone: "red" | "yellow" }) {
  const r = size / 60;
  const ring = tone === "red" ? "#ef4444" : "#f59e0b";
  return (
    <g transform={`translate(${x} ${y})`} aria-label={label}>
      <circle r={r * 1.9} fill={ring} opacity={0.18} />
      <circle r={r} fill={`#${colour}`} stroke={ring} strokeWidth={size / 260} />
      <path d={`M${-r * 0.45},${-r * 0.45}L${r * 0.45},${r * 0.45}M${r * 0.45},${-r * 0.45}L${-r * 0.45},${r * 0.45}`} stroke="#fff" strokeWidth={size / 320} strokeLinecap="round" />
      <text x={r * 1.6} y={-r * 1.4} fontSize={size / 46} fontWeight={700} fill={ring} stroke="var(--bg)" strokeWidth={size / 400} paintOrder="stroke" className="font-display select-none">
        {label}
      </text>
    </g>
  );
}

// Where race control has just reported something (from "TURN n" in the message).
function IncidentMarker({ x, y, size, tone, label, pulse }: { x: number; y: number; size: number; tone: "red" | "yellow"; label: string; pulse: boolean }) {
  const r = size / 45;
  const colour = tone === "red" ? "#ef4444" : "#f59e0b";
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r={r} fill="none" stroke={colour} strokeWidth={size / 300} opacity={0.9}>
        {pulse && <animate attributeName="r" values={`${r * 0.6};${r * 1.6}`} dur="1.6s" repeatCount="indefinite" />}
        {pulse && <animate attributeName="opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      <path d={`M0,${-r * 0.55}L${r * 0.5},${r * 0.35}L${-r * 0.5},${r * 0.35}Z`} fill={colour} />
      <text y={-r * 1.1} fontSize={size / 50} textAnchor="middle" fontWeight={700} fill={colour} stroke="var(--bg)" strokeWidth={size / 400} paintOrder="stroke" className="font-display select-none">
        {label}
      </text>
    </g>
  );
}

function isStill(replay: Replay, idx: number, i: number, seconds = 10) {
  const frames = replay.frames;
  const span = Math.round((seconds * 1000) / replay.stepMs);
  if (i < span) return false;
  const x = frames[i][idx * 2];
  const y = frames[i][idx * 2 + 1];
  if (x == null || y == null) return false;
  for (let j = i - span; j < i; j++) {
    const px = frames[j][idx * 2];
    const py = frames[j][idx * 2 + 1];
    if (px == null || py == null || Math.hypot(px - x, py - y) > 60) return false;
  }
  return true;
}

// Race control messages from the last minute that name a corner.
function recentIncidents(replay: Replay, t: number) {
  const out: { t: number; message: string; turn: number; label: string; tone: "red" | "yellow" }[] = [];
  for (const m of replay.raceControl) {
    if (m.t > t || t - m.t > 60_000) continue;
    const turn = /\bTURNS? (\d+)/i.exec(m.message)?.[1];
    if (!turn) continue;
    const text = m.message.toUpperCase();
    const label = /STOPPED|CRASH|COLLISION|CONTACT|SPUN|INCIDENT|INVESTIGAT|UNSAFE|IMPED/.test(text)
      ? /STOPPED/.test(text) ? "Car stopped" : /IMPED/.test(text) ? "Impeding" : "Incident"
      : /DELETED|TRACK LIMITS/.test(text) ? "Track limits" : null;
    if (!label) continue;
    out.push({ t: m.t, message: m.message, turn: Number(turn), label, tone: label === "Track limits" ? "yellow" : "red" });
  }
  // One marker per corner (the newest), at most four at once.
  const byTurn = new Map(out.map((m) => [m.turn, m]));
  return [...byTurn.values()].slice(-4);
}

function countdown(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")} left`;
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
