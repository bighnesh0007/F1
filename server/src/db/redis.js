// Redis: shared cache for upstream data, login sessions and the live session state.
// Optional: without REDIS_URL everything falls back to in-process memory.
import { createClient } from 'redis';

let client = null;
let ready = false;

export async function connectRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('Redis: REDIS_URL not set, using in-memory storage');
    return null;
  }
  client = createClient({ url, socket: { reconnectStrategy: (retries) => Math.min(retries * 500, 5000) } });
  client.on('error', (err) => {
    if (ready) console.error('Redis error:', err.message);
    ready = false;
  });
  client.on('ready', () => {
    ready = true;
    console.log('Redis: connected');
  });
  try {
    await client.connect();
  } catch (err) {
    console.error('Redis: could not connect, using in-memory storage until it is reachable:', err.message);
  }
  return client;
}

export const redis = () => (client && ready ? client : null);

// Minimal key-value API with an in-memory fallback (used for sessions, OAuth state, etc).
const memory = new Map();

export const kv = {
  async get(key) {
    const r = redis();
    if (r) return r.get(key);
    const hit = memory.get(key);
    if (!hit) return null;
    if (hit.expires && hit.expires < Date.now()) {
      memory.delete(key);
      return null;
    }
    return hit.value;
  },
  async set(key, value, ttlSeconds) {
    const r = redis();
    if (r) return ttlSeconds ? r.set(key, value, { EX: ttlSeconds }) : r.set(key, value);
    memory.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  },
  async del(key) {
    const r = redis();
    if (r) return r.del(key);
    memory.delete(key);
  },
};
