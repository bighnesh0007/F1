// Request timing, crash logging and reports from browsers (errors and Web Vitals), so
// problems show up once real people use the app.
//
// Every slow (> SLOW_MS) or failed request is logged. GET /api/health/metrics returns
// response times per route, browser page-speed numbers and recent browser errors; it
// needs METRICS_TOKEN (sent as "Authorization: Bearer <token>") and is off without it.
import crypto from 'node:crypto';
import express from 'express';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;
const SAMPLES = 200;
const routes = new Map(); // "GET /api/race" -> { count, errors, samples[] }
const vitals = new Map(); // "LCP" -> samples[]
const clientErrors = []; // newest last
const started = Date.now();

const json = process.env.LOG_FORMAT === 'json';
export function log(level, message, fields = {}) {
  if (json) console[level === 'error' ? 'error' : 'log'](JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));
  else console[level === 'error' ? 'error' : 'log'](`[${level}] ${message}`, Object.keys(fields).length ? fields : '');
}

function push(list, value, max = SAMPLES) {
  list.push(value);
  if (list.length > max) list.shift();
}

// Groups /api/race/2024/5 as /api/race so the table stays small.
const routeKey = (req) => `${req.method} ${req.originalUrl.split('?')[0].split('/').slice(0, 3).join('/')}`;

export function requestLog() {
  return (req, res, next) => {
    if (req.path === '/api/live/stream') return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const key = routeKey(req);
      const r = routes.get(key) ?? { count: 0, errors: 0, samples: [] };
      r.count++;
      if (res.statusCode >= 500) r.errors++;
      push(r.samples, ms);
      routes.set(key, r);
      if (ms > SLOW_MS || res.statusCode >= 500 || process.env.LOG_REQUESTS === '1') {
        log(res.statusCode >= 500 ? 'error' : ms > SLOW_MS ? 'warn' : 'info', `${req.method} ${req.originalUrl} ${res.statusCode}`, { ms: Math.round(ms) });
      }
    });
    next();
  };
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 100) / 100;
};

// Small per-IP limit for browser reports.
const buckets = new Map();
function allow(ip, perMinute = 30) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { at: now, n: 0 };
  if (now - b.at > 60_000) Object.assign(b, { at: now, n: 0 });
  b.n++;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n <= perMinute;
}

const VITALS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const clip = (v, n) => String(v ?? '').slice(0, n);

export function observeRouter() {
  const router = express.Router();

  router.post('/report', (req, res) => {
    if (!allow(req.ip)) return res.status(429).end();
    const b = req.body ?? {};
    if (b.kind === 'vital' && VITALS.has(b.name) && Number.isFinite(b.value)) {
      const list = vitals.get(b.name) ?? [];
      push(list, b.value, 500);
      vitals.set(b.name, list);
    } else if (b.kind === 'error') {
      const entry = { time: new Date().toISOString(), message: clip(b.message, 500), stack: clip(b.stack, 2000), page: clip(b.page, 200), userAgent: clip(req.get('user-agent'), 200) };
      push(clientErrors, entry, 50);
      log('error', `Browser error on ${entry.page}: ${entry.message}`);
    }
    res.status(204).end();
  });

  router.get('/health/metrics', (req, res) => {
    const token = process.env.METRICS_TOKEN;
    const given = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    const ok = token && given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1e6),
      routes: Object.fromEntries(
        [...routes].sort((a, b) => b[1].count - a[1].count).map(([k, r]) => [k, { count: r.count, errors: r.errors, p50: percentile(r.samples, 50), p95: percentile(r.samples, 95) }]),
      ),
      browser: Object.fromEntries([...vitals].map(([k, v]) => [k, { p75: percentile(v, 75), samples: v.length }])),
      browserErrors: clientErrors.slice(-20).reverse(),
    });
  });

  return router;
}

export function logCrashes() {
  process.on('unhandledRejection', (err) => log('error', 'Unhandled promise rejection', { error: String(err?.stack ?? err) }));
  process.on('uncaughtException', (err) => {
    log('error', 'Uncaught exception', { error: String(err?.stack ?? err) });
    process.exit(1);
  });
}
