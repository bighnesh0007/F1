// Profiles: team "tribe", favourite driver, fan details, settings that follow the
// user across devices, badges and public profile pages.
import express from 'express';
import { mongo } from './db/mongo.js';
import { kv } from './db/redis.js';
import { badgesFor } from './game.js';
import { HttpError, selfView } from './auth.js';

export const TEAMS = ['red_bull', 'ferrari', 'mercedes', 'mclaren', 'aston_martin', 'alpine', 'williams', 'racing_bulls', 'haas', 'audi', 'cadillac'];

const str = (v, max) => (v == null ? undefined : String(v).trim().slice(0, max));

export function profileRouter(requireUser) {
  const router = express.Router();

  router.get('/profile', requireUser, async (req, res) => {
    const inLeague = (await mongo().collection('leagues').countDocuments({ members: req.user._id })) > 0;
    res.json({ user: selfView(req.user), badges: badgesFor(req.user, { inLeague }) });
  });

  router.patch('/profile', requireUser, async (req, res) => {
    const body = req.body ?? {};
    const set = {};
    if (body.displayName !== undefined) {
      const name = str(body.displayName, 40);
      if (!name) throw new HttpError(400, 'Display name cannot be empty');
      set.displayName = name;
    }
    if (body.team !== undefined) {
      if (body.team !== null && !TEAMS.includes(body.team)) throw new HttpError(400, 'Unknown team');
      set['profile.team'] = body.team;
    }
    const fields = { driver: 4, driverName: 60, country: 60, bio: 280, quizResult: 30 };
    for (const [key, max] of Object.entries(fields)) if (body[key] !== undefined) set[`profile.${key}`] = body[key] === null ? null : str(body[key], max);
    if (body.fanSince !== undefined) {
      const year = Number(body.fanSince);
      if (body.fanSince !== null && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear())) throw new HttpError(400, 'Fan since must be a year');
      set['profile.fanSince'] = body.fanSince === null ? null : year;
    }
    const user = await mongo().collection('users').findOneAndUpdate({ _id: req.user._id }, { $set: set }, { returnDocument: 'after' });
    res.json({ user: selfView(user) });
  });

  // App settings (theme, favourite driver, alerts…) stored with the account.
  router.put('/profile/settings', requireUser, async (req, res) => {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object' || JSON.stringify(settings).length > 8000) throw new HttpError(400, 'Invalid settings');
    await mongo().collection('users').updateOne({ _id: req.user._id }, { $set: { settings } });
    res.json({ ok: true });
  });

  router.delete('/profile', requireUser, async (req, res) => {
    const id = req.user._id;
    await Promise.all([
      mongo().collection('users').deleteOne({ _id: id }),
      mongo().collection('bets').deleteMany({ userId: id }),
      mongo().collection('ledger').deleteMany({ userId: id }),
      mongo().collection('leagues').updateMany({ members: id }, { $pull: { members: id } }),
    ]);
    if (req.sessionToken) await kv.del(`session:${req.sessionToken}`);
    res.clearCookie('f1live_session', { path: '/' });
    res.json({ ok: true });
  });

  router.get('/users/:handle', async (req, res) => {
    const user = await mongo().collection('users').findOne({ handle: String(req.params.handle).toLowerCase() });
    if (!user) throw new HttpError(404, 'No such fan');
    const inLeague = (await mongo().collection('leagues').countDocuments({ members: user._id })) > 0;
    res.json({
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? null,
      profile: { team: user.profile?.team ?? null, driverName: user.profile?.driverName ?? null, country: user.profile?.country ?? null, fanSince: user.profile?.fanSince ?? null, bio: user.profile?.bio ?? null, quizResult: user.profile?.quizResult ?? null },
      stats: { bets: user.stats?.bets ?? 0, won: user.stats?.won ?? 0, profit: (user.stats?.returned ?? 0) - (user.stats?.staked ?? 0) },
      coins: user.coins ?? 0,
      joined: user.createdAt,
      badges: badgesFor(user, { inLeague }).filter((b) => b.earned),
    });
  });

  return router;
}
