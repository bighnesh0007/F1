import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseTiming, buildTimeline, medoid, parseRadio, parseWeather } from '../src/replay.js';

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

test('replay timeline keeps each driver best sector times', () => {
  const timing = [
    [1000, { Lines: { 1: { Sectors: [{ Value: '30.5' }, { Value: '40.0' }, { Value: '' }] } } }],
    [2000, { Lines: { 1: { Sectors: { 0: { Value: '31.2' }, 2: { Value: '25.1' } } } } }],
    [3000, { Lines: { 1: { Sectors: { 0: { Value: '30.1' } } } } }],
  ];
  const rows = buildTimeline(timing, [], 0).timing.filter((r) => r[1] === '1');
  const last = Object.assign({}, ...rows.map((r) => r[2]));
  assert.deepEqual([last.bs1, last.bs2, last.bs3], [30.1, 40, 25.1]);
});

test('replay timeline keeps each driver top speed through the traps', () => {
  const timing = [
    [1000, { Lines: { 1: { Speeds: { ST: { Value: '320' }, FL: { Value: '290' } } } } }],
    [2000, { Lines: { 1: { Speeds: { ST: { Value: '315' } } } } }],
  ];
  const last = Object.assign({}, ...buildTimeline(timing, [], 0).timing.map((r) => r[2]));
  assert.equal(last.st, 320);
  assert.equal(last.fl, 290);
});

test('analyse timing finds sector lines, pit stops and the pit loss', () => {
  // One car on a straight line: x = t / 10 (stream ms), y = 0.
  const t = Float64Array.from({ length: 4000 }, (_, i) => i * 250);
  const pos = { 1: { t, x: Float32Array.from(t, (v) => v / 10), y: new Float32Array(t.length) } };
  const timing = [];
  for (let lap = 1; lap <= 6; lap++) {
    const base = lap * 100_000;
    timing.push([base + 30_000, { Lines: { 1: { Sectors: { 0: { Value: '30.000' } } } } }]);
    timing.push([base + 60_000, { Lines: { 1: { Sectors: { 1: { Value: '30.000' } } } } }]);
    const time = lap === 3 || lap === 4 ? '1:51.000' : '1:30.000';
    timing.push([base + 90_000, { Lines: { 1: { NumberOfLaps: lap, LastLapTime: { Value: time } } } }]);
  }
  timing.push([320_000, { Lines: { 1: { InPit: true } } }]);
  timing.push([342_000, { Lines: { 1: { InPit: false, PitOut: true } } }]);
  timing.sort((a, b) => a[0] - b[0]);
  const r = analyseTiming(timing, pos, [], 0);
  assert.equal(r.lapEnds[1][3], 390_000);
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].lap, 3);
  assert.equal(r.stops[0].lane, 22);
  assert.equal(r.stops[0].loss, 42);
  assert.equal(r.stops[0].sc, false);
  assert.ok(r.pitLane.length >= 8);
  // Sector 1 ends 30 s into each lap; the car is drawn 1.75 s earlier.
  assert.equal(r.sectorPoints[0][1], 0);
});

test('weather and radio rows', () => {
  assert.deepEqual(parseWeather([[1000, { AirTemp: '30.1', TrackTemp: '43', WindDirection: '120', WindSpeed: '1.3', Humidity: '70', Rainfall: '0' }], [2000, { Rainfall: '1' }]], 0), [
    [1000, 30.1, 43, 120, 1.3, 70, 0],
    [2000, 30.1, 43, 120, 1.3, 70, 1],
  ]);
  const toT = (utc) => Date.parse(utc) - Date.parse('2026-01-01T00:00:00Z');
  const rows = parseRadio([[0, { Captures: [{ Utc: '2026-01-01T00:00:05Z', RacingNumber: 44, Path: 'a.mp3' }] }], [1, { Captures: { 1: { Utc: '2026-01-01T00:00:09Z', RacingNumber: '1', Path: 'b.mp3' }, 0: { Utc: '2026-01-01T00:00:05Z', RacingNumber: 44, Path: 'a.mp3' } } }]], toT);
  assert.deepEqual(rows, [[5000, '44', 'a.mp3'], [9000, '1', 'b.mp3']]);
  assert.deepEqual(medoid([[0, 0], [10, 0], [11, 0], [500, 0]]), [10, 0]);
});
