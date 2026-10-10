// Accounts are handled by Clerk (sign-up, sign-in, social logins, user management).
// The web app forwards the signed-in user's Clerk session token; this server verifies
// it and keeps an app profile per Clerk user in MongoDB (tribe, predictions, settings).
//
// Needs CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY. Without them the server runs with
// accounts switched off.
import crypto from 'node:crypto';
import express from 'express';
import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express';
import { mongo, mongoReady } from './db/mongo.js';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const PROFILE_SYNC_MS = 6 * 3600_000;

export const clerkConfigured = () => Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Verifies Clerk session tokens on incoming requests (no-op when Clerk isn't set up).
export function authMiddleware() {
  if (!clerkConfigured()) {
    console.log('Clerk: CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY not set, accounts are disabled');
    return (_req, _res, next) => next();
  }
  const parties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean);
  return clerkMiddleware(parties?.length ? { authorizedParties: parties } : {});
}

function makeHandle(name) {
  const base = String(name || 'fan').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'fan';
  return `${base}${crypto.randomInt(1000, 9999)}`;
}

// Name, email, photo and Google Calendar access, as Clerk knows them.
async function clerkDetails(clerkId) {
  const u = await clerkClient.users.getUser(clerkId);
  const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;
  const google = (u.externalAccounts ?? []).find((a) => /google/.test(a.provider));
  return {
    displayName: u.fullName || u.username || email?.split('@')[0] || 'F1 fan',
    email,
    avatarUrl: u.imageUrl ?? null,
    // A crypto wallet linked through Clerk's Web3 sign-in (MetaMask, Coinbase Wallet…).
    wallet: u.primaryWeb3Wallet?.web3Wallet ?? u.web3Wallets?.[0]?.web3Wallet ?? null,
    google: { linked: Boolean(google), calendar: Boolean(google?.approvedScopes?.includes(CALENDAR_SCOPE)) },
  };
}

// The app profile for a Clerk user, created on first visit and refreshed from Clerk
// every few hours.
async function profileFor(clerkId) {
  const users = mongo().collection('users');
  const existing = await users.findOne({ clerkId });
  if (existing && Date.now() - (existing.syncedAt?.getTime?.() ?? 0) < PROFILE_SYNC_MS) return existing;

  const details = await clerkDetails(clerkId).catch((err) => {
    console.error('Clerk: could not load user details:', err.message);
    return null;
  });
  if (existing) {
    if (!details) return existing;
    return users.findOneAndUpdate({ _id: existing._id }, { $set: { ...details, syncedAt: new Date() } }, { returnDocument: 'after' });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = {
        clerkId,
        handle: makeHandle(details?.displayName),
        displayName: details?.displayName ?? 'F1 fan',
        email: details?.email ?? null,
        avatarUrl: details?.avatarUrl ?? null,
        google: details?.google ?? { linked: false, calendar: false },
        points: 0,
        profile: {},
        settings: null,
        stats: { picks: 0, correct: 0, points: 0 },
        createdAt: new Date(),
        syncedAt: new Date(),
      };
      await users.insertOne(doc);
      return doc;
    } catch (err) {
      if (err.code === 11000 && /handle/.test(err.message)) continue;
      if (err.code === 11000) return users.findOne({ clerkId }); // created by a parallel request
      throw err;
    }
  }
  throw new HttpError(500, 'Could not create your profile');
}

// F1 Live Pro: a Clerk Billing plan (PRO_PLAN, default "pro"). Checked from the
// session token, and remembered on the profile so public badges can show it.
export function hasPro(req) {
  try {
    return Boolean(getAuth(req).has?.({ plan: process.env.PRO_PLAN || 'pro' }));
  } catch {
    return false;
  }
}

// Attaches req.user (the app profile) when the request carries a valid Clerk session.
export async function loadUser(req, _res, next) {
  req.user = null;
  req.pro = false;
  if (!clerkConfigured() || !mongoReady()) return next();
  try {
    const { userId } = getAuth(req);
    if (userId) {
      req.user = await profileFor(userId);
      req.pro = hasPro(req);
      if (Boolean(req.user.pro) !== req.pro) {
        await mongo().collection('users').updateOne({ _id: req.user._id }, { $set: { pro: req.pro } });
        req.user.pro = req.pro;
      }
    }
  } catch (err) {
    console.error('Auth:', err.message);
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!clerkConfigured()) return next(new HttpError(503, 'Sign-in is not set up on this server yet'));
  if (!req.user) return next(new HttpError(401, 'Please sign in first'));
  next();
}

// Changes must be JSON requests: browsers can't send those cross-site without CORS
// approval, which protects cookie-authenticated endpoints from CSRF.
// Requests without a body (e.g. "follow") have no content type; forms always send one.
export function requireJson(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const type = req.headers['content-type'];
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']);
  if (!type && !hasBody) return next();
  if (!String(type ?? '').toLowerCase().startsWith('application/json')) return next(new HttpError(415, 'Expected a JSON request'));
  next();
}

// A Google access token for the user's Calendar, from their Google sign-in via Clerk.
export async function googleAccessToken(user) {
  const { data } = await clerkClient.users.getUserOauthAccessToken(user.clerkId, 'google');
  const token = data?.[0];
  if (!token) throw new HttpError(400, 'Connect your Google account first');
  if (token.scopes && !token.scopes.includes(CALENDAR_SCOPE)) throw new HttpError(400, 'Allow Google Calendar access first');
  return token.token;
}

export async function deleteClerkUser(user) {
  await clerkClient.users.deleteUser(user.clerkId);
}

// What the signed-in user sees about themselves.
export function selfView(user) {
  return {
    id: String(user._id),
    handle: user.handle,
    displayName: user.displayName,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    points: user.points ?? 0,
    profile: user.profile ?? {},
    settings: user.settings ?? null,
    stats: user.stats ?? {},
    createdAt: user.createdAt,
    google: user.google ?? { linked: false, calendar: false },
    wallet: user.wallet ?? null,
    pro: Boolean(user.pro),
  };
}

export function authRouter() {
  const router = express.Router();
  router.get('/providers', (_req, res) => res.json({ clerk: clerkConfigured(), accounts: clerkConfigured() && mongoReady() }));
  router.get('/me', (req, res) => res.json({ user: req.user ? selfView(req.user) : null }));
  // Re-reads name, photo and Google access from Clerk (e.g. right after connecting Google).
  router.post('/refresh', requireUser, async (req, res) => {
    const details = await clerkDetails(req.user.clerkId);
    const user = await mongo().collection('users').findOneAndUpdate({ _id: req.user._id }, { $set: { ...details, syncedAt: new Date() } }, { returnDocument: 'after' });
    res.json({ user: selfView(user) });
  });
  return router;
}
