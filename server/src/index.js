import express from 'express';
import cors from 'cors';
import compression from 'compression';
import * as jolpica from './jolpica.js';
import * as f1static from './f1static.js';
import { getCircuitMap } from './maps.js';
import { LiveTimingClient } from './livetiming.js';

const PORT = Number(process.env.PORT) || 4000;
const app = express();
const live = new LiveTimingClient();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Compress JSON, but never the live event stream (it must flush immediately).
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/live/stream') && compression.filter(req, res) }));

// Wraps an async handler: JSON response, or a 502 with the upstream error.
const route = (handler) => async (req, res) => {
  try {
    const data = await handler(req);
    if (data == null) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error(`${req.path}:`, err.message);
    res.status(err.status === 400 ? 400 : 502).json({ error: err.message });
  }
};

const year = (req) => (/^\d{4}$/.test(req.query.year ?? '') ? Number(req.query.year) : 'current');

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), live: live.info() });
});

// --- Live -----------------------------------------------------------------------

app.get('/api/live/state', (_req, res) => {
  res.json({ ...live.state.snapshot(), connection: live.info(), serverTime: Date.now() });
});

// Server-Sent Events: a full snapshot on connect, then incremental updates.
app.get('/api/live/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('connection', live.info());
  send('snapshot', { ...live.state.snapshot(), serverTime: Date.now() });

  const onSnapshot = (snap) => send('snapshot', { ...snap, serverTime: Date.now() });
  const onUpdate = (update) => send('update', update);
  const onStatus = (info) => send('connection', info);
  live.on('snapshot', onSnapshot);
  live.on('update', onUpdate);
  live.on('status', onStatus);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    live.off('snapshot', onSnapshot);
    live.off('update', onUpdate);
    live.off('status', onStatus);
  });
});

// --- Schedule, results, standings (Jolpica) ----------------------------------------

app.get('/api/schedule', route((req) => jolpica.getSchedule(year(req))));
app.get('/api/standings', route((req) => jolpica.getStandings(year(req))));
app.get('/api/season-results', route((req) => jolpica.getSeasonResults(year(req))));
app.get('/api/records', route(() => jolpica.getRecords()));
app.get('/api/season-summary/:year', route((req) => jolpica.getSeasonSummary(Number(req.params.year))));
app.get('/api/race/:year/:round', route((req) => jolpica.getRace(Number(req.params.year), Number(req.params.round))));
app.get('/api/circuit-history/:circuitId', route((req) => jolpica.getCircuitHistory(req.params.circuitId)));

// The race weekend happening now, or the next one, plus the previous race.
app.get(
  '/api/weekend',
  route(async () => {
    const schedule = await jolpica.getSchedule('current');
    const now = Date.now();
    const raceEnd = (r) => Date.parse(r.date) + 3 * 3600_000;
    const index = schedule.findIndex((r) => raceEnd(r) >= now);
    const current = index >= 0 ? schedule[index] : null;
    const previous = index > 0 ? schedule[index - 1] : index === -1 ? schedule.at(-1) : null;
    const circuitKey = current ? await f1static.findCircuitKey(current.circuit).catch(() => null) : null;
    return {
      current: current ? { ...current, circuitKey } : null,
      previous,
      remaining: schedule.slice(Math.max(index, 0)),
      totalRounds: schedule.length,
    };
  }),
);

// --- F1 archive and maps --------------------------------------------------------------

app.get('/api/drivers', route(() => f1static.getLatestDrivers()));
app.get('/api/replay/sessions', route((req) => f1static.getArchivedSessions(year(req) === 'current' ? new Date().getUTCFullYear() : year(req))));
app.get('/api/replay', route((req) => f1static.getReplay(String(req.query.path ?? ''))));
app.get(
  '/api/circuit-map',
  route(async (req) => {
    let key = req.query.key ? Number(req.query.key) : null;
    if (!key && req.query.locality) {
      key = await f1static
        .findCircuitKey({ locality: req.query.locality, country: req.query.country, name: req.query.name })
        .catch(() => null);
    }
    return getCircuitMap({ key, location: req.query.locality ?? req.query.location, circuitId: req.query.circuitId });
  }),
);

const server = app.listen(PORT, () => {
  console.log(`F1 server listening on http://localhost:${PORT}`);
  live.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await live.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
