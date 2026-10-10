// Accounts and sessions.
//  - Email + password (scrypt hashes), works without any external setup.
//  - Google sign-in (optional: set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / PUBLIC_URL),
//    which can also grant Google Calendar access for adding sessions and watch parties.
// Sessions are random tokens in an httpOnly cookie, stored in Redis (or memory).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { ObjectId } from 'mongodb';
import { kv } from './db/redis.js';
import { mongo } from './db/mongo.js';
import { STARTING_COINS, recordLedger } from './game.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'f1live_session';
const SESSION_DAYS = 30;
const PUBLIC_URL = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// --- Helpers -----------------------------------------------------------------------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored ?? '').split('$');
  if (!salt || !hash) return false;
  const candidate = await scrypt(password, Buffer.from(salt, 'base64'), 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'base64'));
}

// Key for encrypting stored Google tokens; generated once and kept in the database
// when SESSION_SECRET isn't set.
let secretKey = null;
async function encryptionKey() {
  if (secretKey) return secretKey;
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    const config = mongo().collection('config');
    const doc = await config.findOneAndUpdate(
      { _id: 'secret' },
      { $setOnInsert: { value: crypto.randomBytes(32).toString('base64') } },
      { upsert: true, returnDocument: 'after' },
    );
    secret = doc.value;
  }
  secretKey = crypto.createHash('sha256').update(secret).digest();
  return secretKey;
}

export async function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export async function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', await encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(res, token, maxAgeDays = SESSION_DAYS) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PUBLIC_URL().startsWith('https://'),
    path: '/',
    maxAge: maxAgeDays * 24 * 3600 * 1000,
  });
}

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await kv.set(`session:${token}`, String(userId), SESSION_DAYS * 24 * 3600);
  setSessionCookie(res, token);
}

function makeHandle(name) {
  const base = String(name || 'fan').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'fan';
  return `${base}${crypto.randomInt(1000, 9999)}`;
}

async function createUser(fields) {
  const users = mongo().collection('users');
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = {
      handle: makeHandle(fields.displayName),
      createdAt: now,
      coins: STARTING_COINS,
      profile: {},
      settings: null,
      stats: { bets: 0, won: 0, staked: 0, returned: 0 },
      ...fields,
    };
    try {
      const { insertedId } = await users.insertOne(doc);
      await recordLedger(insertedId, STARTING_COINS, 'welcome', 'Welcome bonus', `welcome:${insertedId}`);
      return { ...doc, _id: insertedId };
    } catch (err) {
      if (err.code === 11000 && /handle/.test(err.message)) continue; // handle taken, try another
      if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
      throw err;
    }
  }
  throw new HttpError(500, 'Could not create the account');
}

// What the signed-in user sees about themselves.
export function selfView(user) {
  return {
    id: String(user._id),
    handle: user.handle,
    displayName: user.displayName,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    coins: user.coins ?? 0,
    profile: user.profile ?? {},
    settings: user.settings ?? null,
    stats: user.stats ?? {},
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    google: { linked: Boolean(user.googleId), calendar: Boolean(user.google?.calendar) },
    lastDailyBonus: user.lastDailyBonus ?? null,
  };
}

// --- Middleware ----------------------------------------------------------------------

// Attaches req.user when a valid session cookie is present.
export async function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  try {
    const userId = await kv.get(`session:${token}`);
    if (userId && ObjectId.isValid(userId)) {
      req.user = await mongo().collection('users').findOne({ _id: new ObjectId(userId) });
      req.sessionToken = token;
    }
  } catch {
    // database unavailable: treat as signed out
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in first'));
  next();
}

// Changes must be JSON requests: browsers can't send those cross-site without CORS
// approval, which protects cookie-authenticated endpoints from CSRF.
export function requireJson(req, _res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Expected a JSON request'));
  }
  next();
}

async function rateLimit(key, limit, windowSeconds) {
  const count = Number((await kv.get(`rl:${key}`)) ?? 0) + 1;
  await kv.set(`rl:${key}`, String(count), windowSeconds);
  if (count > limit) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
}

// --- Google OAuth --------------------------------------------------------------------

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${PUBLIC_URL()}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new HttpError(400, `Google sign-in failed: ${body.error_description ?? body.error}`);
  return body;
}

// A fresh access token for the user's Google account (for Calendar calls).
export async function googleAccessToken(user) {
  if (!user.google?.refreshToken) throw new HttpError(400, 'Connect Google Calendar first');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: await decrypt(user.google.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === 'invalid_grant') {
      await mongo().collection('users').updateOne({ _id: user._id }, { $set: { 'google.calendar': false }, $unset: { 'google.refreshToken': '' } });
      throw new HttpError(401, 'Google access was revoked. Please connect Google Calendar again.');
    }
    throw new HttpError(502, `Google token refresh failed: ${body.error}`);
  }
  return body.access_token;
}

// --- Routes ----------------------------------------------------------------------------

export function authRouter() {
  const router = express.Router();

  router.get('/providers', (_req, res) => res.json({ google: googleConfigured() }));

  router.get('/me', (req, res) => res.json({ user: req.user ? selfView(req.user) : null }));

  router.post('/register', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const displayName = String(req.body?.displayName ?? '').trim().slice(0, 40);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    if (!displayName) throw new HttpError(400, 'Please choose a display name');
    await rateLimit(`register:${req.ip}`, 10, 3600);
    const user = await createUser({ email, displayName, passwordHash: await hashPassword(password) });
    await startSession(res, user._id);
    res.status(201).json({ user: selfView(user) });
  });

  router.post('/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    await rateLimit(`login:${req.ip}:${email}`, 10, 900);
    const user = await mongo().collection('users').findOne({ email });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    await startSession(res, user._id);
    res.json({ user: selfView(user) });
  });

  router.post('/logout', async (req, res) => {
    if (req.sessionToken) await kv.del(`session:${req.sessionToken}`);
    setSessionCookie(res, '', 0);
    res.json({ ok: true });
  });

  // Starts Google sign-in. ?calendar=1 also asks for Calendar access; when already
  // signed in, the Google account is linked to the current user.
  router.get('/google', async (req, res) => {
    if (!googleConfigured()) throw new HttpError(404, 'Google sign-in is not configured on this server');
    const state = crypto.randomBytes(24).toString('base64url');
    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//') ? req.query.next : '/profile';
    const calendar = req.query.calendar === '1';
    await kv.set(`oauth:${state}`, JSON.stringify({ next, calendar, linkTo: req.user ? String(req.user._id) : null }), 600);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${PUBLIC_URL()}/api/auth/google/callback`,
      response_type: 'code',
      scope: ['openid', 'email', 'profile', ...(calendar ? [CALENDAR_SCOPE] : [])].join(' '),
      state,
      include_granted_scopes: 'true',
      ...(calendar ? { access_type: 'offline', prompt: 'consent' } : { prompt: 'select_account' }),
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/google/callback', async (req, res) => {
    const fail = (message) => res.redirect(`/login?error=${encodeURIComponent(message)}`);
    if (req.query.error) return fail(req.query.error === 'access_denied' ? 'Google sign-in was cancelled' : String(req.query.error));
    const saved = await kv.get(`oauth:${req.query.state}`);
    if (!saved) return fail('Sign-in expired, please try again');
    await kv.del(`oauth:${req.query.state}`);
    const { next, calendar, linkTo } = JSON.parse(saved);

    const tokens = await exchangeCode(String(req.query.code ?? ''));
    const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
    if (!info.sub) return fail('Could not read your Google profile');

    const users = mongo().collection('users');
    const grantedCalendar = String(tokens.scope ?? '').includes(CALENDAR_SCOPE);
    const googleFields = {
      googleId: info.sub,
      avatarUrl: info.picture ?? null,
      ...(grantedCalendar && tokens.refresh_token ? { 'google.refreshToken': await encrypt(tokens.refresh_token), 'google.calendar': true } : {}),
    };

    let user = null;
    if (linkTo) {
      const other = await users.findOne({ googleId: info.sub, _id: { $ne: new ObjectId(linkTo) } });
      if (other) return fail('That Google account is already used by another profile');
      user = await users.findOneAndUpdate({ _id: new ObjectId(linkTo) }, { $set: googleFields }, { returnDocument: 'after' });
    }
    user ??= await users.findOneAndUpdate({ googleId: info.sub }, { $set: googleFields }, { returnDocument: 'after' });
    if (!user && info.email_verified && info.email) {
      // Same verified email as an existing password account: link them.
      user = await users.findOneAndUpdate({ email: info.email.toLowerCase() }, { $set: googleFields }, { returnDocument: 'after' });
    }
    if (!user) {
      const created = await createUser({ email: info.email?.toLowerCase(), displayName: info.name || info.email?.split('@')[0] || 'F1 fan', googleId: info.sub, avatarUrl: info.picture ?? null });
      user = await users.findOneAndUpdate({ _id: created._id }, { $set: googleFields }, { returnDocument: 'after' });
    }
    if (calendar && !grantedCalendar) return res.redirect(`${next}${next.includes('?') ? '&' : '?'}calendar=denied`);
    await startSession(res, user._id);
    res.redirect(calendar ? `${next}${next.includes('?') ? '&' : '?'}calendar=connected` : next);
  });

  router.post('/google/disconnect', requireUser, async (req, res) => {
    await mongo().collection('users').updateOne({ _id: req.user._id }, { $set: { 'google.calendar': false }, $unset: { 'google.refreshToken': '' } });
    res.json({ ok: true });
  });

  return router;
}
