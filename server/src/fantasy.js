// Fantasy F1: pick 5 drivers and 2 teams within a 100.0 budget before qualifying, name
// a captain (scores double), and score from the real results each weekend. Prices
// follow the championship: the leaders cost the most. A team carries over to the next
// round if you don't change it.
import express from 'express';
import { mongo } from './db/mongo.js';
import { HttpError } from './auth.js';
import { cached, MINUTE } from './http.js';
import * as jolpica from './jolpica.js';

export const BUDGET = 100;
export const DRIVERS = 5;
export const TEAMS = 2;

const round1 = (n) => Math.round(n * 10) / 10;
export const driverPrice = (position) => Math.max(4.5, round1(32 - ((position ?? 20) - 1) * 1.3));
export const teamPrice = (position) => Math.max(5, round1(30 - ((position ?? 10) - 1) * 2.5));

async function seasonKey(season) {
  const current = await jolpica.getSchedule('current').catch(() => []);
  return current[0]?.season === Number(season) ? 'current' : Number(season);
}

// Prices and lock time for one race weekend.
export function getMarket(season, round) {
  return cached(`fantasy:${season}:${round}`, 10 * MINUTE, async () => {
    const key = await seasonKey(season);
    const [schedule, standings] = await Promise.all([jolpica.getSchedule(key), jolpica.getStandings(key)]);
    const race = schedule.find((r) => r.round === Number(round));
    if (!race) return null;
    const lock = race.sessions.find((s) => s.key === 'Qualifying') ?? race.sessions.find((s) => s.key === 'Race');
    return {
      season: Number(season),
      round: Number(round),
      name: race.name,
      lockAt: lock?.start ?? race.date,
      budget: BUDGET,
      drivers: standings.drivers.map((d) => ({ id: d.driver.id, code: d.driver.code, name: d.driver.name, team: d.team, teamId: d.teamId, price: driverPrice(d.position) })),
      constructors: standings.constructors.map((c) => ({ id: c.teamId, name: c.team, price: teamPrice(c.position) })),
    };
  });
}

export function validateTeam(market, { drivers, constructors, captain }) {
  const d = [...new Set(Array.isArray(drivers) ? drivers.map(String) : [])];
  const c = [...new Set(Array.isArray(constructors) ? constructors.map(String) : [])];
  if (d.length !== DRIVERS) throw new HttpError(400, `Pick exactly ${DRIVERS} drivers`);
  if (c.length !== TEAMS) throw new HttpError(400, `Pick exactly ${TEAMS} teams`);
  const dp = d.map((id) => market.drivers.find((x) => x.id === id));
  const cp = c.map((id) => market.constructors.find((x) => x.id === id));
  if (dp.some((x) => !x) || cp.some((x) => !x)) throw new HttpError(400, 'Unknown driver or team');
  if (!d.includes(String(captain))) throw new HttpError(400, 'Your captain must be one of your drivers');
  const cost = round1([...dp, ...cp].reduce((s, x) => s + x.price, 0));
  if (cost > BUDGET) throw new HttpError(400, `Over budget: ${cost} of ${BUDGET}`);
  return { drivers: d, constructors: c, captain: String(captain), cost };
}

const classified = (r) => /finished|lap/i.test(r.status ?? '');

// Points for one driver at one weekend: championship points (race + sprint), places
// gained from the grid (up to +10/-5) and -5 for not finishing.
export function driverScore(id, race, sprint) {
  const r = race?.find((x) => x.driver.id === id);
  const s = sprint?.find((x) => x.driver.id === id);
  if (!r && !s) return 0;
  let pts = (r?.points ?? 0) + (s?.points ?? 0);
  if (r) {
    if (classified(r) && r.grid > 0) pts += Math.max(-5, Math.min(10, r.grid - r.position));
    if (!classified(r)) pts -= 5;
  }
  return pts;
}

export function teamScore(team, race, sprint) {
  const breakdown = {};
  for (const id of team.drivers) breakdown[id] = driverScore(id, race, sprint) * (id === team.captain ? 2 : 1);
  for (const id of team.constructors) {
    breakdown[id] = [...(race ?? []), ...(sprint ?? [])].filter((r) => r.teamId === id).reduce((s, r) => s + (r.points ?? 0), 0);
  }
  return { score: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown };
}

// Copies each player's latest team into this round if they didn't pick one.
async function carryOver(season, round, lockAt) {
  const teams = mongo().collection('fantasyTeams');
  const latest = await teams
    .aggregate([
      { $match: { season, round: { $lt: round } } },
      { $sort: { round: -1 } },
      { $group: { _id: '$userId', team: { $first: '$$ROOT' } } },
    ])
    .toArray();
  for (const { _id, team } of latest) {
    await teams.updateOne(
      { userId: _id, season, round },
      { $setOnInsert: { drivers: team.drivers, constructors: team.constructors, captain: team.captain, cost: team.cost, status: 'open', carried: true, lockAt, createdAt: new Date() } },
      { upsert: true },
    );
  }
}

export async function scoreFantasy(season, round) {
  const market = await getMarket(season, round);
  if (!market) return 0;
  await carryOver(season, round, new Date(market.lockAt));
  const key = await seasonKey(season);
  const results = (await jolpica.getSeasonResults(key).catch(() => [])).find((r) => r.round === round);
  if (!results?.results?.length) return 0;
  const teams = mongo().collection('fantasyTeams');
  const open = await teams.find({ season, round, status: 'open' }).toArray();
  let scored = 0;
  for (const t of open) {
    const { score, breakdown } = teamScore(t, results.results, results.sprint);
    const claimed = await teams.findOneAndUpdate({ _id: t._id, status: 'open' }, { $set: { status: 'scored', score, breakdown, scoredAt: new Date() } });
    if (!claimed) continue;
    scored++;
    await mongo().collection('users').updateOne({ _id: t.userId }, { $inc: { 'stats.fantasy': score, 'stats.fantasyRounds': 1 }, $max: { 'stats.fantasyBest': score } });
  }
  return scored;
}

// Scores rounds with open teams, plus the two latest finished rounds of the current
// season (so teams carried over from earlier rounds are scored too).
export async function scoreDueFantasy() {
  const due = await mongo()
    .collection('fantasyTeams')
    .aggregate([{ $match: { status: 'open', lockAt: { $lte: new Date(Date.now() - 3 * 3600_000) } } }, { $group: { _id: { season: '$season', round: '$round' } } }])
    .toArray();
  const rounds = new Map(due.map(({ _id }) => [`${_id.season}:${_id.round}`, _id]));
  const schedule = await jolpica.getSchedule('current').catch(() => []);
  const finished = schedule.filter((r) => Date.parse(r.date) + 3 * 3600_000 < Date.now()).slice(-2);
  if (finished.length && (await mongo().collection('fantasyTeams').countDocuments({ season: finished[0].season }, { limit: 1 }))) {
    for (const r of finished) rounds.set(`${r.season}:${r.round}`, { season: r.season, round: r.round });
  }
  let n = 0;
  for (const r of rounds.values()) n += await scoreFantasy(r.season, r.round);
  return n;
}

export function fantasyRouter(requireUser) {
  const router = express.Router();
  const teams = () => mongo().collection('fantasyTeams');

  router.get('/leaderboard', async (req, res) => {
    const season = Number(req.query.season) || new Date().getUTCFullYear();
    const board = await cached(`fantasy-board:${season}`, MINUTE, () =>
      teams()
        .aggregate([
          { $match: { season, status: 'scored' } },
          { $group: { _id: '$userId', points: { $sum: '$score' }, rounds: { $sum: 1 }, best: { $max: '$score' } } },
          { $sort: { points: -1 } },
          { $limit: 100 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
          { $unwind: '$u' },
          { $project: { _id: 0, handle: '$u.handle', displayName: '$u.displayName', avatarUrl: '$u.avatarUrl', team: '$u.profile.team', points: 1, rounds: 1, best: 1 } },
        ])
        .toArray(),
    );
    res.json(board);
  });

  router.get('/history', requireUser, async (req, res) => {
    const list = await teams().find({ userId: req.user._id }).sort({ season: -1, round: -1 }).limit(60).toArray();
    res.json(list.map(({ _id, userId, ...t }) => t));
  });

  router.get('/:season/:round', async (req, res) => {
    const market = await getMarket(Number(req.params.season), Number(req.params.round));
    if (!market) throw new HttpError(404, 'No such race');
    const mine = req.user ? await teams().findOne({ userId: req.user._id, season: market.season, round: market.round }) : null;
    res.json({ ...market, myTeam: mine ? { drivers: mine.drivers, constructors: mine.constructors, captain: mine.captain, cost: mine.cost, status: mine.status, score: mine.score ?? null, breakdown: mine.breakdown ?? null } : null });
  });

  router.put('/:season/:round', requireUser, async (req, res) => {
    const market = await getMarket(Number(req.params.season), Number(req.params.round));
    if (!market) throw new HttpError(404, 'No such race');
    if (Date.now() >= Date.parse(market.lockAt)) throw new HttpError(400, 'Teams are locked for this weekend');
    const team = validateTeam(market, req.body ?? {});
    await teams().updateOne(
      { userId: req.user._id, season: market.season, round: market.round },
      { $set: { ...team, status: 'open', carried: false, lockAt: new Date(market.lockAt), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true, ...team });
  });

  return router;
}
