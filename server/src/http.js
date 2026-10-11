// Small fetch helpers: JSON with a two-level cache (process memory, then Redis so
// data survives restarts and is shared between server instances) and request
// de-duplication.
import { redis } from './db/redis.js';

const cache = new Map();
const MAX_MEMORY_ENTRIES = 300;
// Redis keeps entries well past their freshness so stale data can be served when a
// source is down.
const STALE_KEEP_SECONDS = 14 * 24 * 3600;
const inflight = new Map();

// "fetch failed" on its own says nothing; add the host and the network reason
// (e.g. ENETUNREACH, ECONNREFUSED, a timeout) so problems can be diagnosed from logs.
export function describeFetchError(err, url) {
  const cause = err?.cause;
  const reason = cause?.code ?? cause?.errors?.map((e) => e.code).filter(Boolean).join('/') ?? (err?.name === 'TimeoutError' ? 'timed out' : null);
  if (err?.message === 'fetch failed' || err?.name === 'TimeoutError') {
    const e = new Error(`fetch failed: ${new URL(url).host}${reason ? ` (${reason})` : ''}`);
    e.cause = cause;
    return e;
  }
  return err;
}

export async function fetchText(url, { headers = {}, timeoutMs = 20_000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'f1-live/1.0', ...headers }, signal: AbortSignal.timeout(timeoutMs) }).catch((err) => {
    throw describeFetchError(err, url);
  });
  if (!res.ok) {
    const err = new Error(`${res.status} from ${new URL(url).host}${new URL(url).pathname}`);
    err.status = res.status;
    throw err;
  }
  // F1's static files start with a UTF-8 byte order mark.
  return (await res.text()).replace(/^\uFEFF/, '');
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

// Runs `load` at most once per `ttlMs` for a key; concurrent callers share the request.
export async function cached(key, ttlMs, load) {
  let hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const r = redis();
    if (r && !hit) {
      try {
        const stored = await r.get(`cache:${key}`);
        if (stored) {
          hit = JSON.parse(stored);
          remember(key, hit);
          if (Date.now() - hit.at < ttlMs) return hit.value;
        }
      } catch {
        // Redis hiccup: fall through to the source
      }
    }
    try {
      const value = await load();
      const entry = { at: Date.now(), value };
      remember(key, entry);
      if (r && value != null) r.set(`cache:${key}`, JSON.stringify(entry), { EX: STALE_KEEP_SECONDS }).catch(() => {});
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

function remember(key, entry) {
  cache.delete(key);
  cache.set(key, entry);
  // Keep memory bounded (replays can be a few MB each): drop the oldest entries.
  while (cache.size > MAX_MEMORY_ENTRIES) cache.delete(cache.keys().next().value);
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
