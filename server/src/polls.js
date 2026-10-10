// Live polls during races: "Who wins?" (open until half distance) and "Driver of the
// day" (open from three-quarters distance until an hour after the flag). One vote per
// signed-in user, or per device when sign-in isn't set up; results update live.
import crypto from 'node:crypto';
import express from 'express';
import { mongo } from './db/mongo.js';
import { HttpError, clerkConfigured } from './auth.js';
import { allow } from './limit.js';

const POLLS = {
  winner: { question: 'Who wins this race?', open: (f) => f < 0.5 },
  dotd: { question: 'Driver of the day?', open: (f, finished) => f >= 0.75 || finished },
};

const isRace = (topics) => topics.SessionInfo?.Type === 'Race' || /sprint$/i.test(topics.SessionInfo?.Name ?? '');

// Which polls exist for the current session, and whether they take votes now.
export function currentPolls(topics) {
  const path = topics.SessionInfo?.Path;
  if (!path || !isRace(topics)) return [];
  const lap = Number(topics.LapCount?.CurrentLap) || 0;
  const total = Number(topics.LapCount?.TotalLaps) || 0;
  const fraction = total ? lap / total : 0;
  const status = topics.SessionStatus?.Status;
  const finished = ['Finished', 'Finalised', 'Ends'].includes(status);
  const started = ['Started', 'Aborted'].includes(status) || finished;
  const options = Object.entries(topics.DriverList ?? {})
    .filter(([n, d]) => /^\d+$/.test(n) && d?.Tla)
    .map(([n, d]) => ({ id: n, label: d.Tla, name: d.FullName ?? d.Tla, colour: d.TeamColour ?? null }));
  return Object.entries(POLLS).map(([kind, p]) => ({
    id: `${path}:${kind}`,
    kind,
    question: p.question,
    open: started && p.open(fraction, finished) && !(kind === 'winner' && finished),
    options,
  }));
}

export function pollsRouter(live) {
  const router = express.Router();
  const votes = () => mongo().collection('pollVotes');

  const voterOf = (req) => {
    if (req.user) return `u:${req.user._id}`;
    if (clerkConfigured()) return null; // sign-in is available, so require it
    const device = String(req.body?.device ?? req.query.device ?? '');
    return /^[A-Za-z0-9_-]{16,64}$/.test(device) ? `d:${crypto.createHash('sha256').update(device).digest('hex').slice(0, 32)}` : null;
  };

  router.get('/live', async (req, res) => {
    const polls = currentPolls(live.state.topics);
    const voter = voterOf(req);
    const out = [];
    for (const p of polls) {
      const counts = await votes().aggregate([{ $match: { pollId: p.id } }, { $group: { _id: '$option', n: { $sum: 1 } } }]).toArray();
      const mine = voter ? await votes().findOne({ pollId: p.id, voter }) : null;
      out.push({ ...p, results: Object.fromEntries(counts.map((c) => [c._id, c.n])), total: counts.reduce((s, c) => s + c.n, 0), myVote: mine?.option ?? null });
    }
    res.json({ polls: out, signInRequired: clerkConfigured() && !req.user });
  });

  router.post('/:kind/vote', async (req, res) => {
    const poll = currentPolls(live.state.topics).find((p) => p.kind === req.params.kind);
    if (!poll) throw new HttpError(404, 'No poll right now');
    if (!poll.open) throw new HttpError(400, 'Voting is closed for this one');
    const voter = voterOf(req);
    if (!voter) throw new HttpError(401, 'Please sign in to vote');
    if (!allow(`vote:${req.ip}`, 30, 60_000)) throw new HttpError(429, 'Too many votes from here');
    const option = String(req.body?.option ?? '');
    if (!poll.options.some((o) => o.id === option)) throw new HttpError(400, 'Not an option');
    await votes().updateOne({ pollId: poll.id, voter }, { $set: { option, at: new Date() } }, { upsert: true });
    res.json({ ok: true });
  });

  return router;
}
