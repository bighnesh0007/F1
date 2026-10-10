// The prediction game: call each race weekend (winner, podium, pole, fastest lap,
// sprint, retirements, teammate battles) and score points for correct calls. Harder
// calls are worth more. Picks can be changed until the session starts, and are scored
// automatically from the official results. Leaderboards rank everyone by points, and
// private leagues rank groups of friends.
import crypto from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { mongo } from './db/mongo.js';
import { cached, MINUTE } from './http.js';
import * as jolpica from './jolpica.js';
import { recordWeekendPlayed } from './streaks.js';
import { scoreDueFantasy } from './fantasy.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Markets ---------------------------------------------------------------------------

const MAX_POINTS = 300;
// Points from championship position: favourites are worth less, outsiders more.
export const driverPoints = (position) => Math.min(MAX_POINTS, Math.round(25 * 1.28 ** ((position ?? 15) - 1)));

const MARKET_INFO = {
  winner: { title: 'Race winner', lock: 'Race', hint: 'Who takes the chequered flag first?' },
  podium: { title: 'Podium finisher', lock: 'Race', hint: 'Pick a driver to finish in the top three.' },
  pole: { title: 'Pole position', lock: 'Qualifying', hint: 'Fastest in qualifying.' },
  fastestLap: { title: 'Fastest lap', lock: 'Race', hint: 'Who sets the fastest lap of the race?' },
  sprintWinner: { title: 'Sprint winner', lock: 'Sprint', hint: 'Winner of the sprint.' },
  dnfs: { title: 'Retirements', lock: 'Race', hint: 'How many cars fail to finish?' },
  teammates: { title: 'Teammate battles', lock: 'Race', hint: 'Who beats their teammate?' },
};

// Uses the shared "current" season data when the year is the current season.
async function seasonKey(season) {
  const current = await jolpica.getSchedule('current').catch(() => []);
  return current[0]?.season === Number(season) ? 'current' : Number(season);
}

// The prediction markets for one race weekend, with points and lock times.
export function getMarkets(season, round) {
  return cached(`markets:${season}:${round}`, 10 * MINUTE, async () => {
    const key = await seasonKey(season);
    const [schedule, standings] = await Promise.all([jolpica.getSchedule(key), jolpica.getStandings(key)]);
    const race = schedule.find((r) => r.round === Number(round));
    if (!race) return null;
    const lockAt = (session) => race.sessions.find((s) => s.key === session)?.start ?? race.date;
    const drivers = standings.drivers.map((d) => ({
      id: d.driver.id,
      code: d.driver.code,
      name: d.driver.name,
      team: d.team,
      teamId: d.teamId,
      position: d.position ?? standings.drivers.length,
    }));
    const option = (d, points) => ({ id: d.id, label: d.name, code: d.code, team: d.team, points });

    const markets = [
      { key: 'winner', options: drivers.map((d) => option(d, driverPoints(d.position))) },
      { key: 'podium', options: drivers.map((d) => option(d, Math.max(10, Math.round(driverPoints(d.position) / 2.6)))) },
      { key: 'pole', options: drivers.map((d) => option(d, driverPoints(d.position))) },
      { key: 'fastestLap', options: drivers.map((d) => option(d, Math.min(MAX_POINTS, Math.round(driverPoints(d.position) * 1.1)))) },
      ...(race.sprint ? [{ key: 'sprintWinner', options: drivers.map((d) => option(d, driverPoints(d.position))) }] : []),
      {
        key: 'dnfs',
        options: [
          { id: 'under', label: '0–2 retirements', points: 15 },
          { id: 'over', label: '3 or more retirements', points: 20 },
        ],
      },
    ];

    // One market per team: which teammate finishes ahead.
    const teams = new Map();
    for (const d of drivers) teams.set(d.teamId, [...(teams.get(d.teamId) ?? []), d]);
    for (const [teamId, pair] of teams) {
      if (pair.length !== 2) continue;
      markets.push({ key: `teammates:${teamId}`, team: pair[0].team, options: pair.map((d) => option(d, 15)) });
    }

    return {
      season: Number(season),
      round: Number(round),
      name: race.name,
      circuit: race.circuit,
      markets: markets.map((m) => {
        const base = m.key.split(':')[0];
        return { ...m, ...MARKET_INFO[base], lockAt: lockAt(MARKET_INFO[base].lock) };
      }),
    };
  });
}

// --- Predictions ---------------------------------------------------------------------

// One pick per market; picking again before the session starts replaces it.
async function makePick(user, { season, round, market, pick }) {
  const markets = await getMarkets(season, round);
  const m = markets?.markets.find((x) => x.key === market);
  const option = m?.options.find((o) => o.id === pick);
  if (!m || !option) throw new HttpError(400, 'That prediction is not available');
  if (Date.now() >= Date.parse(m.lockAt)) throw new HttpError(400, 'Predictions for this are closed');

  const predictions = mongo().collection('predictions');
  const filter = { userId: user._id, season: Number(season), round: Number(round), market };
  const fields = {
    race: markets.name,
    marketTitle: m.title + (m.team ? ` · ${m.team}` : ''),
    pick,
    pickLabel: option.label,
    points: option.points,
    status: 'open',
    lockAt: new Date(m.lockAt),
    updatedAt: new Date(),
  };
  const result = await predictions.findOneAndUpdate(filter, { $set: fields, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after', includeResultMetadata: true });
  if (!result.lastErrorObject?.updatedExisting) {
    await mongo().collection('users').updateOne({ _id: user._id }, { $inc: { 'stats.picks': 1 } });
    await recordWeekendPlayed(user, season, round);
  }
  return result.value;
}

async function removePick(user, { season, round, market }) {
  const removed = await mongo()
    .collection('predictions')
    .findOneAndDelete({ userId: user._id, season: Number(season), round: Number(round), market, status: 'open', lockAt: { $gt: new Date() } });
  if (!removed) throw new HttpError(400, 'That prediction can no longer be changed');
  await mongo().collection('users').updateOne({ _id: user._id }, { $inc: { 'stats.picks': -1 } });
}

// Decides a prediction from official results; null when the result isn't known yet.
export function outcome(p, data) {
  const { race, quali, sprint } = data;
  const base = p.market.split(':')[0];
  switch (base) {
    case 'winner':
      return race ? race[0]?.driver.id === p.pick : null;
    case 'podium':
      return race ? race.slice(0, 3).some((r) => r.driver.id === p.pick) : null;
    case 'pole':
      return quali ? quali[0]?.driver.id === p.pick : null;
    case 'fastestLap': {
      if (!race) return null;
      const fastest = race.find((r) => r.fastestLap?.rank === 1);
      return fastest ? fastest.driver.id === p.pick : 'void';
    }
    case 'sprintWinner':
      return sprint ? sprint[0]?.driver.id === p.pick : null;
    case 'dnfs': {
      if (!race) return null;
      const dnfs = race.filter((r) => !/finished|lap/i.test(r.status)).length;
      return p.pick === 'over' ? dnfs >= 3 : dnfs <= 2;
    }
    case 'teammates': {
      if (!race) return null;
      const mine = race.find((r) => r.driver.id === p.pick);
      const mate = race.find((r) => r.teamId === p.market.split(':')[1] && r.driver.id !== p.pick);
      if (!mine || !mate) return 'void';
      return mine.position < mate.position;
    }
    default:
      return 'void';
  }
}

export async function scoreRound(season, round) {
  const predictions = mongo().collection('predictions');
  const open = await predictions.find({ season, round, status: 'open', lockAt: { $lte: new Date() } }).toArray();
  if (!open.length) return 0;

  const [raceDetail, seasonResults] = await Promise.all([
    jolpica.getRace(season, round).catch(() => null),
    seasonKey(season).then((key) => jolpica.getSeasonResults(key)).catch(() => []),
  ]);
  const roundResults = seasonResults.find((r) => r.round === round);
  const data = {
    race: raceDetail?.results?.length ? raceDetail.results : roundResults?.results ?? null,
    quali: roundResults?.qualifying?.length ? roundResults.qualifying : null,
    sprint: roundResults?.sprint?.length ? roundResults.sprint : null,
  };

  let scored = 0;
  for (const p of open) {
    const result = outcome(p, data);
    if (result === null) continue;
    const status = result === 'void' ? 'void' : result ? 'correct' : 'wrong';
    const earned = status === 'correct' ? p.points : 0;
    // Only one scorer can flip a prediction from open, so points can't be added twice.
    const claimed = await predictions.findOneAndUpdate({ _id: p._id, status: 'open' }, { $set: { status, earned, scoredAt: new Date() } });
    if (!claimed) continue;
    scored++;
    if (status === 'correct') {
      const base = p.market.split(':')[0];
      await mongo()
        .collection('users')
        .updateOne(
          { _id: p.userId },
          { $inc: { points: earned, 'stats.points': earned, 'stats.correct': 1, [`stats.correctByMarket.${base}`]: 1 }, $max: { 'stats.bestPick': earned } },
        );
    }
  }
  return scored;
}

// Periodically scores predictions for sessions that have finished.
export function startScoringJob() {
  const run = async () => {
    try {
      const rounds = await mongo()
        .collection('predictions')
        .aggregate([{ $match: { status: 'open', lockAt: { $lte: new Date(Date.now() - 90 * MINUTE) } } }, { $group: { _id: { season: '$season', round: '$round' } } }])
        .toArray();
      for (const { _id } of rounds) {
        const n = await scoreRound(_id.season, _id.round);
        if (n) console.log(`Scored ${n} predictions for ${_id.season} round ${_id.round}`);
      }
      const f = await scoreDueFantasy();
      if (f) console.log(`Scored ${f} fantasy teams`);
    } catch (err) {
      if (err.status !== 503) console.error('Scoring job:', err.message);
    }
  };
  setTimeout(run, 20_000).unref();
  setInterval(run, 10 * MINUTE).unref();
}

// --- Badges ------------------------------------------------------------------------------

export const BADGES = {
  rookie: { title: 'Rookie', description: 'Joined F1 Live' },
  tribe: { title: 'Tribe member', description: 'Picked a team to support' },
  quiz: { title: 'Self-aware', description: 'Took the "which team are you?" quiz' },
  firstPick: { title: 'Lights out', description: 'Made a first prediction' },
  oracle: { title: 'Oracle', description: 'Correctly called a race winner' },
  sharp: { title: 'Sharp', description: '10 correct predictions' },
  underdog: { title: 'Underdog whisperer', description: 'Scored 100+ points from a single pick' },
  centurion: { title: 'Centurion', description: 'Reached 1,000 points' },
  social: { title: 'Paddock club', description: 'Joined a league' },
  organised: { title: 'Organised', description: 'Connected Google Calendar' },
  onARoll: { title: 'On a roll', description: 'Predicted 3 race weekends in a row' },
  everPresent: { title: 'Ever-present', description: 'Predicted 10 race weekends in a row' },
  encyclopedia: { title: 'Encyclopedia', description: 'Perfect score in the weekly quiz' },
  quizRegular: { title: 'Quizmaster', description: 'Played 5 weekly quizzes' },
  principal: { title: 'Team principal', description: 'Scored with a fantasy team' },
  regular: { title: 'Regular', description: 'Watched 10 live sessions in the race centre' },
  host: { title: 'Host', description: 'Organised a watch party' },
  friendly: { title: 'Friendly', description: 'Following 5 fans' },
};

export function badgesFor(user, { inLeague = false, following = 0 } = {}) {
  const s = user.stats ?? {};
  const earned = {
    rookie: true,
    tribe: Boolean(user.profile?.team),
    quiz: Boolean(user.profile?.quizResult),
    firstPick: (s.picks ?? 0) > 0,
    oracle: (s.correctByMarket?.winner ?? 0) > 0,
    sharp: (s.correct ?? 0) >= 10,
    underdog: (s.bestPick ?? 0) >= 100,
    centurion: (user.points ?? 0) >= 1000,
    social: inLeague,
    organised: Boolean(user.google?.calendar),
    onARoll: (s.streak?.best ?? 0) >= 3,
    everPresent: (s.streak?.best ?? 0) >= 10,
    encyclopedia: (s.quizPerfect ?? 0) > 0,
    quizRegular: (s.quizWeeks ?? 0) >= 5,
    principal: (s.fantasyRounds ?? 0) > 0,
    regular: (user.watched?.length ?? 0) >= 10,
    host: (s.watchParties ?? 0) > 0,
    friendly: following >= 5,
  };
  return Object.entries(BADGES).map(([id, b]) => ({ id, ...b, earned: earned[id] }));
}

// --- Routes ----------------------------------------------------------------------------

export const publicUser = (u) => ({
  handle: u.handle,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl ?? null,
  team: u.profile?.team ?? null,
  points: u.points ?? 0,
  correct: u.stats?.correct ?? 0,
  picks: u.stats?.picks ?? 0,
  streak: u.stats?.streak?.current ?? 0,
});

export function gameRouter(requireUser) {
  const router = express.Router();

  router.get('/markets/:season/:round', async (req, res) => {
    const markets = await getMarkets(Number(req.params.season), Number(req.params.round));
    if (!markets) throw new HttpError(404, 'No such race');
    res.json(markets);
  });

  router.put('/predictions', requireUser, async (req, res) => {
    res.json(await makePick(req.user, req.body ?? {}));
  });

  router.delete('/predictions', requireUser, async (req, res) => {
    await removePick(req.user, req.body ?? {});
    res.json({ ok: true });
  });

  router.get('/predictions', requireUser, async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.season && req.query.round) Object.assign(filter, { season: Number(req.query.season), round: Number(req.query.round) });
    const list = await mongo().collection('predictions').find(filter).sort({ updatedAt: -1 }).limit(200).toArray();
    res.json(list.map(({ userId: _ignored, ...p }) => p));
  });

  // A correct call, for share cards (public: no picks are revealed before they're scored).
  router.get('/calls/:id', async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Not found');
    const p = await mongo().collection('predictions').findOne({ _id: new ObjectId(req.params.id), status: 'correct' });
    if (!p) throw new HttpError(404, 'Not found');
    const u = await mongo().collection('users').findOne({ _id: p.userId });
    res.json({ race: p.race, season: p.season, market: p.marketTitle, pick: p.pickLabel, earned: p.earned ?? p.points, user: u ? publicUser(u) : null });
  });

  // Rankings of everyone by points.
  router.get('/leaderboard', async (_req, res) => {
    const board = await cached('leaderboard', MINUTE, async () => {
      const users = await mongo().collection('users').find({}, { projection: { handle: 1, displayName: 1, avatarUrl: 1, profile: 1, points: 1, stats: 1 } }).sort({ points: -1, 'stats.correct': -1 }).limit(100).toArray();
      return users.map(publicUser);
    });
    res.json(board);
  });

  // Tribe vs tribe: total and average points per team's fans.
  router.get('/tribes', async (_req, res) => {
    const tribes = await cached('tribes', 5 * MINUTE, () =>
      mongo()
        .collection('users')
        .aggregate([
          { $match: { 'profile.team': { $ne: null } } },
          { $group: { _id: '$profile.team', fans: { $sum: 1 }, points: { $sum: '$points' } } },
          { $project: { _id: 0, team: '$_id', fans: 1, points: 1, average: { $round: [{ $divide: ['$points', '$fans'] }, 1] } } },
          { $sort: { points: -1 } },
        ])
        .toArray(),
    );
    res.json(tribes);
  });

  // Leagues: private rankings with an invite code.
  router.get('/leagues', requireUser, async (req, res) => {
    const leagues = await mongo().collection('leagues').find({ members: req.user._id }).toArray();
    res.json(leagues.map((l) => ({ code: l.code, name: l.name, members: l.members.length, owner: String(l.owner) === String(req.user._id) })));
  });

  router.post('/leagues', requireUser, async (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    if (!name) throw new HttpError(400, 'Give your league a name');
    const owned = await mongo().collection('leagues').countDocuments({ owner: req.user._id });
    if (owned >= 10) throw new HttpError(400, 'You can own up to 10 leagues');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = crypto.randomBytes(4).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X');
      try {
        await mongo().collection('leagues').insertOne({ code, name, owner: req.user._id, members: [req.user._id], createdAt: new Date() });
        return res.status(201).json({ code, name });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    throw new HttpError(500, 'Could not create the league');
  });

  router.post('/leagues/join', requireUser, async (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const league = await mongo().collection('leagues').findOneAndUpdate({ code }, { $addToSet: { members: req.user._id } }, { returnDocument: 'after' });
    if (!league) throw new HttpError(404, 'No league with that code');
    res.json({ code: league.code, name: league.name });
  });

  router.post('/leagues/:code/leave', requireUser, async (req, res) => {
    await mongo().collection('leagues').updateOne({ code: req.params.code.toUpperCase() }, { $pull: { members: req.user._id } });
    res.json({ ok: true });
  });

  router.get('/leagues/:code', requireUser, async (req, res) => {
    const league = await mongo().collection('leagues').findOne({ code: req.params.code.toUpperCase(), members: req.user._id });
    if (!league) throw new HttpError(404, 'League not found');
    const members = await mongo().collection('users').find({ _id: { $in: league.members } }).toArray();
    res.json({ code: league.code, name: league.name, members: members.map(publicUser).sort((a, b) => b.points - a.points) });
  });

  return router;
}
