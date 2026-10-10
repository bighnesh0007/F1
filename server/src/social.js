// Friends and achievements: follow other fans, a friends ranking and a feed of their
// calls, live-session check-ins ("watched 10 sessions") and weekend streaks.
import express from 'express';
import { mongo } from './db/mongo.js';
import { HttpError } from './auth.js';
import { publicUser } from './game.js';
import { sessionIsLive } from './live-status.js';

const MAX_FOLLOWING = 500;

async function userByHandle(handle) {
  const user = await mongo().collection('users').findOne({ handle: String(handle).toLowerCase() });
  if (!user) throw new HttpError(404, 'No such fan');
  return user;
}

export async function followingIds(userId) {
  const list = await mongo().collection('follows').find({ follower: userId }, { projection: { followee: 1 } }).limit(MAX_FOLLOWING).toArray();
  return list.map((f) => f.followee);
}

export async function followCounts(userId) {
  const [followers, following] = await Promise.all([
    mongo().collection('follows').countDocuments({ followee: userId }),
    mongo().collection('follows').countDocuments({ follower: userId }),
  ]);
  return { followers, following };
}

export function socialRouter(requireUser, live) {
  const router = express.Router();

  router.post('/users/:handle/follow', requireUser, async (req, res) => {
    const target = await userByHandle(req.params.handle);
    if (String(target._id) === String(req.user._id)) throw new HttpError(400, "You can't follow yourself");
    const count = await mongo().collection('follows').countDocuments({ follower: req.user._id });
    if (count >= MAX_FOLLOWING) throw new HttpError(400, `You can follow up to ${MAX_FOLLOWING} fans`);
    await mongo().collection('follows').updateOne({ follower: req.user._id, followee: target._id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    res.json({ ...(await followCounts(target._id)), viewerFollows: true });
  });

  router.delete('/users/:handle/follow', requireUser, async (req, res) => {
    const target = await userByHandle(req.params.handle);
    await mongo().collection('follows').deleteOne({ follower: req.user._id, followee: target._id });
    res.json({ ...(await followCounts(target._id)), viewerFollows: false });
  });

  router.get('/friends', requireUser, async (req, res) => {
    const ids = await followingIds(req.user._id);
    const users = await mongo().collection('users').find({ _id: { $in: ids } }).toArray();
    res.json(users.map(publicUser).sort((a, b) => b.points - a.points));
  });

  // You and the fans you follow, ranked by points.
  router.get('/friends/leaderboard', requireUser, async (req, res) => {
    const ids = [req.user._id, ...(await followingIds(req.user._id))];
    const users = await mongo().collection('users').find({ _id: { $in: ids } }).toArray();
    res.json(users.map((u) => ({ ...publicUser(u), me: String(u._id) === String(req.user._id) })).sort((a, b) => b.points - a.points));
  });

  // What the fans you follow have called: their locked picks and scored calls.
  router.get('/friends/feed', requireUser, async (req, res) => {
    const ids = await followingIds(req.user._id);
    if (!ids.length) return res.json([]);
    const [users, picks] = await Promise.all([
      mongo().collection('users').find({ _id: { $in: ids } }).toArray(),
      mongo()
        .collection('predictions')
        .find({ userId: { $in: ids }, lockAt: { $lte: new Date() } })
        .sort({ lockAt: -1, updatedAt: -1 })
        .limit(60)
        .toArray(),
    ]);
    const byId = new Map(users.map((u) => [String(u._id), publicUser(u)]));
    res.json(
      picks.map((p) => ({
        user: byId.get(String(p.userId)),
        race: p.race,
        season: p.season,
        round: p.round,
        market: p.marketTitle,
        pick: p.pickLabel,
        points: p.points,
        status: p.status,
        earned: p.earned ?? 0,
        at: p.scoredAt ?? p.lockAt,
      })),
    );
  });

  // Counts a live session as watched (for the "Regular" badge).
  router.post('/me/watched', requireUser, async (req, res) => {
    const path = live.state.topics.SessionInfo?.Path;
    if (!path || !sessionIsLive(live)) return res.json({ counted: false });
    await mongo().collection('users').updateOne({ _id: req.user._id }, { $addToSet: { watched: path } });
    res.json({ counted: true });
  });

  return router;
}
