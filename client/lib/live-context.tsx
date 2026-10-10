"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyUpdate, list, type ConnectionInfo, type LiveEvent, type LiveUpdate, type Topics } from "./live";

const RENDER_INTERVAL_MS = 250;
const MAX_TRACE_POINTS = 4000;
// The last live state is kept on the device so it can be shown when the connection drops.
const SAVED_KEY = "f1live.lastLive";
const SAVE_INTERVAL_MS = 10_000;
const SAVED_MAX_AGE_MS = 6 * 3600_000;
const SKIP_SAVING = new Set(["Position", "CarData", "CarProgress", "Heartbeat"]);

type Saved = { savedAt: number; topics: Topics; connection: ConnectionInfo | null };

function loadSaved(): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as Saved | null;
    return saved && Date.now() - saved.savedAt < SAVED_MAX_AGE_MS ? saved : null;
  } catch {
    return null;
  }
}

function save(topics: Topics, connection: ConnectionInfo | null) {
  if (!topics.SessionInfo) return;
  try {
    const slim = Object.fromEntries(Object.entries(topics).filter(([k]) => !SKIP_SAVING.has(k)));
    localStorage.setItem(SAVED_KEY, JSON.stringify({ savedAt: Date.now(), topics: slim, connection }));
  } catch {
    // Storage full or blocked: offline mode just won't have data.
  }
}

export type TracePoint = { x: number; y: number };

type LiveCtx = {
  topics: Topics;
  connection: ConnectionInfo | null;
  streamOpen: boolean;
  /** Outline traced from real car positions (only with an F1 TV token). */
  trace: TracePoint[][];
  /** Feed clock: Date.now() + offset ≈ the F1 timing clock. */
  feedNow: () => number;
  /** Called for events that happen while the page is open (not history). */
  onEvent: (listener: (event: LiveEvent) => void) => () => void;
  /** When the shown data is from an earlier visit or a dropped connection: the time it was last live. */
  staleSince: number | null;
};

const LiveContext = createContext<LiveCtx | null>(null);

// One live connection for the whole app. Updates are buffered and rendered at most
// every 250ms, since the feed can send dozens of messages per second.
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [topics, setTopics] = useState<Topics>({});
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [streamOpen, setStreamOpen] = useState(false);
  const [trace, setTrace] = useState<TracePoint[][]>([]);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const lastLiveAt = useRef<number | null>(null);
  const latest = useRef<{ topics: Topics; connection: ConnectionInfo | null }>({ topics: {}, connection: null });
  const pending = useRef<{ snapshot: Topics | null; updates: LiveUpdate[] }>({ snapshot: null, updates: [] });
  const listeners = useRef(new Set<(event: LiveEvent) => void>());
  const offset = useRef<number | null>(null);
  const traceCar = useRef<string | null>(null);
  const traceRef = useRef<TracePoint[][]>([]);

  useEffect(() => {
    // Until the stream answers, show what was saved last time (if recent).
    let restored = loadSaved();
    if (restored) pending.current = { snapshot: restored.topics, updates: [] };
    const goneStale = () => setStaleSince((prev) => prev ?? lastLiveAt.current ?? Date.now());

    const source = new EventSource("/api/live/stream");
    source.onopen = () => setStreamOpen(true);
    source.onerror = () => {
      setStreamOpen(false);
      goneStale();
    };
    const onOffline = () => goneStale();
    window.addEventListener("offline", onOffline);
    source.addEventListener("connection", (e) => setConnection(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("snapshot", (e) => {
      setStaleSince(null);
      lastLiveAt.current = Date.now();
      const snap = JSON.parse((e as MessageEvent).data);
      pending.current = { snapshot: snap.topics ?? {}, updates: [] };
      traceRef.current = [];
      traceCar.current = null;
    });
    source.addEventListener("update", (e) => {
      const update: LiveUpdate = JSON.parse((e as MessageEvent).data);
      pending.current.updates.push(update);
      lastLiveAt.current = Date.now();
      // Track the feed clock: the newest timestamp is roughly "now" on the feed.
      if (update.ts) {
        const candidate = Date.parse(update.ts) - Date.now();
        offset.current = offset.current == null || candidate > offset.current ? candidate : offset.current * 0.995 + candidate * 0.005;
      }
      if (update.topic === "Events") for (const ev of list<LiveEvent>(update.data)) listeners.current.forEach((l) => l(ev));
    });

    const timer = setInterval(() => {
      if (restored) {
        if (!lastLiveAt.current) {
          setConnection(restored.connection);
          setStaleSince(restored.savedAt);
        }
        restored = null;
      }
      const { snapshot, updates } = pending.current;
      if (!snapshot && updates.length === 0) return;
      pending.current = { snapshot: null, updates: [] };
      setTopics((prev) => updates.reduce(applyUpdate, snapshot ?? prev));

      const samples = updates.filter((u) => u.topic === "Position").map((u) => u.data);
      if (samples.length > 0) {
        const segments = traceRef.current;
        for (const sample of samples) {
          const entries: Record<string, CarPosition> = sample?.Entries ?? {};
          if (!isMoving(entries[traceCar.current ?? ""])) {
            traceCar.current = Object.keys(entries).find((n) => isMoving(entries[n])) ?? null;
            if (!traceCar.current) continue;
            segments.push([]);
          }
          const p = entries[traceCar.current!];
          segments[segments.length - 1].push({ x: p.X, y: p.Y });
        }
        traceRef.current = trimTrace(segments);
        setTrace(traceRef.current.map((segment) => [...segment]));
      }
    }, RENDER_INTERVAL_MS);

    const saver = setInterval(() => {
      if (lastLiveAt.current && Date.now() - lastLiveAt.current < SAVE_INTERVAL_MS * 2) save(latest.current.topics, latest.current.connection);
    }, SAVE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      clearInterval(saver);
      window.removeEventListener("offline", onOffline);
      source.close();
    };
  }, []);

  const feedNow = useCallback(() => Date.now() + (offset.current ?? 0), []);
  const onEvent = useCallback((listener: (event: LiveEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    latest.current = { topics, connection };
  }, [topics, connection]);

  const value = useMemo(
    () => ({ topics, connection, streamOpen, trace, feedNow, onEvent, staleSince }),
    [topics, connection, streamOpen, trace, feedNow, onEvent, staleSince],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside LiveProvider");
  return ctx;
}

type CarPosition = { X: number; Y: number; Status?: string };

function isMoving(p?: CarPosition) {
  return Boolean(p) && p!.Status === "OnTrack" && (p!.X !== 0 || p!.Y !== 0);
}

function trimTrace(segments: TracePoint[][]) {
  let total = segments.reduce((n, s) => n + s.length, 0);
  const out = segments.filter((s, i) => s.length > 0 || i === segments.length - 1);
  while (total > MAX_TRACE_POINTS && out.length > 1) total -= out.shift()!.length;
  return out;
}
