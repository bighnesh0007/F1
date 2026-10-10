// Browser-side mirror of the server's live timing state (see server/src/state.js).
// Lists are objects keyed by index, so use `list()` to read them as arrays.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Topics = Record<string, any>;

export type ConnectionInfo = {
  status: "connecting" | "connected" | "disconnected";
  authenticated: boolean;
  lastMessageAt: string | null;
  lastError: string | null;
};

export type LiveUpdate = { topic: string; data: any; replace: boolean; ts?: string };

export type LiveEvent = {
  type: "overtake" | "pitIn" | "pitOut" | "fastestLap" | "retired" | "trackStatus" | "sessionStatus" | "raceControl" | "radio";
  ts: string;
  driver?: string;
  passed?: string;
  position?: number;
  lap?: number;
  time?: string;
  compound?: string;
  newTyres?: boolean;
  change?: number | null;
  stops?: number;
  status?: string;
  message?: string;
  category?: string;
  flag?: string | null;
  path?: string;
  session?: string;
};

export type LapEntry = {
  lap: number;
  time: string | null;
  position: number | null;
  gap: string | null;
  interval: string | null;
  sectors: (string | null)[];
  compound: string | null;
  pit: boolean;
  ts: string;
};

export type CarProgress = { p?: number; pMax?: number; t?: number; lapMs?: number; pit?: boolean; out?: boolean };

const isObject = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);

export function deepMerge(target: any, patch: any): any {
  if (!isObject(patch)) return patch;
  const base = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "_deleted" && Array.isArray(value)) {
      for (const k of value) delete base[k];
      continue;
    }
    base[key] = isObject(value) ? deepMerge(base[key], value) : value;
  }
  return base;
}

export function applyUpdate(topics: Topics, update: LiveUpdate): Topics {
  return {
    ...topics,
    [update.topic]: update.replace ? update.data : deepMerge(topics[update.topic], update.data),
  };
}

export function list<T = any>(value: unknown): T[] {
  if (!isObject(value)) return [];
  return Object.keys(value)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => value[k] as T);
}

export function isRaceSession(topics: Topics) {
  const type = topics.SessionInfo?.Type ?? "";
  return type === "Race" || /sprint$/i.test(topics.SessionInfo?.Name ?? "");
}

export const TRACK_STATUS: Record<string, { label: string; tone: "green" | "yellow" | "red" | "sc" }> = {
  "1": { label: "Green flag", tone: "green" },
  "2": { label: "Yellow flag", tone: "yellow" },
  "4": { label: "Safety car", tone: "sc" },
  "5": { label: "Red flag", tone: "red" },
  "6": { label: "Virtual safety car", tone: "sc" },
  "7": { label: "VSC ending", tone: "sc" },
};

export const TYRES: Record<string, { short: string; color: string; name: string }> = {
  SOFT: { short: "S", color: "#ef4444", name: "Soft" },
  MEDIUM: { short: "M", color: "#eab308", name: "Medium" },
  HARD: { short: "H", color: "#e5e5e5", name: "Hard" },
  INTERMEDIATE: { short: "I", color: "#22c55e", name: "Intermediate" },
  WET: { short: "W", color: "#3b82f6", name: "Wet" },
};

export const LIVETIMING_STATIC = "https://livetiming.formula1.com/static/";

// The live view is shown while a session is running, and for a while after it.
export function sessionIsActive(topics: Topics, connection: ConnectionInfo | null) {
  if (!topics.SessionInfo || connection?.status !== "connected") return false;
  const status = topics.SessionStatus?.Status;
  const end = Date.parse(topics.SessionInfo.EndDate ? `${topics.SessionInfo.EndDate}Z` : "");
  const offsetMs = parseOffset(topics.SessionInfo.GmtOffset);
  const endUtc = isNaN(end) ? null : end - offsetMs;
  if (["Started", "Aborted", "Inactive", "Suspended"].includes(status)) {
    return endUtc == null || Date.now() < endUtc + 2 * 3600_000;
  }
  // Finished sessions stay up for an hour so the final classification can be read.
  return endUtc != null && Date.now() < endUtc + 3600_000;
}

function parseOffset(gmtOffset = "00:00:00") {
  const negative = String(gmtOffset).startsWith("-");
  const [h, m] = String(gmtOffset).replace("-", "").split(":").map(Number);
  return (negative ? -1 : 1) * ((h || 0) * 60 + (m || 0)) * 60_000;
}
