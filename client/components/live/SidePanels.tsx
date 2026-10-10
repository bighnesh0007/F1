"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, CloudRain, Flag, Flame, Megaphone, Radio, Timer, Wrench, Zap, Sun, Activity } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { useSettings } from "@/lib/settings";
import { isRaceSession, list, LIVETIMING_STATIC, TYRES, type LiveEvent } from "@/lib/live";
import { localTime } from "@/lib/format";
import { Card, Segmented, TeamBar, cn } from "@/components/ui";
import { gapSeconds, useTowerRows } from "./TimingTower";

// --- Battles ------------------------------------------------------------------

export function BattlesPanel({ onSelect }: { onSelect: (n: string) => void }) {
  const { topics } = useLive();
  const { get } = useDrivers();
  const rows = useTowerRows();
  if (!isRaceSession(topics)) return null;

  const battles = rows
    .map((row, i) => ({ row, ahead: rows[i - 1], gap: gapSeconds(row.timing.IntervalToPositionAhead?.Value ?? row.timing.TimeDiffToPositionAhead) }))
    .filter((b) => b.ahead && b.gap != null && b.gap < 1.0 && !b.row.timing.InPit && !b.ahead.timing.InPit)
    .sort((a, b) => a.gap! - b.gap!)
    .slice(0, 4);

  return (
    <Card title="Battles" icon={<Flame size={15} />} right={<span className="text-xs text-faint">within 1.0s</span>}>
      {battles.length === 0 ? (
        <p className="text-sm text-muted">No close fights right now.</p>
      ) : (
        <ul className="space-y-2">
          {battles.map(({ row, ahead, gap }) => {
            const a = get(ahead!.number);
            const b = get(row.number);
            return (
              <li key={row.number}>
                <button onClick={() => onSelect(row.number)} className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left hover:bg-surface-3">
                  <span className="font-display text-sm font-bold text-muted">P{ahead!.position}</span>
                  <span className="flex flex-1 items-center gap-2 font-display font-bold">
                    <TeamBar colour={a.colour} /> {a.tla}
                    <span className="text-xs font-normal text-faint">vs</span>
                    <TeamBar colour={b.colour} /> {b.tla}
                  </span>
                  <span className={cn("tnum rounded-lg px-2 py-0.5 text-xs font-bold", gap! < 0.5 ? "bg-orange-500/20 text-orange-500" : "bg-surface-3 text-muted")}>
                    {gap!.toFixed(3)}s
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --- Race feed ----------------------------------------------------------------

type Filter = "all" | "action" | "control" | "radio";

export function FeedPanel() {
  const { topics } = useLive();
  const [filter, setFilter] = useState<Filter>("all");
  const events = useMemo(() => list<LiveEvent>(topics.Events).reverse(), [topics.Events]);
  const shown = events.filter((e) => {
    if (e.type === "sessionStatus" || e.type === "trackStatus") return false; // shown as race control messages
    if (filter === "action") return ["overtake", "pitIn", "pitOut", "fastestLap", "retired"].includes(e.type);
    if (filter === "control") return e.type === "raceControl";
    if (filter === "radio") return e.type === "radio";
    return true;
  });

  return (
    <Card
      title="Race feed"
      icon={<Activity size={15} />}
      right={
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "action", label: "On track" },
            { value: "control", label: "Control" },
            { value: "radio", label: "Radio" },
          ]}
        />
      }
    >
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ul className="scroll-thin -mr-2 max-h-[420px] space-y-1 overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {shown.slice(0, 120).map((e) => (
              <motion.li
                key={`${e.type}-${e.ts}-${e.driver ?? ""}-${e.message ?? ""}`}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <FeedItem event={e} sessionPath={topics.SessionInfo?.Path} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

export function describeEvent(e: LiveEvent, tla: (n?: string) => string) {
  switch (e.type) {
    case "overtake":
      return { icon: <ArrowRightLeft size={15} />, tone: "text-good", title: `${tla(e.driver)} passes ${tla(e.passed)}`, detail: `for P${e.position}${e.lap ? ` · Lap ${e.lap}` : ""}` };
    case "pitIn":
      return { icon: <Wrench size={15} />, tone: "text-yellow", title: `${tla(e.driver)} pits`, detail: e.position ? `from P${e.position}${e.lap ? ` · Lap ${e.lap}` : ""}` : "" };
    case "pitOut": {
      const tyre = e.compound ? TYRES[e.compound]?.name ?? e.compound : null;
      const change = e.change ? (e.change > 0 ? `gained ${e.change}` : `lost ${-e.change}`) : null;
      return {
        icon: <Wrench size={15} />,
        tone: "text-yellow",
        title: `${tla(e.driver)} rejoins${e.position ? ` P${e.position}` : ""}`,
        detail: [tyre && `${e.newTyres ? "new" : "used"} ${tyre}s`, change && `${change} place${Math.abs(e.change!) === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
      };
    }
    case "fastestLap":
      return { icon: <Timer size={15} />, tone: "text-purple", title: `Fastest lap: ${tla(e.driver)}`, detail: `${e.time}${e.lap ? ` · Lap ${e.lap}` : ""}` };
    case "retired":
      return { icon: <Zap size={15} />, tone: "text-bad", title: `${tla(e.driver)} retires`, detail: e.lap ? `Lap ${e.lap}` : "" };
    case "raceControl":
      return { icon: <Flag size={15} />, tone: flagTone(e.flag), title: e.message ?? "", detail: [e.category, e.lap ? `Lap ${e.lap}` : null].filter(Boolean).join(" · ") };
    case "radio":
      return { icon: <Radio size={15} />, tone: "text-blue-500", title: `Team radio: ${tla(e.driver)}`, detail: "" };
    default:
      return { icon: <Megaphone size={15} />, tone: "text-muted", title: e.message ?? e.status ?? "", detail: "" };
  }
}

function flagTone(flag?: string | null) {
  if (!flag) return "text-muted";
  if (flag.includes("RED")) return "text-red-500";
  if (flag.includes("YELLOW")) return "text-yellow";
  if (flag.includes("GREEN") || flag === "CLEAR") return "text-good";
  if (flag.includes("BLUE")) return "text-blue-500";
  return "text-muted";
}

function FeedItem({ event, sessionPath }: { event: LiveEvent; sessionPath?: string }) {
  const { get } = useDrivers();
  const { settings } = useSettings();
  const tla = (n?: string) => (n ? get(n).tla : "");
  const d = describeEvent(event, tla);
  const mine = settings.favouriteDriver && (event.driver === settings.favouriteDriver || event.passed === settings.favouriteDriver);
  return (
    <div className={cn("flex gap-3 rounded-xl px-2.5 py-2", mine ? "bg-surface-2 ring-1 ring-accent/50" : "hover:bg-surface-2")}>
      <span className={cn("mt-0.5 shrink-0", d.tone)}>{d.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-medium">{d.title}</p>
        <p className="text-xs text-muted">
          {localTime(event.ts, { second: "2-digit" })}
          {d.detail && ` · ${d.detail}`}
        </p>
        {event.type === "radio" && sessionPath && event.path && (
          <audio controls preload="none" className="mt-1.5 h-8 w-full" src={`${LIVETIMING_STATIC}${sessionPath}${event.path}`} />
        )}
      </div>
    </div>
  );
}

// --- Team radio -----------------------------------------------------------------

export function RadioPanel() {
  const { topics } = useLive();
  const { get } = useDrivers();
  const captures = list<{ Utc?: string; RacingNumber?: string; Path?: string }>(topics.TeamRadio?.Captures).reverse().slice(0, 12);
  const path = topics.SessionInfo?.Path;
  return (
    <Card title="Team radio" icon={<Radio size={15} />}>
      {captures.length === 0 || !path ? (
        <p className="text-sm text-muted">No radio yet.</p>
      ) : (
        <ul className="scroll-thin -mr-2 max-h-72 space-y-3 overflow-y-auto pr-2">
          {captures.map((c, i) => {
            const d = get(c.RacingNumber);
            return (
              <li key={`${c.Path}-${i}`}>
                <p className="mb-1 flex items-center gap-2 text-xs">
                  <TeamBar colour={d.colour} />
                  <span className="font-display font-bold">{d.tla}</span>
                  <span className="text-faint">{localTime(c.Utc, { second: "2-digit" })}</span>
                </p>
                <audio controls preload="none" className="h-8 w-full" src={`${LIVETIMING_STATIC}${path}${c.Path}`} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --- Weather ----------------------------------------------------------------------

export function WeatherPanel({ lat, lon }: { lat?: number; lon?: number }) {
  const { topics } = useLive();
  const w = topics.WeatherData;
  const [radar, setRadar] = useState(false);
  if (!w) return null;
  const raining = Number(w.Rainfall) > 0;
  const items = [
    ["Air", `${w.AirTemp}°C`],
    ["Track", `${w.TrackTemp}°C`],
    ["Humidity", `${w.Humidity}%`],
    ["Wind", `${w.WindSpeed} m/s`],
  ];
  return (
    <Card title="Weather" icon={raining ? <CloudRain size={15} /> : <Sun size={15} />}>
      {raining && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-500">
          <CloudRain size={16} /> Rain at the circuit
        </p>
      )}
      <dl className="grid grid-cols-4 gap-2 text-center">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-1 py-2">
            <dt className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
            <dd className="tnum text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {lat != null && lon != null && (
        <div className="mt-3">
          {radar ? (
            <iframe
              title="Rain radar"
              className="aspect-video w-full rounded-xl border border-line"
              src={`https://www.rainviewer.com/map.html?loc=${lat},${lon},9&oFa=0&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`}
              loading="lazy"
            />
          ) : (
            <button onClick={() => setRadar(true)} className="w-full rounded-xl border border-line py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink">
              Show rain radar
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
