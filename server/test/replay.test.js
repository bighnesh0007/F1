import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../src/f1static.js';

test('replay timeline keeps only changed board fields and qualifying parts', () => {
  const timing = [
    [0, { SessionPart: 1, NoEntries: [20, 15, 10], Lines: { 1: { Position: '1', NumberOfLaps: 0, BestLapTimes: [{ Value: '' }, { Value: '' }, { Value: '' }] } } }],
    [5000, { Lines: { 1: { BestLapTimes: { 0: { Value: '1:30.000' } }, NumberOfLaps: 3 } } }],
    [6000, { Lines: { 1: { NumberOfLaps: 3 } } }],
    [9000, { SessionPart: 2, Lines: { 44: { KnockedOut: true, Position: '16' } } }],
  ];
  const app = [[1000, { Lines: { 1: { GridPos: '3', Stints: [{ Compound: 'SOFT', New: 'true', TotalLaps: 0, StartLaps: 0 }] } } }]];
  const { timing: rows, parts, cutoffs } = buildTimeline(timing, app, 0);
  assert.deepEqual(parts, [[0, 1], [9000, 2]]);
  assert.deepEqual(cutoffs, [20, 15, 10]);
  assert.equal(rows[0][2].p, 1);
  assert.deepEqual(rows.find((r) => r[0] === 1000)[2], { grid: 3, tyre: 'SOFT', fresh: true, tyreLaps: 0 });
  assert.deepEqual(rows.find((r) => r[0] === 5000)[2], { laps: 3, q1: '1:30.000' });
  assert.equal(rows.some((r) => r[0] === 6000), false); // nothing changed
  assert.deepEqual(rows.find((r) => r[1] === '44')[2].ko, true);
});

test('replay timeline finds the typical sector times', () => {
  const timing = [1, 2, 3].map((k) => [k * 1000, { Lines: { 1: { Sectors: { 0: { Value: `${30 + k}.0` }, 1: { Value: '40.5' }, 2: { Value: '' } } }, 4: { Sectors: [{ Value: '31.0' }, { Value: '41.0' }, { Value: '25.5' }] } } }]);
  assert.deepEqual(buildTimeline(timing, [], 0).sectorTimes, [31, 41, 25.5]);
});
