"use client";

import { Crosshair, Gauge, UserRound, X } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { isRaceSession, list, TYRES } from "@/lib/live";
import { Card, Headshot, TeamBar, Tyre, cn } from "@/components/ui";
import { useTowerRows } from "@/components/live/TimingTower";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mini-sector status codes from the timing feed.
const SEGMENT: Record<number, string> = { 2048: "bg-yellow", 2049: "bg-good", 2051: "bg-purple", 2064: "bg-blue-500" };

export function DriverFocus({ number, onClear, onProfile }: { number: string | null; onClear: () => void; onProfile: (n: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const rows = useTowerRows();
  const race = isRaceSession(topics);

  if (!number) {
    return (
      <Card title="Driver focus" icon={<Crosshair size={15} />}>
        <p className="py-4 text-center text-sm text-muted">Tap a car on the map or a driver in the timing to follow them here.</p>
      </Card>
    );
  }

  const d = get(number);
  const index = rows.findIndex((r) => r.number === number);
  const row = rows[index];
  const t = row?.timing ?? {};
  const ahead = index > 0 ? rows[index - 1] : null;
  const behind = index >= 0 && index < rows.length - 1 ? rows[index + 1] : null;
  const gapAhead = t.IntervalToPositionAhead?.Value ?? t.TimeDiffToPositionAhead;
  const gapBehind = behind ? behind.timing.IntervalToPositionAhead?.Value ?? behind.timing.TimeDiffToPositionAhead : null;
  const sectors = list<any>(t.Sectors);
  const stint = row?.stint;
  const stintLaps = stint ? Math.max((stint.TotalLaps ?? 0) - (stint.StartLaps ?? 0), 0) : null;
  const gained = race && row?.gridPos && row.position < 99 ? row.gridPos - row.position : null;

  return (
    <Card
      title="Driver focus"
      icon={<Crosshair size={15} />}
      right={
        <div className="flex items-center gap-1">
          <button onClick={() => onProfile(number)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink">
            <UserRound size={13} /> Profile
          </button>
          <button onClick={onClear} aria-label="Stop following" className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
            <X size={15} />
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl p-3" style={{ background: `linear-gradient(135deg, #${d.colour}45, transparent 75%)` }}>
            <div className="flex items-end gap-3">
              <Headshot src={d.headshot} colour={d.colour} size={72} alt={d.tla} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-3xl leading-none font-bold" style={{ color: `#${d.colour}` }}>{number}</p>
                <p className="truncate font-display text-lg leading-tight font-bold">{d.fullName}</p>
                <p className="truncate text-xs text-muted">{d.team}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Position</p>
                <p className="font-display text-4xl leading-none font-bold">{row && row.position < 99 ? row.position : "–"}</p>
                {gained ? <p className={cn("text-xs font-semibold", gained > 0 ? "text-good" : "text-bad")}>{gained > 0 ? `+${gained}` : gained} from grid</p> : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Neighbour label="Ahead" number={ahead?.number} gap={ahead ? gapAhead : null} />
            <Neighbour label="Behind" number={behind?.number} gap={behind ? gapBehind : null} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Tile label="Last lap" value={t.LastLapTime?.Value || "–"} tone={t.LastLapTime?.OverallFastest ? "text-purple" : t.LastLapTime?.PersonalFastest ? "text-good" : undefined} />
            <Tile label="Best lap" value={t.BestLapTime?.Value || "–"} />
            <Tile label={race ? "Gap to leader" : "To fastest"} value={t.GapToLeader || t.TimeDiffToFastest || (row?.position === 1 ? "Leader" : "–")} />
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
            <Tyre compound={stint?.Compound} size={26} isNew={stint?.New === true || stint?.New === "true"} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{stint?.Compound ? `${TYRES[stint.Compound]?.name ?? stint.Compound} tyres` : "Tyres unknown"}</p>
              <p className="text-xs text-muted">
                {stintLaps != null ? `${stintLaps} laps on this set` : ""}
                {t.NumberOfPitStops != null ? ` · ${t.NumberOfPitStops} stop${t.NumberOfPitStops === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            {t.InPit && <span className="rounded-md bg-yellow/20 px-2 py-0.5 text-xs font-bold text-yellow">In pit</span>}
          </div>
        </div>

        <div className="space-y-3">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted">Current lap · sectors</h3>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => {
                const s = sectors[i];
                const segments = list<any>(s?.Segments);
                return (
                  <div key={i} className="rounded-xl bg-surface-2 px-2.5 py-2">
                    <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">S{i + 1}</p>
                    <p className={cn("tnum font-display text-base font-bold", s?.OverallFastest ? "text-purple" : s?.PersonalFastest ? "text-good" : "")}>{s?.Value || "–"}</p>
                    <div className="mt-1.5 flex gap-[2px]">
                      {segments.length > 0
                        ? segments.map((seg, j) => <span key={j} className={cn("h-1.5 flex-1 rounded-full", SEGMENT[seg?.Status] ?? "bg-surface-3")} />)
                        : <span className="h-1.5 flex-1 rounded-full bg-surface-3" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <Telemetry number={number} colour={d.colour} />
        </div>
      </div>
    </Card>
  );
}

function Neighbour({ label, number, gap }: { label: string; number?: string; gap?: string | null }) {
  const { get } = useDrivers();
  const d = number ? get(number) : null;
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      {d ? (
        <p className="flex items-center gap-2">
          <TeamBar colour={d.colour} className="h-4" />
          <span className="font-display font-bold">{d.tla}</span>
          <span className="tnum ml-auto text-sm text-muted">{gap || "–"}</span>
        </p>
      ) : (
        <p className="text-sm text-muted">—</p>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-2">
      <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</p>
      <p className={cn("tnum truncate font-display text-base font-bold", tone)}>{value}</p>
    </div>
  );
}

// Live car telemetry. The feed only sends it with an F1 TV token (F1_AUTH_TOKEN).
function Telemetry({ number, colour }: { number: string; colour: string }) {
  const { topics } = useLive();
  const ch = topics.CarData?.Cars?.[number]?.Channels;
  if (!ch) {
    return (
      <section className="rounded-xl border border-dashed border-line px-3 py-3 text-xs text-muted">
        <p className="flex items-center gap-1.5 font-semibold text-ink"><Gauge size={14} /> Telemetry</p>
        <p className="mt-1">Speed, gear, throttle and brake appear here when the server has an F1 TV token (see README).</p>
      </section>
    );
  }
  const speed = Number(ch["2"]) || 0;
  const rpm = Number(ch["0"]) || 0;
  const gear = Number(ch["3"]) || 0;
  const throttle = Math.min(Math.max(Number(ch["4"]) || 0, 0), 100);
  const brake = Number(ch["5"]) > 0 ? 100 : 0;
  const drs = [10, 12, 14].includes(Number(ch["45"]));
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted"><Gauge size={13} /> Telemetry</h3>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl bg-surface-2 p-3">
        <div className="text-center">
          <p className="tnum font-display text-4xl leading-none font-bold">{speed}</p>
          <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">km/h</p>
          <p className="mt-2 font-display text-2xl leading-none font-bold" style={{ color: `#${colour}` }}>{gear === 0 ? "N" : gear}</p>
          <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Gear</p>
        </div>
        <div className="space-y-2 text-xs">
          <Bar label="RPM" value={rpm} max={13000} colour={`#${colour}`} text={rpm.toLocaleString()} />
          <Bar label="Throttle" value={throttle} max={100} colour="var(--good)" text={`${throttle}%`} />
          <Bar label="Brake" value={brake} max={100} colour="#ef4444" text={brake ? "On" : "Off"} />
          <p className={cn("inline-block rounded-md px-2 py-0.5 font-bold", drs ? "bg-good/20 text-good" : "bg-surface-3 text-faint")}>DRS {drs ? "open" : "closed"}</p>
        </div>
      </div>
    </section>
  );
}

function Bar({ label, value, max, colour, text }: { label: string; value: number; max: number; colour: string; text: string }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between"><span className="text-muted">{label}</span><span className="tnum font-semibold">{text}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: colour }} />
      </div>
    </div>
  );
}
