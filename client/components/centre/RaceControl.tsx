"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flag, Gavel } from "lucide-react";
import { useLive } from "@/lib/live-context";
import { useDrivers } from "@/lib/drivers";
import { list } from "@/lib/live";
import { localTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { Segmented, TeamBar, cn } from "@/components/ui";

export type RcMessage = {
  Utc?: string;
  Lap?: number;
  Category?: string;
  Message?: string;
  Flag?: string;
  Scope?: string;
  Sector?: number;
  RacingNumber?: string;
  Status?: string;
};

type Filter = "all" | "flags" | "stewards" | "drs";

const STEWARDS = /PENALTY|INVESTIGAT|NOTED|DELETED|REPRIMAND|STEWARDS|DISQUALIF|NO FURTHER ACTION/i;

export function useRaceControl() {
  const { topics } = useLive();
  return useMemo(() => list<RcMessage>(topics.RaceControlMessages?.Messages), [topics.RaceControlMessages]);
}

// Colours for the little flag swatch next to each message.
export function flagSwatch(m: RcMessage): { bg: string; label: string } | null {
  const flag = m.Flag?.toUpperCase();
  const text = m.Message?.toUpperCase() ?? "";
  if (m.Category === "SafetyCar" || /SAFETY CAR/.test(text)) return { bg: "linear-gradient(135deg,#facc15,#eab308)", label: /VIRTUAL/.test(text) ? "VSC" : "SC" };
  switch (flag) {
    case "GREEN":
    case "CLEAR":
      return { bg: "#16a34a", label: flag === "CLEAR" ? "Clear" : "Green" };
    case "YELLOW":
      return { bg: "#facc15", label: "Yellow" };
    case "DOUBLE YELLOW":
      return { bg: "repeating-linear-gradient(90deg,#facc15 0 45%,transparent 45% 55%,#facc15 55%)", label: "Double yellow" };
    case "RED":
      return { bg: "#dc2626", label: "Red" };
    case "BLUE":
      return { bg: "#2563eb", label: "Blue" };
    case "CHEQUERED":
      return { bg: "repeating-conic-gradient(#111 0% 25%, #f5f5f5 0% 50%) 50% / 8px 8px", label: "Chequered" };
    case "BLACK AND WHITE":
      return { bg: "linear-gradient(135deg,#111 50%,#f5f5f5 50%)", label: "Black & white" };
    case "BLACK AND ORANGE":
      return { bg: "radial-gradient(circle,#f97316 35%,#111 36%)", label: "Black & orange" };
  }
  if (m.Category === "Drs") return { bg: "#7c3aed", label: "DRS" };
  return null;
}

export function RaceControlList({ focus }: { focus: string | null }) {
  const messages = useRaceControl();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = messages
    .filter((m) => {
      if (filter === "flags") return m.Category === "Flag" || m.Category === "SafetyCar";
      if (filter === "stewards") return STEWARDS.test(m.Message ?? "");
      if (filter === "drs") return m.Category === "Drs";
      return true;
    })
    .reverse();

  return (
    <div>
      <div className="mb-3 [&>div]:flex [&>div]:w-full [&_button]:flex-1">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "flags", label: "Flags" },
            { value: "stewards", label: "Stewards" },
            { value: "drs", label: "DRS" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No messages{filter === "all" ? " from race control yet" : " of this kind"}.</p>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {shown.slice(0, 150).map((m, i) => (
              <motion.li key={`${m.Utc}-${m.Message}-${i}`} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                <MessageRow message={m} focus={focus} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function mentions(m: RcMessage, n: string | null) {
  if (!n) return false;
  return m.RacingNumber === n || new RegExp(`\\bCAR ${n}\\b`).test(m.Message ?? "");
}

function MessageRow({ message: m, focus }: { message: RcMessage; focus: string | null }) {
  const { get } = useDrivers();
  const swatch = flagSwatch(m);
  const stewards = STEWARDS.test(m.Message ?? "");
  const driver = m.RacingNumber ? get(m.RacingNumber) : null;
  return (
    <div className={cn("flex gap-3 rounded-xl px-2.5 py-2", mentions(m, focus) ? "bg-surface-2 ring-1 ring-accent/60" : "hover:bg-surface-2")}>
      <span className="mt-0.5 flex h-5 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line" style={swatch ? { background: swatch.bg } : undefined} title={swatch?.label}>
        {!swatch && (stewards ? <Gavel size={12} className="text-muted" /> : <Flag size={12} className="text-faint" />)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-medium">{m.Message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <span>{localTime(m.Utc ? `${m.Utc.replace(/Z?$/, "Z")}` : undefined, { second: "2-digit" })}</span>
          {m.Lap ? <span>· Lap {m.Lap}</span> : null}
          {m.Scope === "Sector" && m.Sector ? <span>· Sector {m.Sector}</span> : null}
          {driver && (
            <span className="flex items-center gap-1">
              · <TeamBar colour={driver.colour} className="h-3" /> <b className="font-display">{driver.tla}</b>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// The newest message, shown over the map for a few minutes after it arrives.
export function LatestMessageBanner() {
  const messages = useRaceControl();
  const { feedNow } = useLive();
  const now = useNow(5000);
  const latest = messages.at(-1);
  const age = latest?.Utc && now != null ? feedNow() - Date.parse(latest.Utc.replace(/Z?$/, "Z")) : Infinity;
  const swatch = latest ? flagSwatch(latest) : null;
  return (
    <AnimatePresence>
      {latest && age < 3 * 60_000 && (
        <motion.div
          key={`${latest.Utc}-${latest.Message}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl border border-line bg-surface/90 px-3 py-2 shadow-card backdrop-blur"
        >
          <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-md border border-line" style={swatch ? { background: swatch.bg } : undefined}>
            {!swatch && <Flag size={13} className="text-faint" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-wider text-faint uppercase">Race control{latest.Lap ? ` · Lap ${latest.Lap}` : ""}</p>
            <p className="truncate text-sm font-semibold">{latest.Message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
