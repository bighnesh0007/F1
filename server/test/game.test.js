import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverPoints, outcome } from '../src/game.js';

const r = (id, position, extra = {}) => ({ driver: { id }, position, status: 'Finished', teamId: 'team', ...extra });

test('favourites are worth less than outsiders, capped at 300', () => {
  assert.equal(driverPoints(1), 25);
  assert.ok(driverPoints(5) > driverPoints(2));
  assert.equal(driverPoints(40), 300);
  assert.equal(driverPoints(undefined), driverPoints(15));
});

test('winner, podium and pole calls', () => {
  const data = { race: [r('max', 1), r('lando', 2), r('oscar', 3), r('lewis', 4)], quali: [r('lando', 1)], sprint: null };
  assert.equal(outcome({ market: 'winner', pick: 'max' }, data), true);
  assert.equal(outcome({ market: 'winner', pick: 'lando' }, data), false);
  assert.equal(outcome({ market: 'podium', pick: 'oscar' }, data), true);
  assert.equal(outcome({ market: 'podium', pick: 'lewis' }, data), false);
  assert.equal(outcome({ market: 'pole', pick: 'lando' }, data), true);
});

test('unknown results stay open (null)', () => {
  const data = { race: null, quali: null, sprint: null };
  for (const market of ['winner', 'podium', 'pole', 'fastestLap', 'sprintWinner', 'dnfs', 'teammates:x']) {
    assert.equal(outcome({ market, pick: 'max' }, data), null, market);
  }
});

test('fastest lap is void when no lap is ranked', () => {
  const data = { race: [r('max', 1), r('lando', 2, { fastestLap: { rank: 1 } })] };
  assert.equal(outcome({ market: 'fastestLap', pick: 'lando' }, data), true);
  assert.equal(outcome({ market: 'fastestLap', pick: 'lando' }, { race: [r('max', 1)] }), 'void');
});

test('retirements count anything not finished or lapped', () => {
  const race = [r('a', 1), r('b', 2, { status: '+1 Lap' }), r('c', 3, { status: 'Engine' }), r('d', 4, { status: 'Collision' }), r('e', 5, { status: 'Accident' })];
  assert.equal(outcome({ market: 'dnfs', pick: 'over' }, { race }), true);
  assert.equal(outcome({ market: 'dnfs', pick: 'under' }, { race }), false);
});

test('teammate battle', () => {
  const race = [r('max', 1, { teamId: 'red_bull' }), r('lando', 2, { teamId: 'mclaren' }), r('yuki', 9, { teamId: 'red_bull' })];
  assert.equal(outcome({ market: 'teammates:red_bull', pick: 'max' }, { race }), true);
  assert.equal(outcome({ market: 'teammates:red_bull', pick: 'yuki' }, { race }), false);
  assert.equal(outcome({ market: 'teammates:mclaren', pick: 'lando' }, { race }), 'void');
});
