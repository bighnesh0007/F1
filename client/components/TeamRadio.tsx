"use client";

import { list, LIVETIMING_STATIC, type Topics } from "@/lib/live";
import { Panel } from "./LiveDashboard";

type Capture = { Utc?: string; RacingNumber?: string; Path?: string };

export function TeamRadio({ topics }: { topics: Topics }) {
  const captures = list<Capture>(topics.TeamRadio?.Captures).reverse().slice(0, 20);
  const sessionPath = topics.SessionInfo?.Path;
  const drivers = topics.DriverList ?? {};

  return (
    <Panel title="Team radio">
      {captures.length === 0 || !sessionPath ? (
        <p className="text-sm text-neutral-400">No team radio yet.</p>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {captures.map((c, i) => {
            const driver = drivers[c.RacingNumber ?? ""] ?? {};
            return (
              <li key={i}>
                <p className="mb-1 flex items-center gap-2 text-xs">
                  <span className="h-3 w-1 rounded" style={{ background: `#${driver.TeamColour ?? "666"}` }} />
                  <span className="font-semibold">{driver.Tla ?? c.RacingNumber}</span>
                  <span className="text-neutral-500">{c.Utc && new Date(c.Utc).toLocaleTimeString()}</span>
                </p>
                <audio controls preload="none" className="h-8 w-full" src={`${LIVETIMING_STATIC}${sessionPath}${c.Path}`} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
