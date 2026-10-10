import express from 'express';
import cors from 'cors';
import { getCurrentWeekend } from './openf1.js';
import { getStandings } from './jolpica.js';
import { LiveTimingClient } from './livetiming.js';

const PORT = Number(process.env.PORT) || 4000;
const app = express();
const live = new LiveTimingClient();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), live: live.info() });
});

app.get('/api/weekend', async (_req, res) => {
  try {
    const weekend = await getCurrentWeekend();
    if (!weekend) return res.status(404).json({ error: 'No upcoming race weekend found' });
    res.json(weekend);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to load data from OpenF1', detail: err.message });
  }
});

app.get('/api/standings', async (_req, res) => {
  try {
    res.json(await getStandings());
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Failed to load standings', detail: err.message });
  }
});

app.get('/api/live/state', (_req, res) => {
  res.json({ ...live.state.snapshot(), connection: live.info() });
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
  send('snapshot', live.state.snapshot());

  const onSnapshot = (snap) => send('snapshot', snap);
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
