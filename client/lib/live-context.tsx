"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyUpdate, list, type ConnectionInfo, type LiveEvent, type LiveUpdate, type Topics } from "./live";

const RENDER_INTERVAL_MS = 250;
const MAX_TRACE_POINTS = 4000;

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
};

const LiveContext = createContext<LiveCtx | null>(null);

// One live connection for the whole app. Updates are buffered and rendered at most
// every 250ms, since the feed can send dozens of messages per second.
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [topics, setTopics] = useState<Topics>({});
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [streamOpen, setStreamOpen] = useState(false);
  const [trace, setTrace] = useState<TracePoint[][]>([]);
  const pending = useRef<{ snapshot: Topics | null; updates: LiveUpdate[] }>({ snapshot: null, updates: [] });
  const listeners = useRef(new Set<(event: LiveEvent) => void>());
  const offset = useRef<number | null>(null);
  const traceCar = useRef<string | null>(null);
  const traceRef = useRef<TracePoint[][]>([]);

  useEffect(() => {
    const source = new EventSource("/api/live/stream");
    source.onopen = () => setStreamOpen(true);
    source.onerror = () => setStreamOpen(false);
    source.addEventListener("connection", (e) => setConnection(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("snapshot", (e) => {
      const snap = JSON.parse((e as MessageEvent).data);
      pending.current = { snapshot: snap.topics ?? {}, updates: [] };
      traceRef.current = [];
      traceCar.current = null;
    });
    source.addEventListener("update", (e) => {
      const update: LiveUpdate = JSON.parse((e as MessageEvent).data);
      pending.current.updates.push(update);
      // Track the feed clock: the newest timestamp is roughly "now" on the feed.
      if (update.ts) {
        const candidate = Date.parse(update.ts) - Date.now();
        offset.current = offset.current == null || candidate > offset.current ? candidate : offset.current * 0.995 + candidate * 0.005;
      }
      if (update.topic === "Events") for (const ev of list<LiveEvent>(update.data)) listeners.current.forEach((l) => l(ev));
    });

    const timer = setInterval(() => {
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

    return () => {
      clearInterval(timer);
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

  const value = useMemo(
    () => ({ topics, connection, streamOpen, trace, feedNow, onEvent }),
    [topics, connection, streamOpen, trace, feedNow, onEvent],
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
