"use client";

import { useEffect, useRef, useState } from "react";
import { applyUpdate, type ConnectionInfo, type LiveUpdate, type Topics } from "./live";

const RENDER_INTERVAL_MS = 250;
const MAX_TRACE_POINTS = 4000;

export type TracePoint = { x: number; y: number };

// Subscribes to the server's live stream. Updates are buffered and rendered at
// most every 250ms, since the feed can send dozens of messages per second.
export function useLiveTiming() {
  const [topics, setTopics] = useState<Topics>({});
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [streamOpen, setStreamOpen] = useState(false);
  // Path of one car, used to draw the track outline as positions arrive. A new
  // segment starts whenever the traced car changes, to avoid lines across the map.
  const [trace, setTrace] = useState<TracePoint[][]>([]);
  const traceCar = useRef<string | null>(null);
  const traceRef = useRef<TracePoint[][]>([]);
  const pending = useRef<{ snapshot: Topics | null; updates: LiveUpdate[] }>({ snapshot: null, updates: [] });

  useEffect(() => {
    const source = new EventSource("/api/live/stream");
    source.onopen = () => setStreamOpen(true);
    source.onerror = () => setStreamOpen(false);
    source.addEventListener("connection", (e) => setConnection(JSON.parse((e as MessageEvent).data)));
    source.addEventListener("snapshot", (e) => {
      pending.current = { snapshot: JSON.parse((e as MessageEvent).data).topics ?? {}, updates: [] };
    });
    source.addEventListener("update", (e) => {
      pending.current.updates.push(JSON.parse((e as MessageEvent).data));
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

  return { topics, connection, streamOpen, trace };
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
