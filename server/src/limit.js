// Small in-memory rate limiter: allow(key, max, windowMs) -> boolean.
const buckets = new Map();

export function allow(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.at > windowMs) {
    buckets.set(key, { at: now, n: 1 });
    if (buckets.size > 20_000) for (const [k, v] of buckets) if (now - v.at > 3_600_000) buckets.delete(k);
    return true;
  }
  b.n++;
  return b.n <= max;
}
