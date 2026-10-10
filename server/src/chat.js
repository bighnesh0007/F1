// Live chat during sessions: one room for everyone and one per team tribe.
// Messages go to MongoDB (kept 7 days) and out to browsers over Server-Sent Events.
// With Redis, messages are also shared between server instances (pub/sub).
//
// Signed-in users can post (2 s apart, 280 characters); anyone can read. Messages
// reported by 3 people are hidden; authors can delete their own.
import { EventEmitter } from 'node:events';
import express from 'express';
import { ObjectId } from 'mongodb';
import { mongo } from './db/mongo.js';
import { redis } from './db/redis.js';
import { HttpError } from './auth.js';
import { TEAMS } from './profile.js';
import { allow } from './limit.js';

const MAX_LENGTH = 280;
const HIDE_AFTER_REPORTS = 3;
const bus = new EventEmitter();
bus.setMaxListeners(0);
const CHANNEL = 'chat:events';
const instance = Math.random().toString(36).slice(2);

export const validRoom = (room) => room === 'everyone' || (room.startsWith('tribe-') && TEAMS.includes(room.slice(6)));

// A few words masked so the room stays friendly; not a full moderation system.
const BLOCKED = /\b(f+u+c+k+\w*|sh[i1]t+\w*|c+u+n+t+\w*|n[i1]gg\w*|f[a@]gg?\w*|retard\w*|wh[o0]re\w*|slut\w*)\b/gi;
export function cleanText(text) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH)
    .replace(BLOCKED, (w) => w[0] + '*'.repeat(w.length - 1));
}

const view = (m) => ({ id: String(m._id), room: m.room, text: m.hidden ? null : m.text, hidden: Boolean(m.hidden), at: m.createdAt, user: m.user });

function publish(event) {
  bus.emit('event', event);
  redis()?.publish(CHANNEL, JSON.stringify({ ...event, from: instance })).catch(() => {});
}

export async function startChat() {
  const r = redis();
  if (!r) return;
  try {
    const sub = r.duplicate();
    await sub.connect();
    await sub.subscribe(CHANNEL, (raw) => {
      const event = JSON.parse(raw);
      if (event.from !== instance) bus.emit('event', event);
    });
  } catch (err) {
    console.error('Chat: Redis pub/sub unavailable:', err.message);
  }
}

export function chatRouter(requireUser) {
  const router = express.Router();
  const messages = () => mongo().collection('chatMessages');

  router.get('/:room', async (req, res) => {
    if (!validRoom(req.params.room)) throw new HttpError(404, 'No such room');
    const list = await messages().find({ room: req.params.room }).sort({ createdAt: -1 }).limit(60).toArray();
    res.json(list.reverse().map(view));
  });

  router.get('/:room/stream', (req, res) => {
    const room = req.params.room;
    if (!validRoom(room)) return res.status(404).end();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const onEvent = (e) => e.room === room && res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    bus.on('event', onEvent);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('event', onEvent);
    });
  });

  router.post('/:room', requireUser, async (req, res) => {
    const room = req.params.room;
    if (!validRoom(room)) throw new HttpError(404, 'No such room');
    if (room.startsWith('tribe-') && req.user.profile?.team !== room.slice(6)) throw new HttpError(403, 'Only fans of this team can post here');
    if (req.user.chatBannedUntil && req.user.chatBannedUntil > new Date()) throw new HttpError(403, 'You are muted for now');
    if (!allow(`chat:${req.user._id}`, 1, 2000) || !allow(`chat-min:${req.user._id}`, 15, 60_000)) throw new HttpError(429, 'Slow down a little');
    const text = cleanText(req.body?.text);
    if (!text) throw new HttpError(400, 'Say something first');
    const doc = {
      room,
      text,
      userId: req.user._id,
      user: { handle: req.user.handle, displayName: req.user.displayName, avatarUrl: req.user.avatarUrl ?? null, team: req.user.profile?.team ?? null },
      reports: [],
      hidden: false,
      createdAt: new Date(),
    };
    const { insertedId } = await messages().insertOne(doc);
    const message = view({ ...doc, _id: insertedId });
    publish({ type: 'message', room, data: message });
    res.status(201).json(message);
  });

  router.delete('/messages/:id', requireUser, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Message not found');
    const m = await messages().findOneAndDelete({ _id: new ObjectId(req.params.id), userId: req.user._id });
    if (!m) throw new HttpError(404, 'Message not found');
    publish({ type: 'remove', room: m.room, data: { id: req.params.id } });
    res.json({ ok: true });
  });

  router.post('/messages/:id/report', requireUser, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Message not found');
    const m = await messages().findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $addToSet: { reports: req.user._id } }, { returnDocument: 'after' });
    if (!m) throw new HttpError(404, 'Message not found');
    if (!m.hidden && m.reports.length >= HIDE_AFTER_REPORTS) {
      await messages().updateOne({ _id: m._id }, { $set: { hidden: true } });
      publish({ type: 'remove', room: m.room, data: { id: String(m._id) } });
    }
    res.json({ ok: true });
  });

  return router;
}
