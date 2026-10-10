"use client";

import { createContext, createElement, useContext, useEffect, useState } from "react";

// Tiny data hook for the server's JSON API (through the /api proxy). Responses are
// cached per path for the page's lifetime, and refetched in the background.
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function load(path: string) {
  if (inflight.has(path)) return inflight.get(path);
  const promise = fetch(path)
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      cache.set(path, { at: Date.now(), data: body });
      return body;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}

// Data fetched on the server while rendering the page, so the first paint already
// has it (no loading skeleton, no extra request).
const SeedContext = createContext<Record<string, unknown>>({});

export function ApiSeed({ data, children }: { data: Record<string, unknown>; children: React.ReactNode }) {
  const parent = useContext(SeedContext);
  return createElement(SeedContext.Provider, { value: { ...parent, ...data } }, children);
}

export function useApi<T>(
  path: string | null,
  {
    refreshMs,
    refreshWhile,
    keepPrevious,
  }: {
    refreshMs?: number;
    refreshWhile?: (data: T | null) => boolean;
    /** Keep showing the previous path's data while the new path loads (e.g. after a save). */
    keepPrevious?: boolean;
  } = {},
) {
  const seed = useContext(SeedContext);
  const seeded = path != null && seed[path] != null ? (seed[path] as T) : null;
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>(() => {
    if (path && seeded != null && !cache.has(path)) cache.set(path, { at: Date.now(), data: seeded });
    return { path, data: path ? ((cache.get(path)?.data as T) ?? seeded) : null, error: null };
  });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const run = () =>
      load(path)
        .then((data) => !cancelled && setState({ path, data: data as T, error: null }))
        .catch((err) => {
          if (cancelled) return;
          setState((s) => ({ path, data: s.path === path ? s.data : null, error: err.message }));
          retry = setTimeout(run, 20_000);
        });
    const hit = cache.get(path);
    if (!hit || Date.now() - hit.at > 30_000) run();
    else setTimeout(() => !cancelled && setState({ path, data: hit.data as T, error: null }), 0);
    // Refresh on an interval; with refreshWhile, only while it returns true for the latest data.
    const timer = refreshMs
      ? setInterval(() => {
          if (refreshWhile && !refreshWhile((cache.get(path)?.data as T) ?? null)) return;
          cache.delete(path);
          run();
        }, refreshMs)
      : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (retry) clearTimeout(retry);
    };
    // refreshWhile should be a pure check on the data; a new function each render needn't restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refreshMs]);

  const current = state.path === path ? state : { data: keepPrevious ? state.data : null, error: null };
  return { data: current.data, error: current.error, loading: Boolean(path) && !current.data && !current.error };
}
