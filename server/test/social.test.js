import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverPrice, driverScore, teamPrice, teamScore, validateTeam } from '../src/fantasy.js';
import { makeQuestion, rng, weekKey } from '../src/quiz.js';
import { nextStreak } from '../src/streaks.js';
import { cleanText, validRoom } from '../src/chat.js';
import { currentPolls } from '../src/polls.js';

const r = (id, position, grid, teamId, points, status = 'Finished') => ({ driver: { id, name: id }, position, grid, teamId, team: teamId, points, status });

test('fantasy prices follow the championship', () => {
  assert.equal(driverPrice(1), 32);
  assert.ok(driverPrice(10) < driverPrice(2));
  assert.equal(driverPrice(30), 4.5);
  assert.equal(teamPrice(1), 30);
  assert.equal(teamPrice(12), 5);
});

test('fantasy team rules: 5 drivers, 2 teams, captain, budget', () => {
  const market = {
    drivers: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, price: [32, 30, 10, 8, 6, 5][i] })),
    constructors: [{ id: 'x', price: 30 }, { id: 'y', price: 7 }, { id: 'z', price: 5 }],
  };
  assert.throws(() => validateTeam(market, { drivers: ['a', 'b'], constructors: ['y', 'z'], captain: 'a' }), /exactly 5 drivers/);
  assert.throws(() => validateTeam(market, { drivers: ['a', 'b', 'c', 'd', 'e'], constructors: ['x', 'y'], captain: 'a' }), /Over budget: 123/);
  assert.throws(() => validateTeam(market, { drivers: ['c', 'd', 'e', 'f', 'b'], constructors: ['y', 'z'], captain: 'a' }), /captain/);
  const ok = validateTeam(market, { drivers: ['c', 'd', 'e', 'f', 'b'], constructors: ['y', 'z'], captain: 'b' });
  assert.equal(ok.cost, 71);
});

test('fantasy scoring: points, places gained, DNF, captain double, team totals', () => {
  const race = [r('a', 1, 3, 'x', 25), r('b', 2, 1, 'x', 18), r('c', 10, 20, 'y', 1), r('d', 18, 5, 'y', 0, 'Engine')];
  assert.equal(driverScore('a', race), 27);
  assert.equal(driverScore('b', race), 17);
  assert.equal(driverScore('c', race), 11); // +10 cap
  assert.equal(driverScore('d', race), -5);
  const sprint = [r('a', 1, 1, 'x', 8)];
  assert.equal(driverScore('a', race, sprint), 35);
  const { score, breakdown } = teamScore({ drivers: ['a', 'c'], constructors: ['x'], captain: 'c' }, race);
  assert.deepEqual(breakdown, { a: 27, c: 22, x: 43 });
  assert.equal(score, 92);
});

test('quiz weeks and questions are deterministic', () => {
  assert.equal(weekKey(new Date('2026-01-01T12:00:00Z')), '2026-W01');
  assert.equal(weekKey(new Date('2024-12-30T12:00:00Z')), '2025-W01');
  const a = rng('w1');
  const b = rng('w1');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const race = { name: 'Monaco Grand Prix', results: Array.from({ length: 12 }, (_, i) => ({ driver: { name: `D${i}` }, team: `T${i % 6}`, fastestLap: i === 4 ? { rank: 1 } : null })) };
  const q = makeQuestion(rng('x'), 'winner', 2010, race);
  assert.equal(q.text, 'Who won the 2010 Monaco Grand Prix?');
  assert.equal(q.answer, 'D0');
  assert.equal(q.options.length, 4);
  assert.ok(q.options.includes('D0'));
  assert.equal(makeQuestion(rng('x'), 'fastest', 2010, race).answer, 'D4');
  assert.equal(makeQuestion(rng('x'), 'pole', 2010, race), null);
});

test('weekend streaks count consecutive rounds, across seasons too', () => {
  let s = nextStreak(null, 202401);
  s = nextStreak(s, 202402);
  s = nextStreak(s, 202402);
  assert.equal(s.current, 2);
  s = nextStreak(s, 202501);
  assert.equal(s.current, 3);
  s = nextStreak(s, 202503);
  assert.deepEqual(s, { current: 1, best: 3, last: 202503 });
});

test('chat rooms and text cleaning', () => {
  assert.ok(validRoom('everyone'));
  assert.ok(validRoom('tribe-ferrari'));
  assert.ok(!validRoom('tribe-nope'));
  assert.equal(cleanText('  hi\u0000 there\n\n '), 'hi there');
  assert.equal(cleanText('what the fuck'), 'what the f***');
  assert.equal(cleanText('x'.repeat(400)).length, 280);
});

test('polls open and close with race distance', () => {
  const topics = (lap, status = 'Started') => ({
    SessionInfo: { Path: '2024/r/', Type: 'Race', Name: 'Race' },
    SessionStatus: { Status: status },
    LapCount: { CurrentLap: lap, TotalLaps: 50 },
    DriverList: { 1: { Tla: 'VER' }, 16: { Tla: 'LEC' } },
  });
  const at = (lap, status) => Object.fromEntries(currentPolls(topics(lap, status)).map((p) => [p.kind, p.open]));
  assert.deepEqual(at(10), { winner: true, dotd: false });
  assert.deepEqual(at(40), { winner: false, dotd: true });
  assert.deepEqual(at(50, 'Finished'), { winner: false, dotd: true });
  assert.equal(currentPolls({ ...topics(5), SessionInfo: { Path: 'p', Type: 'Practice', Name: 'Practice 1' } }).length, 0);
  assert.equal(currentPolls(topics(5))[0].options.length, 2);
});
