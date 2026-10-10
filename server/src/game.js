// The prediction game: virtual "Pit Coins" (no monetary value), race-weekend
// predictions with fixed odds, automatic settlement from official results, a daily
// bonus, leaderboards and private leagues.
//
// Every balance change is written to an append-only ledger with a unique reference,
// which keeps settlement idempotent and is the natural bridge to an on-chain token
// later (each ledger entry maps to a mint/transfer).
import crypto from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { mongo } from './db/mongo.js';
import { cached, MINUTE } from './http.js';
import * as jolpica from './jolpica.js';

export const STARTING_COINS = 1000;
const DAILY_BONUS = 100;
const MIN_STAKE = 10;
const MAX_STAKE = 5000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Ledger --------------------------------------------------------------------------

export async function recordLedger(userId, amount, type, note, ref) {
  try {
    await mongo().collection('ledger').insertOne({ userId: new ObjectId(userId), amount, type, note, ref, at: new Date() });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // already recorded (idempotent)
    throw err;
  }
}

// --- Markets ---------------------------------------------------------------------------

const round1 = (n) => Math.round(n * 10) / 10;
// Fixed odds from championship position: favourites pay less, outsiders more.
const driverOdds = (position) => Math.min(50, round1(2.5 * 1.28 ** ((position ?? 15) - 1)));

const MARKET_INFO = {
  winner: { title: 'Race winner', lock: 'Race', hint: 'Who takes the chequered flag first?' },
  podium: { title: 'Podium finisher', lock: 'Race', hint: 'Pick a driver to finish in the top three.' },
  pole: { title: 'Pole position', lock: 'Qualifying', hint: 'Fastest in qualifying.' },
  fastestLap: { title: 'Fastest lap', lock: 'Race', hint: 'Who sets the fastest lap of the race?' },
  sprintWinner: { title: 'Sprint winner', lock: 'Sprint', hint: 'Winner of the Saturday sprint.' },
  dnfs: { title: 'Retirements', lock: 'Race', hint: 'How many cars fail to finish?' },
  teammates: { title: 'Teammate battles', lock: 'Race', hint: 'Who beats their teammate?' },
};

// Uses the shared "current" season data when the year is the current season.
async function seasonKey(season) {
  const current = await jolpica.getSchedule('current').catch(() => []);
  return current[0]?.season === Number(season) ? 'current' : Number(season);
}

// The prediction markets for one race weekend, with odds and lock times.
export function getMarkets(season, round) {
  return cached(`markets:${season}:${round}`, 10 * MINUTE, async () => {
    const key = await seasonKey(season);
    const [schedule, standings] = await Promise.all([jolpica.getSchedule(key), jolpica.getStandings(key)]);
    const race = schedule.find((r) => r.round === Number(round));
    if (!race) return null;
    const lockAt = (key) => race.sessions.find((s) => s.key === key)?.start ?? race.date;
    const drivers = standings.drivers.map((d) => ({
      id: d.driver.id,
      code: d.driver.code,
      name: d.driver.name,
      team: d.team,
      teamId: d.teamId,
      position: d.position ?? standings.drivers.length,
    }));
    const option = (d, odds) => ({ id: d.id, label: d.name, code: d.code, team: d.team, odds });

    const markets = [
      { key: 'winner', options: drivers.map((d) => option(d, driverOdds(d.position))) },
      { key: 'podium', options: drivers.map((d) => option(d, Math.max(1.2, round1(driverOdds(d.position) / 2.6)))) },
      { key: 'pole', options: drivers.map((d) => option(d, driverOdds(d.position))) },
      { key: 'fastestLap', options: drivers.map((d) => option(d, round1(driverOdds(d.position) * 1.1))) },
      ...(race.sprint ? [{ key: 'sprintWinner', options: drivers.map((d) => option(d, driverOdds(d.position))) }] : []),
      {
        key: 'dnfs',
        options: [
          { id: 'under', label: '0–2 retirements', odds: 1.8 },
          { id: 'over', label: '3 or more retirements', odds: 2.0 },
        ],
      },
    ];

    // One market per team: which teammate finishes ahead.
    const teams = new Map();
    for (const d of drivers) teams.set(d.teamId, [...(teams.get(d.teamId) ?? []), d]);
    for (const [teamId, pair] of teams) {
      if (pair.length !== 2) continue;
      markets.push({ key: `teammates:${teamId}`, team: pair[0].team, options: pair.map((d) => option(d, 1.9)) });
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

// --- Bets -----------------------------------------------------------------------------

async function placeBet(user, { season, round, market, pick, stake }) {
  stake = Math.floor(Number(stake));
  if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) throw new HttpError(400, `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} coins`);
  const markets = await getMarkets(season, round);
  const m = markets?.markets.find((x) => x.key === market);
  const option = m?.options.find((o) => o.id === pick);
  if (!m || !option) throw new HttpError(400, 'That prediction is not available');
  if (Date.now() >= Date.parse(m.lockAt)) throw new HttpError(400, 'Predictions for this are closed');

  const users = mongo().collection('users');
  const updated = await users.findOneAndUpdate(
    { _id: user._id, coins: { $gte: stake } },
    { $inc: { coins: -stake, 'stats.bets': 1, 'stats.staked': stake }, $max: { 'stats.biggestStake': stake } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(400, 'Not enough coins');

  const bet = {
    userId: user._id,
    season: Number(season),
    round: Number(round),
    race: markets.name,
    market,
    marketTitle: m.title + (m.team ? ` · ${m.team}` : ''),
    pick,
    pickLabel: option.label,
    odds: option.odds,
    stake,
    status: 'open',
    lockAt: new Date(m.lockAt),
    createdAt: new Date(),
  };
  const { insertedId } = await mongo().collection('bets').insertOne(bet);
  await recordLedger(user._id, -stake, 'stake', `${bet.marketTitle}: ${option.label} @ ${option.odds}`, `stake:${insertedId}`);
  return { bet: { ...bet, _id: insertedId }, coins: updated.coins };
}

// Decides a bet from official results; null when the result isn't known yet.
function outcome(bet, data) {
  const { race, quali, sprint } = data;
  const base = bet.market.split(':')[0];
  const byId = (list, id) => list?.find((r) => r.driver.id === id);
  switch (base) {
    case 'winner':
      return race ? race[0]?.driver.id === bet.pick : null;
    case 'podium':
      return race ? race.slice(0, 3).some((r) => r.driver.id === bet.pick) : null;
    case 'pole':
      return quali ? quali[0]?.driver.id === bet.pick : null;
    case 'fastestLap': {
      if (!race) return null;
      const fastest = race.find((r) => r.fastestLap?.rank === 1);
      return fastest ? fastest.driver.id === bet.pick : 'void';
    }
    case 'sprintWinner':
      return sprint ? sprint[0]?.driver.id === bet.pick : null;
    case 'dnfs': {
      if (!race) return null;
      const dnfs = race.filter((r) => !/finished|lap/i.test(r.status)).length;
      return bet.pick === 'over' ? dnfs >= 3 : dnfs <= 2;
    }
    case 'teammates': {
      if (!race) return null;
      const mine = byId(race, bet.pick);
      const mate = race.find((r) => r.teamId === bet.market.split(':')[1] && r.driver.id !== bet.pick);
      if (!mine || !mate) return 'void';
      return mine.position < mate.position;
    }
    default:
      return 'void';
  }
}

export async function settleRound(season, round) {
  const bets = mongo().collection('bets');
  const open = await bets.find({ season, round, status: 'open', lockAt: { $lte: new Date() } }).toArray();
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

  let settled = 0;
  for (const bet of open) {
    const result = outcome(bet, data);
    if (result === null) continue;
    const status = result === 'void' ? 'void' : result ? 'won' : 'lost';
    const payout = status === 'won' ? Math.floor(bet.stake * bet.odds) : status === 'void' ? bet.stake : 0;
    // Only one settlement can flip the bet from open, so payouts can't double up.
    const claimed = await bets.findOneAndUpdate({ _id: bet._id, status: 'open' }, { $set: { status, payout, settledAt: new Date() } });
    if (!claimed) continue;
    settled++;
    const inc = { 'stats.returned': payout, ...(status === 'won' ? { 'stats.won': 1, [`stats.wonByMarket.${bet.market.split(':')[0]}`]: 1 } : {}) };
    if (payout > 0 && (await recordLedger(bet.userId, payout, status === 'won' ? 'payout' : 'refund', `${bet.marketTitle}: ${bet.pickLabel}`, `settle:${bet._id}`))) {
      await mongo().collection('users').updateOne({ _id: bet.userId }, { $inc: { coins: payout, ...inc } });
    } else if (payout === 0) {
      await mongo().collection('users').updateOne({ _id: bet.userId }, { $inc: inc });
    }
  }
  return settled;
}

// Periodically settles any bets whose sessions have finished.
export function startSettlementJob() {
  const run = async () => {
    try {
      const rounds = await mongo()
        .collection('bets')
        .aggregate([{ $match: { status: 'open', lockAt: { $lte: new Date(Date.now() - 90 * MINUTE) } } }, { $group: { _id: { season: '$season', round: '$round' } } }])
        .toArray();
      for (const { _id } of rounds) {
        const n = await settleRound(_id.season, _id.round);
        if (n) console.log(`Settled ${n} predictions for ${_id.season} round ${_id.round}`);
      }
    } catch (err) {
      if (err.status !== 503) console.error('Settlement job:', err.message);
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
  firstBet: { title: 'Lights out', description: 'Made a first prediction' },
  oracle: { title: 'Oracle', description: 'Correctly called a race winner' },
  sharp: { title: 'Sharp', description: 'Won 10 predictions' },
  highRoller: { title: 'High roller', description: 'Staked 1,000 coins on one prediction' },
  regular: { title: 'Regular', description: 'Claimed the daily bonus 7 days in a row' },
  social: { title: 'Paddock club', description: 'Joined a league' },
  organised: { title: 'Organised', description: 'Connected Google Calendar' },
};

export function badgesFor(user, { inLeague = false } = {}) {
  const s = user.stats ?? {};
  const earned = {
    rookie: true,
    tribe: Boolean(user.profile?.team),
    quiz: Boolean(user.profile?.quizResult),
    firstBet: (s.bets ?? 0) > 0,
    oracle: (s.wonByMarket?.winner ?? 0) > 0,
    sharp: (s.won ?? 0) >= 10,
    highRoller: (s.biggestStake ?? 0) >= 1000,
    regular: (user.dailyStreak ?? 0) >= 7,
    social: inLeague,
    organised: Boolean(user.google?.calendar),
  };
  return Object.entries(BADGES).map(([id, b]) => ({ id, ...b, earned: earned[id] }));
}

// --- Routes ----------------------------------------------------------------------------

const publicUser = (u) => ({
  handle: u.handle,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl ?? null,
  team: u.profile?.team ?? null,
  coins: u.coins ?? 0,
  profit: (u.stats?.returned ?? 0) - (u.stats?.staked ?? 0),
  won: u.stats?.won ?? 0,
  bets: u.stats?.bets ?? 0,
});

export function gameRouter(requireUser) {
  const router = express.Router();

  router.get('/markets/:season/:round', async (req, res) => {
    const markets = await getMarkets(Number(req.params.season), Number(req.params.round));
    if (!markets) throw new HttpError(404, 'No such race');
    res.json(markets);
  });

  router.post('/bets', requireUser, async (req, res) => {
    res.status(201).json(await placeBet(req.user, req.body ?? {}));
  });

  router.get('/bets', requireUser, async (req, res) => {
    const bets = await mongo().collection('bets').find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(bets.map(({ userId: _ignored, ...b }) => b));
  });

  router.get('/ledger', requireUser, async (req, res) => {
    const entries = await mongo().collection('ledger').find({ userId: req.user._id }).sort({ at: -1 }).limit(50).toArray();
    res.json(entries.map(({ userId: _ignored, ...e }) => e));
  });

  router.post('/daily', requireUser, async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (req.user.lastDailyBonus === today) throw new HttpError(400, 'Already claimed today. Come back tomorrow!');
    const streak = req.user.lastDailyBonus === yesterday ? (req.user.dailyStreak ?? 0) + 1 : 1;
    // Bonus grows with the streak, up to double.
    const amount = DAILY_BONUS + Math.min(streak - 1, 10) * 10;
    const user = await mongo()
      .collection('users')
      .findOneAndUpdate(
        { _id: req.user._id, lastDailyBonus: { $ne: today } },
        { $set: { lastDailyBonus: today, dailyStreak: streak }, $inc: { coins: amount } },
        { returnDocument: 'after' },
      );
    if (!user) throw new HttpError(400, 'Already claimed today');
    await recordLedger(req.user._id, amount, 'daily', `Daily bonus (day ${streak})`, `daily:${req.user._id}:${today}`);
    res.json({ amount, streak, coins: user.coins });
  });

  router.get('/leaderboard', async (_req, res) => {
    const board = await cached('leaderboard', MINUTE, async () => {
      const users = await mongo().collection('users').find({}, { projection: { handle: 1, displayName: 1, avatarUrl: 1, profile: 1, coins: 1, stats: 1 } }).sort({ coins: -1 }).limit(50).toArray();
      return users.map(publicUser);
    });
    res.json(board);
  });

  // Leagues: private leaderboards with an invite code.
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
    res.json({
      code: league.code,
      name: league.name,
      members: members.map(publicUser).sort((a, b) => b.coins - a.coins),
    });
  });

  return router;
}
