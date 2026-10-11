"use client";

import { Fragment, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronUp, CircleSlash, Timer } from "lucide-react";
import { useSettings } from "@/lib/settings";
import type { Replay } from "@/lib/types";
import { Segmented, TeamBar, Tyre, cn } from "@/components/ui";
import { advancing, gapText, lapMs, type Board, type SessionKind } from "./board";

type Driver = Replay["drivers"][number];
type Props = { replay: Replay; board: Board; focus: string | null; onFocus: (n: string) => void };

function Row({ driver, focus, onFocus, dim, className, children }: { driver: Driver; focus: string | null; onFocus: (n: string) => void; dim?: boolean; className?: string; children: React.ReactNode }) {
  const { settings } = useSettings();
  return (
    <motion.li
      layout={settings.reduceMotion ? false : "position"}
      transition={{ duration: 0.35 }}
      className={cn(
        "grid cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2",
        focus === driver.number && "bg-surface-2 ring-1 ring-accent/60",
        settings.favouriteDriver === driver.number && focus !== driver.number && "ring-1 ring-line",
        dim && "opacity-50",
        className,
      )}
      onClick={() => onFocus(driver.number)}
    >
      {children}
    </motion.li>
  );
}

function Name({ driver }: { driver: Driver }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamBar colour={driver.teamColour} className="h-5" />
      <span className="font-display font-bold">{driver.tla}</span>
      <span className="truncate text-xs text-muted max-sm:hidden">{driver.team}</span>
    </span>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <li className="px-2 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-faint uppercase">{children}</li>;
}

// Race and sprint: position, places gained from the grid, gap or interval,
// tyres and stops. Retired cars drop to their own list at the bottom.
export function RaceBoard({ replay, board, focus, onFocus }: Props) {
  const [mode, setMode] = useState<"int" | "gap">("int");
  const rows = replay.drivers.map((d) => ({ d, r: board[d.number] })).filter((x) => x.r?.p);
  const running = rows.filter((x) => !x.r.out).sort((a, b) => a.r.p! - b.r.p!);
  const retired = rows.filter((x) => x.r.out).sort((a, b) => a.r.p! - b.r.p!);
  const fastest = minBy(rows, (x) => lapMs(x.r.best));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{running.length} running{retired.length ? ` · ${retired.length} out` : ""}</span>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "int", label: "Interval" }, { value: "gap", label: "Leader" }]} />
      </div>
      <ol>
        {running.map(({ d, r }, i) => {
          const gained = r.grid && r.p ? r.grid - r.p : 0;
          const gap = i === 0 ? "Leader" : (mode === "int" ? r.int : r.gap) || "";
          return (
            <Row key={d.number} driver={d} focus={focus} onFocus={onFocus} className="grid-cols-[1.6em_1.9em_minmax(0,1fr)_auto_4.6em]">
              <span className="text-center font-display font-bold">{r.p}</span>
              <span className={cn("flex items-center text-[11px] font-semibold", gained > 0 ? "text-good" : gained < 0 ? "text-bad" : "text-faint")} title={r.grid ? `Started P${r.grid}` : undefined}>
                {gained > 0 ? <ChevronUp size={12} /> : gained < 0 ? <ChevronDown size={12} /> : "–"}
                {gained !== 0 && Math.abs(gained)}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Name driver={d} />
                {fastest?.d.number === d.number && <Timer size={13} className="shrink-0 text-purple" aria-label="Fastest lap" />}
              </span>
              <span className="flex items-center gap-1.5">
                {r.pit ? <Badge tone="yellow">PIT</Badge> : <Tyre compound={r.tyre} isNew={r.fresh} size={17} />}
                {r.stops > 0 && <span className="tnum text-[11px] text-faint" title={`${r.stops} pit stop${r.stops === 1 ? "" : "s"}`}>{r.stops}×</span>}
              </span>
              <span className="tnum truncate text-right text-xs text-muted">{gap}</span>
            </Row>
          );
        })}
        {retired.length > 0 && <Heading>Retired</Heading>}
        {retired.map(({ d, r }) => (
          <Row key={d.number} driver={d} focus={focus} onFocus={onFocus} dim className="grid-cols-[1.6em_minmax(0,1fr)_auto]">
            <CircleSlash size={14} className="mx-auto text-bad" />
            <Name driver={d} />
            <span className="text-xs text-muted">{r.laps ? `${r.laps} laps` : "Out"}</span>
          </Row>
        ))}
      </ol>
    </div>
  );
}

// Qualifying: Q1/Q2/Q3 (SQ1–3 for sprints) with the drop zone marked and
// knocked-out drivers in their own lists.
export function QualiBoard({ replay, board, focus, onFocus, part, kind }: Props & { part: number; kind: SessionKind }) {
  const [picked, setPicked] = useState<number | null>(null);
  const view = picked != null && picked <= part ? picked : part;
  const prefix = kind === "sprintQuali" ? "SQ" : "Q";
  const key = (`q${view}` as "q1" | "q2" | "q3");
  const all = replay.drivers.map((d) => ({ d, r: board[d.number] })).filter((x) => x.r);
  // Who took part in this segment: anyone with a time in it, plus (for the
  // segment that is running now) everyone not yet knocked out.
  const inPart = all.filter(({ r }) => r[key] || (view === part && !r.ko && !r.out) || (view === 1 && (r.q1 || r.laps)));
  const ranked = inPart
    .map((x) => ({ ...x, ms: lapMs(x.r[key]) }))
    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || (a.r.p ?? 99) - (b.r.p ?? 99));
  const top = ranked[0]?.ms ?? null;
  const cut = view < 3 ? advancing(replay, view) : null;
  const lastPart = (r: Board[string]) => (r.q3 ? 3 : r.q2 ? 2 : 1);
  const eliminated = [2, 1]
    .filter((p) => p < view)
    .map((p) => ({ p, drivers: all.filter(({ r }) => r.ko && lastPart(r) === p).sort((a, b) => (a.r.p ?? 99) - (b.r.p ?? 99)) }));

  return (
    <div>
      <div className="mb-2 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented
          size="sm"
          value={String(view)}
          onChange={(v) => setPicked(Number(v) === part ? null : Number(v))}
          options={[1, 2, 3].map((p) => ({ value: String(p), label: `${prefix}${p}${p === part ? " ●" : ""}`, disabled: p > part }))}
        />
      </div>
      <ol>
        {ranked.map(({ d, r, ms }, i) => (
          <QualiLine key={d.number} index={i} cut={cut} d={d} focus={focus} onFocus={onFocus}>
            <span className="tnum text-right font-display text-sm font-bold">{r[key] ?? <span className="text-faint">{r.pit ? "In pit" : "No time"}</span>}</span>
            <span className="tnum w-[4.2em] text-right text-xs text-muted">{gapText(ms, top)}</span>
            <span className="w-7">{r.pit ? <Badge tone="yellow">PIT</Badge> : <Tyre compound={r.tyre} isNew={r.fresh} size={16} />}</span>
          </QualiLine>
        ))}
        {eliminated.map(({ p, drivers }) =>
          drivers.length ? (
            <Fragment key={p}>
              <Heading>Knocked out in {prefix}{p}</Heading>
              {drivers.map(({ d, r }) => (
                <Row key={d.number} driver={d} focus={focus} onFocus={onFocus} dim className="grid-cols-[1.6em_minmax(0,1fr)_auto]">
                  <span className="text-center font-display font-bold">{r.p}</span>
                  <Name driver={d} />
                  <span className="tnum text-xs text-muted">{r[`q${p}` as "q1" | "q2"] ?? "No time"}</span>
                </Row>
              ))}
            </Fragment>
          ) : null,
        )}
      </ol>
    </div>
  );
}

function QualiLine({ index, cut, d, focus, onFocus, children }: { index: number; cut: number | null; d: Driver; focus: string | null; onFocus: (n: string) => void; children: React.ReactNode }) {
  const danger = cut != null && index >= cut;
  return (
    <>
      {cut != null && index === cut && (
        <li className="my-1 flex items-center gap-2 px-2 text-[10px] font-semibold tracking-wider text-bad uppercase">
          <span className="h-px flex-1 bg-bad/60" /> Drop zone <span className="h-px flex-1 bg-bad/60" />
        </li>
      )}
      <Row driver={d} focus={focus} onFocus={onFocus} className={cn("grid-cols-[1.6em_minmax(0,1fr)_auto_auto_auto]", danger && "bg-bad/5")}>
        <span className={cn("text-center font-display font-bold", danger && "text-bad")}>{index + 1}</span>
        <Name driver={d} />
        {children}
      </Row>
    </>
  );
}

// Practice: everyone ranked by their best lap, with laps run and who's out on track.
export function PracticeBoard({ replay, board, focus, onFocus }: Props) {
  const rows = replay.drivers
    .map((d) => ({ d, r: board[d.number], ms: lapMs(board[d.number]?.best) }))
    .filter((x) => x.r)
    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || (b.r.laps ?? 0) - (a.r.laps ?? 0));
  const top = rows[0]?.ms ?? null;
  const onTrack = rows.filter((x) => !x.r.pit && x.r.laps > 0 && !x.r.out).length;
  const laps = rows.reduce((sum, x) => sum + (x.r.laps || 0), 0);
  return (
    <div>
      <p className="mb-2 text-xs text-muted">{laps} laps run · fastest lap ranks the field</p>
      <div className="mb-1 grid grid-cols-[1.6em_minmax(0,1fr)_auto_4.2em_2.4em_1.7em] gap-2 px-2 text-[10px] font-semibold tracking-wider text-faint uppercase">
        <span /> <span>Driver{onTrack ? ` · ${onTrack} on track` : ""}</span> <span className="text-right">Best</span> <span className="text-right">Gap</span> <span className="text-right">Laps</span> <span />
      </div>
      <ol>
        {rows.map(({ d, r, ms }, i) => (
          <Row key={d.number} driver={d} focus={focus} onFocus={onFocus} dim={!r.best && !r.laps} className="grid-cols-[1.6em_minmax(0,1fr)_auto_4.2em_2.4em_1.7em]">
            <span className="text-center font-display font-bold">{r.best ? i + 1 : "–"}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Name driver={d} />
              {!r.pit && r.laps > 0 && !r.out && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-good" title="On track" />}
            </span>
            <span className={cn("tnum text-right font-display text-sm font-bold", i === 0 && r.best && "text-purple")}>{r.best ?? "–"}</span>
            <span className="tnum text-right text-xs text-muted">{gapText(ms, top)}</span>
            <span className="tnum text-right text-xs text-muted">{r.laps || ""}</span>
            <span>{r.pit ? <Badge tone="yellow">P</Badge> : <Tyre compound={r.tyre} isNew={r.fresh} size={16} />}</span>
          </Row>
        ))}
      </ol>
    </div>
  );
}

function Badge({ tone, children }: { tone: "yellow" | "red"; children: React.ReactNode }) {
  return <span className={cn("rounded px-1.5 py-px text-[10px] font-bold", tone === "yellow" ? "bg-yellow/20 text-yellow" : "bg-bad/20 text-bad")}>{children}</span>;
}

function minBy<T>(items: T[], value: (item: T) => number | null) {
  let best: T | undefined;
  let bestValue = Infinity;
  for (const item of items) {
    const v = value(item);
    if (v != null && v < bestValue) {
      bestValue = v;
      best = item;
    }
  }
  return best;
}
