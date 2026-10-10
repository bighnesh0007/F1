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

export type LiveUpdate = { topic: string; data: any; replace: boolean };

const isObject = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

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

export const TRACK_STATUS: Record<string, { label: string; className: string }> = {
  "1": { label: "Green flag", className: "bg-green-600 text-white" },
  "2": { label: "Yellow flag", className: "bg-yellow-400 text-black" },
  "4": { label: "Safety car", className: "bg-yellow-400 text-black" },
  "5": { label: "Red flag", className: "bg-red-600 text-white" },
  "6": { label: "Virtual safety car", className: "bg-yellow-400 text-black" },
  "7": { label: "VSC ending", className: "bg-yellow-300 text-black" },
};

export const TYRES: Record<string, { short: string; className: string }> = {
  SOFT: { short: "S", className: "border-red-500 text-red-400" },
  MEDIUM: { short: "M", className: "border-yellow-400 text-yellow-300" },
  HARD: { short: "H", className: "border-neutral-200 text-neutral-100" },
  INTERMEDIATE: { short: "I", className: "border-green-500 text-green-400" },
  WET: { short: "W", className: "border-blue-500 text-blue-400" },
};

export const LIVETIMING_STATIC = "https://livetiming.formula1.com/static/";
