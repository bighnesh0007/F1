// Web push notifications to phones and desktops, even with the app closed:
//  - a session is about to start (15 minutes before),
//  - safety car, virtual safety car and red flag,
//  - your favourite driver pits.
//
// Needs VAPID keys (generate once with `npx web-push generate-vapid-keys`) in
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, and VAPID_SUBJECT (a mailto: or https: URL).
// Subscriptions are anonymous (no sign-in needed) and stored in MongoDB, or in memory
// when there is no database.
import express from 'express';
import webpush from 'web-push';
import { mongo, mongoReady } from './db/mongo.js';
import * as jolpica from './jolpica.js';
import { log } from './observe.js';

// Only real browser push services, so the server can't be made to call other hosts.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)web\.push\.apple\.com$/];
const REMINDER_MINUTES = 15;

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

// --- Storage ----------------------------------------------------------------------------

const memory = new Map();
const store = {
  async save(sub) {
    if (mongoReady()) await mongo().collection('pushSubscriptions').updateOne({ endpoint: sub.endpoint }, { $set: sub, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    else memory.set(sub.endpoint, sub);
  },
  async remove(endpoint) {
    if (mongoReady()) await mongo().collection('pushSubscriptions').deleteOne({ endpoint });
    else memory.delete(endpoint);
  },
  async find(filter) {
    if (mongoReady()) return mongo().collection('pushSubscriptions').find(filter).toArray();
    return [...memory.values()].filter((s) => Object.entries(filter).every(([k, v]) => k.split('.').reduce((o, p) => o?.[p], s) === v));
  },
};

// --- Sending ------------------------------------------------------------------------------

let sender = (sub, body, options) => webpush.sendNotification(sub, body, options);
export const setSender = (fn) => (sender = fn); // for tests

const sent = new Map(); // tag -> time, so one moment isn't announced twice
function once(tag) {
  const now = Date.now();
  for (const [k, t] of sent) if (now - t > 6 * 3600_000) sent.delete(k);
  if (sent.has(tag)) return false;
  sent.set(tag, now);
  return true;
}

export async function notify(filter, payload) {
  if (!pushConfigured() && sender === webpush.sendNotification) return 0;
  const subs = await store.find(filter).catch(() => []);
  let delivered = 0;
  const body = JSON.stringify(payload);
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(
      subs.slice(i, i + 20).map(async (s) => {
        try {
          await sender({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 900, urgency: 'high', topic: payload.tag?.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') });
          delivered++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) await store.remove(s.endpoint).catch(() => {});
          else log('warn', `Push failed: ${err.statusCode ?? ''} ${err.message}`);
        }
      }),
    );
  }
  return delivered;
}

// Turns live race events into notifications.
export function notificationsFor(event, topics) {
  const session = topics.SessionInfo?.Path ?? '';
  const where = topics.SessionInfo?.Meeting?.Name ?? 'F1';
  const out = [];
  if (event.type === 'trackStatus') {
    const kind = { 4: ['Safety car', 'The safety car is out'], 5: ['Red flag', 'The session is suspended'], 6: ['Virtual safety car', 'VSC deployed'] }[event.status];
    if (kind) out.push({ filter: { 'prefs.flags': true }, payload: { title: `${kind[0]} · ${where}`, body: kind[1], tag: `${session}:${event.status}:${event.ts}`, url: '/live' } });
  }
  if (event.type === 'pitIn' && event.driver) {
    const tla = topics.DriverList?.[event.driver]?.Tla ?? `Car ${event.driver}`;
    out.push({
      filter: { 'prefs.driver': String(event.driver) },
      payload: { title: `${tla} is in the pits`, body: `${where}${event.lap ? ` · lap ${event.lap}` : ''}${event.position ? ` · was P${event.position}` : ''}`, tag: `${session}:pit:${event.driver}:${event.ts}`, url: '/live' },
    });
  }
  return out;
}

export function startPushNotifications(live) {
  if (!pushConfigured()) {
    console.log('Push: VAPID keys not set, phone notifications are disabled');
    return;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  live.on('update', (update) => {
    if (update.topic !== 'Events') return;
    for (const event of Object.values(update.data ?? {})) {
      for (const n of notificationsFor(event, live.state.topics)) if (once(n.payload.tag)) notify(n.filter, n.payload).catch(() => {});
    }
  });

  // Reminders shortly before each session of the weekend.
  setInterval(async () => {
    const schedule = await jolpica.getSchedule('current').catch(() => []);
    const now = Date.now();
    for (const race of schedule) {
      for (const s of race.sessions ?? []) {
        const inMin = (Date.parse(s.start) - now) / 60_000;
        if (inMin > REMINDER_MINUTES - 1 && inMin <= REMINDER_MINUTES && once(`start:${race.season}:${race.round}:${s.key}`)) {
          notify({ 'prefs.sessions': true }, { title: `${s.name} starts in ${REMINDER_MINUTES} minutes`, body: race.name, tag: `start:${race.round}:${s.key}`, url: '/live' }).catch(() => {});
        }
      }
    }
  }, 60_000).unref();
  console.log('Push: notifications enabled');
}

// --- Routes ---------------------------------------------------------------------------------

export function pushRouter() {
  const router = express.Router();
  router.get('/key', (_req, res) => res.json({ key: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null }));
  router.post('/subscribe', async (req, res) => {
    if (!pushConfigured()) return res.status(503).json({ error: 'Notifications are not set up on this server' });
    const { subscription, prefs = {} } = req.body ?? {};
    const endpoint = subscription?.endpoint;
    const keys = subscription?.keys;
    if (!validEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
      return res.status(400).json({ error: 'That subscription is not valid' });
    }
    await store.save({
      endpoint,
      keys: { p256dh: keys.p256dh.slice(0, 200), auth: keys.auth.slice(0, 100) },
      prefs: { sessions: Boolean(prefs.sessions), flags: Boolean(prefs.flags), driver: /^\d{1,2}$/.test(String(prefs.driver ?? '')) ? String(prefs.driver) : null },
      userId: req.user?._id ?? null,
      updatedAt: new Date(),
    });
    res.json({ ok: true });
  });
  router.post('/unsubscribe', async (req, res) => {
    if (typeof req.body?.endpoint === 'string') await store.remove(req.body.endpoint);
    res.json({ ok: true });
  });
  return router;
}
