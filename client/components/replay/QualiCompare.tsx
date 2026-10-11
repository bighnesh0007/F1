"use client";

import { Swords, X } from "lucide-react";
import type { Replay, ReplayBoardRow } from "@/lib/types";
import { Card, Headshot, Tyre, cn } from "@/components/ui";
import { SECTOR_COLOURS } from "@/components/track/CircuitMapView";
import { advancing, lapMs, type Board, type SessionKind } from "./board";

type Driver = Replay["drivers"][number];

const secs = (ms: number) => `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(3)}`;
const lapText = (ms: number | null) => (ms == null ? "–" : `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`);

// Qualifying head-to-head: best laps in the current part and the gap between them,
// sector by sector, the lap each could do with their best sectors, and where each
// stands against the drop zone.
export function QualiCompare({
  replay,
  board,
  picked,
  part,
  kind,
  onClose,
  onRemove,
}: {
  replay: Replay;
  board: Board;
  picked: string[];
  part: number;
  kind: SessionKind;
  onClose: () => void;
  onRemove: (n: string) => void;
}) {
  const prefix = kind === "sprintQuali" ? "SQ" : "Q";
  const driver = (n: string) => replay.drivers.find((d) => d.number === n);

  if (picked.length < 2) {
    return (
      <Card title="Compare" icon={<Swords size={15} />} right={<Done onClose={onClose} />}>
        <p className="py-3 text-center text-sm text-muted">
          {picked.length === 0 ? "Tap two cars on the map (or two rows) to compare their laps." : `${driver(picked[0])?.tla ?? ""} picked. Tap one more car.`}
        </p>
      </Card>
    );
  }

  const key = `q${part}` as "q1" | "q2" | "q3";
  // Rank in this part, by best time in it.
  const ranked = replay.drivers
    .map((d) => ({ n: d.number, ms: lapMs(board[d.number]?.[key]) }))
    .filter((x) => x.ms != null)
    .sort((a, b) => a.ms! - b.ms!);
  const rankOf = (n: string) => {
    const i = ranked.findIndex((x) => x.n === n);
    return i < 0 ? null : i + 1;
  };
  const cut = part < 3 ? advancing(replay, part) : null;

  // Faster driver (in this part) on the left.
  const cars = picked
    .map((n) => ({ n, d: driver(n), r: board[n], ms: lapMs(board[n]?.[key]) ?? lapMs(board[n]?.best) }))
    .filter((c): c is { n: string; d: Driver; r: ReplayBoardRow; ms: number | null } => c.d != null && c.r != null)
    .sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));
  if (cars.length < 2) return null;
  const [A, B] = cars;
  const gap = A.ms != null && B.ms != null ? B.ms - A.ms : null;

  const sectors = [0, 1, 2].map((i) => {
    const k = `bs${i + 1}` as "bs1" | "bs2" | "bs3";
    const a = A.r[k] != null ? A.r[k]! * 1000 : null;
    const b = B.r[k] != null ? B.r[k]! * 1000 : null;
    return { i, a, b, delta: a != null && b != null ? b - a : null };
  });
  const ideal = (r: ReplayBoardRow) => (r.bs1 != null && r.bs2 != null && r.bs3 != null ? (r.bs1 + r.bs2 + r.bs3) * 1000 : null);
  const idealA = ideal(A.r);
  const idealB = ideal(B.r);
  const maxDelta = Math.max(1, ...sectors.map((s) => Math.abs(s.delta ?? 0)));

  const status = (c: typeof A) => {
    const rank = rankOf(c.n);
    if (c.r.ko && !c.r[key]) return { text: `Knocked out`, tone: "text-bad" };
    if (rank == null) return { text: c.r.pit ? "In the pits, no time yet" : "No time yet", tone: "text-muted" };
    if (cut != null && rank > cut) return { text: `P${rank} · in the drop zone`, tone: "text-bad" };
    return { text: `P${rank} in ${prefix}${part}${cut != null ? ` · ${rank <= cut ? "through" : ""}` : ""}`, tone: "text-good" };
  };

  return (
    <Card title={`Compare · ${prefix}${part}`} icon={<Swords size={15} />} right={<Done onClose={onClose} />}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <Side c={A} status={status(A)} onRemove={() => onRemove(A.n)} />
        <div className="text-center">
          <p className="tnum font-display text-3xl leading-none font-bold">{gap != null ? `${(gap / 1000).toFixed(3)}s` : "–"}</p>
          <p className="mt-1 text-[10px] font-semibold tracking-wider text-faint uppercase">Gap on best lap</p>
        </div>
        <Side c={B} status={status(B)} onRemove={() => onRemove(B.n)} right />
      </div>

      <div className="mt-4 rounded-xl bg-surface-2 p-3">
        <p className="mb-2 text-xs font-semibold text-muted">Best sectors (whole session) · who is quicker where</p>
        <div className="space-y-2">
          {sectors.map((s) => {
            const faster = s.delta == null ? null : s.delta > 0 ? A : s.delta < 0 ? B : null;
            const width = s.delta == null ? 0 : (Math.abs(s.delta) / maxDelta) * 50;
            return (
              <div key={s.i} className="grid grid-cols-[2.2rem_4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
                <span className="flex items-center gap-1 text-xs font-bold">
                  <span className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLOURS[s.i] }} />S{s.i + 1}
                </span>
                <span className={cn("tnum text-xs", faster === A && "font-bold text-good")}>{s.a != null ? (s.a / 1000).toFixed(3) : "–"}</span>
                <div className="relative h-2.5 rounded-full bg-surface-3">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                  {faster && (
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{ background: `#${faster.d.teamColour}`, width: `${width}%`, [faster === A ? "right" : "left"]: "50%" }}
                      title={`${faster.d.tla} ${secs(-Math.abs(s.delta!)).replace("−", "")}s quicker`}
                    />
                  )}
                </div>
                <span className={cn("tnum text-right text-xs", faster === B && "font-bold text-good")}>{s.b != null ? (s.b / 1000).toFixed(3) : "–"}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-faint">The bar points to whoever is quicker in that sector; its length is the time difference.</p>
      </div>

      <table className="mt-3 w-full text-sm">
        <tbody className="[&_td]:py-1">
          <Row label={`Best in ${prefix}${part}`} a={A.r[key] ?? "–"} b={B.r[key] ?? "–"} />
          <Row label="Ideal lap (best sectors)" a={lapText(idealA)} b={lapText(idealB)} better={idealA != null && idealB != null ? (idealA <= idealB ? "a" : "b") : null} />
          <Row label="Time still to find" a={left(idealA, A.ms)} b={left(idealB, B.ms)} title="How much quicker each could go by joining up their best sectors" />
          <Row label="Laps run" a={String(A.r.laps || 0)} b={String(B.r.laps || 0)} />
          <Row label="Tyres now" a={<Tyre compound={A.r.tyre} isNew={A.r.fresh} laps={A.r.tyreLaps} size={18} />} b={<Tyre compound={B.r.tyre} isNew={B.r.fresh} laps={B.r.tyreLaps} size={18} />} />
        </tbody>
      </table>
    </Card>
  );
}

function left(ideal: number | null, best: number | null) {
  if (ideal == null || best == null) return "–";
  const d = best - ideal;
  return d > 1 ? `${(d / 1000).toFixed(3)}s` : "on it";
}

function Side({ c, status, onRemove, right }: { c: { n: string; d: Driver; r: ReplayBoardRow }; status: { text: string; tone: string }; onRemove: () => void; right?: boolean }) {
  return (
    <div className={cn("relative flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5", right && "flex-row-reverse text-right")} style={{ background: `linear-gradient(${right ? 225 : 135}deg, #${c.d.teamColour}40, transparent 75%)` }}>
      <Headshot src={c.d.headshot} colour={c.d.teamColour} size={48} alt={c.d.tla} />
      <div className="min-w-0">
        <p className="truncate font-display text-lg leading-tight font-bold">{c.d.tla}</p>
        <p className="truncate text-xs text-muted">{c.d.team}</p>
        <p className={cn("truncate text-xs font-semibold", status.tone)}>{status.text}</p>
      </div>
      <button onClick={onRemove} aria-label={`Remove ${c.d.tla}`} className={cn("absolute top-1.5 rounded p-0.5 text-faint hover:text-ink", right ? "left-1.5" : "right-1.5")}>
        <X size={12} />
      </button>
    </div>
  );
}

function Row({ label, a, b, better, title }: { label: string; a: React.ReactNode; b: React.ReactNode; better?: "a" | "b" | null; title?: string }) {
  return (
    <tr title={title}>
      <td className={cn("tnum w-1/3 text-left font-semibold", better === "a" && "text-good")}>{a}</td>
      <td className="text-center text-xs text-muted">{label}</td>
      <td className={cn("tnum w-1/3 text-right font-semibold", better === "b" && "text-good")}><span className="inline-flex justify-end">{b}</span></td>
    </tr>
  );
}

function Done({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
      <X size={13} /> Done
    </button>
  );
}
