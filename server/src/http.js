// Small fetch helpers: JSON with an in-memory TTL cache and request de-duplication.
const cache = new Map();
const inflight = new Map();

export async function fetchText(url, { headers = {}, timeoutMs = 20_000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'f1-live/1.0', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const err = new Error(`${res.status} from ${new URL(url).host}${new URL(url).pathname}`);
    err.status = res.status;
    throw err;
  }
  // F1's static files start with a UTF-8 byte order mark.
  return (await res.text()).replace(/^﻿/, '');
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

// Runs `load` at most once per `ttlMs` for a key; concurrent callers share the request.
export async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await load();
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      // Serve stale data rather than nothing when a source has a hiccup.
      if (hit) return hit.value;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
