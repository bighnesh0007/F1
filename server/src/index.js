import express from 'express';
import cors from 'cors';
import compression from 'compression';
import * as jolpica from './jolpica.js';
import * as f1static from './f1static.js';
import { getCircuitMap } from './maps.js';
import { LiveTimingClient } from './livetiming.js';
import { connectRedis } from './db/redis.js';
import { connectMongo, mongoReady } from './db/mongo.js';
import { authMiddleware, authRouter, clerkConfigured, loadUser, requireJson, requireUser } from './auth.js';
import { profileRouter } from './profile.js';
import { gameRouter, startScoringJob } from './game.js';
import { calendarRouter } from './calendar.js';
import { logCrashes, observeRouter, requestLog } from './observe.js';
import { pushRouter, startPushNotifications } from './push.js';
import { startTranscripts } from './transcribe.js';
import { chatRouter, startChat } from './chat.js';
import { pollsRouter } from './polls.js';
import { fantasyRouter } from './fantasy.js';
import { getQuiz, quizRouter } from './quiz.js';
import { socialRouter } from './social.js';

const PORT = Number(process.env.PORT) || 4000;
const app = express();
const live = new LiveTimingClient();

logCrashes();
app.set('trust proxy', true);
app.use(requestLog());
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '100kb' }));
app.use(requireJson);
// Compress JSON, but never the live event stream (it must flush immediately).
app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));

// Wraps an async handler for public data: JSON response with a short browser cache,
// or a 502 with the upstream error.
const route = (handler) => async (req, res) => {
  try {
    const data = await handler(req);
    if (data == null) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    res.json(data);
  } catch (err) {
    console.error(`${req.path}:`, err.message);
    res.status(err.status === 400 ? 400 : 502).json({ error: err.message });
  }
};

const year = (req) => (/^\d{4}$/.test(req.query.year ?? '') ? Number(req.query.year) : 'current');

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    live: live.info(),
    accounts: mongoReady(),
    clerk: clerkConfigured(),
  });
});

app.use('/api', observeRouter());

// --- Accounts, profiles, game, calendar ------------------------------------------------

app.use('/api', authMiddleware(), loadUser);
app.use('/api/auth', authRouter());
app.use('/api', profileRouter(requireUser));
app.use('/api/game/fantasy', fantasyRouter(requireUser));
app.use('/api/game/quiz', quizRouter(requireUser));
app.use('/api/game', gameRouter(requireUser));
app.use('/api/chat', chatRouter(requireUser));
app.use('/api/polls', pollsRouter(live));
app.use('/api', socialRouter(requireUser, live));
app.use('/api/calendar', calendarRouter(requireUser));
app.use('/api/push', pushRouter());

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

// Errors from the account routes: JSON with the right status.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const upstream = err.message === 'fetch failed' || /^\d{3} from /.test(err.message);
  const status = err.status && !upstream ? err.status : upstream ? 502 : err.type === 'entity.parse.failed' ? 400 : 500;
  if (status >= 500) console.error(`${req.method} ${req.path}:`, err);
  const message = upstream ? 'F1 data is temporarily unavailable' : status >= 500 && !err.status ? 'Something went wrong' : err.message;
  res.status(status).json({ error: message });
});

await connectRedis();
await connectMongo();
if (mongoReady()) startScoringJob();
startPushNotifications(live);
startTranscripts(live);
await startChat();
// Fetch the world champions list in the background (one request per season).
setTimeout(() => jolpica.warmChampions(), 5000).unref();
// Prepare this week's quiz in the background (it reads several seasons of results).
setTimeout(() => getQuiz().catch(() => {}), 15_000).unref();

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
