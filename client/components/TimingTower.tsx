"use client";

import { list, TYRES, type Topics } from "@/lib/live";
import { Panel } from "./LiveDashboard";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = { number: string; driver: any; timing: any; app: any };

export function TimingTower({ topics }: { topics: Topics }) {
  const drivers = topics.DriverList ?? {};
  const lines = topics.TimingData?.Lines ?? {};
  const appLines = topics.TimingAppData?.Lines ?? {};
  const isRace = /race|sprint/i.test(topics.SessionInfo?.Type ?? "") && !/qualifying/i.test(topics.SessionInfo?.Name ?? "");

  const numbers = new Set([...Object.keys(drivers), ...Object.keys(lines)]);
  const rows: Row[] = [...numbers]
    .filter((n) => /^\d+$/.test(n))
    .map((number) => ({ number, driver: drivers[number] ?? {}, timing: lines[number] ?? {}, app: appLines[number] ?? {} }))
    .sort((a, b) => order(a) - order(b));

  return (
    <Panel title="Timing">
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">No timing data yet.</p>
      ) : (
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
              <tr className="border-b border-neutral-800">
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2 text-right">{isRace ? "Leader" : "Gap"}</th>
                <th className="px-3 py-2 text-right">Int</th>
                <th className="px-3 py-2 text-right">Last lap</th>
                <th className="px-3 py-2 text-right">Best lap</th>
                <th className="px-3 py-2 text-right">S1</th>
                <th className="px-3 py-2 text-right">S2</th>
                <th className="px-3 py-2 text-right">S3</th>
                <th className="px-3 py-2">Tyre</th>
                <th className="px-3 py-2 text-right">Laps</th>
                <th className="px-3 py-2 text-right">Pits</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map((row) => (
                <TowerRow key={row.number} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function order(row: Row) {
  return Number(row.timing.Line ?? row.timing.Position ?? row.driver.Line ?? 99);
}

function TowerRow({ row }: { row: Row }) {
  const { number, driver, timing, app } = row;
  const sectors = list(timing.Sectors);
  const stint = list(app.Stints).at(-1);
  const tyre = stint?.Compound ? TYRES[stint.Compound] : undefined;
  const out = timing.Retired || timing.Stopped || timing.KnockedOut;
  const gap = timing.GapToLeader ?? timing.TimeDiffToFastest ?? lastStat(timing.Stats)?.TimeDiffToFastest;
  const interval = timing.IntervalToPositionAhead?.Value ?? timing.TimeDiffToPositionAhead ?? lastStat(timing.Stats)?.TimeDiffToPositionAhead;
  const status = timing.InPit ? "PIT" : timing.PitOut ? "OUT" : timing.Retired ? "RET" : timing.Stopped ? "STOP" : timing.KnockedOut ? "KO" : null;

  return (
    <tr className={`border-b border-neutral-900 ${out ? "opacity-50" : ""}`}>
      <td className="px-3 py-1.5 font-semibold">{timing.Position ?? timing.Line ?? "–"}</td>
      <td className="px-3 py-1.5 font-sans">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded" style={{ background: `#${driver.TeamColour ?? "666"}` }} />
          <span className="font-semibold" title={driver.FullName}>{driver.Tla ?? number}</span>
          <span className="text-xs text-neutral-500">{number}</span>
          {status && <span className="rounded bg-neutral-800 px-1 text-[10px] font-bold text-neutral-300">{status}</span>}
        </div>
      </td>
      <td className="px-3 py-1.5 text-right">{gap || "–"}</td>
      <td className="px-3 py-1.5 text-right text-neutral-400">{interval || "–"}</td>
      <td className={`px-3 py-1.5 text-right ${timeColor(timing.LastLapTime)}`}>{timing.LastLapTime?.Value || "–"}</td>
      <td className="px-3 py-1.5 text-right">{timing.BestLapTime?.Value || "–"}</td>
      {[0, 1, 2].map((i) => (
        <td key={i} className={`px-3 py-1.5 text-right ${timeColor(sectors[i])}`}>{sectors[i]?.Value || "–"}</td>
      ))}
      <td className="px-3 py-1.5">
        {tyre ? (
          <span className="flex items-center gap-1.5" title={`${stint.Compound}${stint.New === "true" || stint.New === true ? " (new)" : ""}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${tyre.className}`}>{tyre.short}</span>
            <span className="text-xs text-neutral-400">{stint.TotalLaps ?? 0}</span>
          </span>
        ) : (
          "–"
        )}
      </td>
      <td className="px-3 py-1.5 text-right">{timing.NumberOfLaps ?? "–"}</td>
      <td className="px-3 py-1.5 text-right">{timing.NumberOfPitStops ?? 0}</td>
    </tr>
  );
}

function lastStat(stats: unknown) {
  return list(stats).filter(Boolean).at(-1);
}

function timeColor(t?: { OverallFastest?: boolean; PersonalFastest?: boolean }) {
  if (t?.OverallFastest) return "text-purple-400";
  if (t?.PersonalFastest) return "text-green-400";
  return "";
}
