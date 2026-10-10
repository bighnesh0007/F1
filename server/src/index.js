import express from 'express';
import cors from 'cors';
import { getCurrentWeekend } from './openf1.js';

const PORT = Number(process.env.PORT) || 4000;
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`F1 server listening on http://localhost:${PORT}`);
});
