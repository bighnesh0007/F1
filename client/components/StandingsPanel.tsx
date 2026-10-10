import { connection } from "next/server";
import { getStandings } from "@/lib/api";
import { Panel } from "./LiveDashboard";

export async function StandingsPanel() {
  await connection();
  let standings;
  try {
    standings = await getStandings();
  } catch (err) {
    return (
      <Panel title="Championship">
        <p className="text-sm text-red-300">Could not load standings: {(err as Error).message}</p>
      </Panel>
    );
  }

  return (
    <Panel title={`Championship ${standings.season ?? ""}${standings.round ? ` · after round ${standings.round}` : ""}`}>
      <div className="grid gap-6 sm:grid-cols-2">
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
            <tr><th className="pb-2">Pos</th><th className="pb-2">Driver</th><th className="pb-2 text-right">Pts</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {standings.drivers.map((d) => (
              <tr key={d.code + d.name} className="border-t border-neutral-900">
                <td className="py-1">{d.position}</td>
                <td className="py-1">
                  <span className="font-semibold">{d.name}</span>{" "}
                  <span className="text-xs text-neutral-500">{d.team}</span>
                </td>
                <td className="py-1 text-right font-mono">{d.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full self-start text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-neutral-500">
            <tr><th className="pb-2">Pos</th><th className="pb-2">Team</th><th className="pb-2 text-right">Pts</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {standings.constructors.map((c) => (
              <tr key={c.name} className="border-t border-neutral-900">
                <td className="py-1">{c.position}</td>
                <td className="py-1 font-semibold">{c.name}</td>
                <td className="py-1 text-right font-mono">{c.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
