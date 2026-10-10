"use client";

import { list } from "@/lib/live";
import { Panel } from "./LiveDashboard";

type Message = { Utc?: string; Message?: string; Category?: string; Flag?: string; Lap?: number };

const FLAG_COLORS: Record<string, string> = {
  GREEN: "bg-green-500",
  CLEAR: "bg-green-500",
  YELLOW: "bg-yellow-400",
  "DOUBLE YELLOW": "bg-yellow-400",
  RED: "bg-red-600",
  BLUE: "bg-blue-500",
  CHEQUERED: "bg-white",
  "BLACK AND WHITE": "bg-neutral-300",
};

export function RaceControl({ messages }: { messages?: { Messages?: unknown } }) {
  const items = list<Message>(messages?.Messages).reverse();
  return (
    <Panel title="Race control">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">No messages yet.</p>
      ) : (
        <ul className="-my-1 max-h-80 space-y-2 overflow-y-auto pr-1 text-sm">
          {items.map((m, i) => (
            <li key={i} className="flex gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${FLAG_COLORS[m.Flag ?? ""] ?? "bg-neutral-600"}`} />
              <div>
                <p className="text-xs text-neutral-500">
                  {m.Utc && new Date(m.Utc.endsWith("Z") ? m.Utc : `${m.Utc}Z`).toLocaleTimeString()}
                  {m.Lap != null && ` · Lap ${m.Lap}`}
                  {m.Category && ` · ${m.Category}`}
                </p>
                <p>{m.Message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
