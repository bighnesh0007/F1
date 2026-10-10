import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { decodeTopic, deepMerge, LiveState, normalize } from '../src/state.js';
import { parseLapTime } from '../src/analysis.js';

test('arrays become index-keyed objects and keyframe markers are dropped', () => {
  assert.deepEqual(normalize({ _kf: true, Lines: [{ a: 1 }, { b: [2] }] }), { Lines: { 0: { a: 1 }, 1: { b: { 0: 2 } } } });
});

test('deep merge applies partial updates and deletions', () => {
  const base = { Lines: { 1: { Position: '1', Gap: '+0' }, 2: { Position: '2' } } };
  const merged = deepMerge(base, { Lines: { 1: { Gap: '+1.2' }, _deleted: ['2'] } });
  assert.deepEqual(merged, { Lines: { 1: { Position: '1', Gap: '+1.2' } } });
});

test('compressed topics are decoded', () => {
  const data = deflateRawSync(Buffer.from(JSON.stringify({ Entries: [] }))).toString('base64');
  assert.deepEqual(decodeTopic('CarData.z', data), { topic: 'CarData', data: { Entries: [] } });
  assert.deepEqual(decodeTopic('TimingData', { a: 1 }), { topic: 'TimingData', data: { a: 1 } });
});

test('lap times parse to milliseconds', () => {
  assert.equal(parseLapTime('1:32.090'), 92090);
  assert.equal(parseLapTime(''), null);
});

test('live state turns feed messages into race events', () => {
  const s = new LiveState();
  s.load({
    SessionInfo: { Name: 'Race', Type: 'Race', Path: '2024/x/' },
    DriverList: { 1: { Tla: 'VER' }, 4: { Tla: 'NOR' } },
    TimingData: { Lines: { 1: { Position: '1', Line: 1 }, 4: { Position: '2', Line: 2 } } },
  });
  const ts = '2024-06-01T12:00:00Z';
  s.apply('TeamRadio', { Captures: [{ Utc: ts, RacingNumber: '4', Path: 'TeamRadio/a.mp3' }] }, ts);
  s.apply('TimingData', { Lines: { 4: { InPit: true } } }, ts);
  s.apply('RaceControlMessages', { Messages: [{ Utc: '2024-06-01T12:00:01', Category: 'Flag', Flag: 'YELLOW', Message: 'YELLOW IN SECTOR 2' }] }, ts);
  const types = Object.values(s.topics.Events).map((e) => e.type);
  assert.deepEqual(types, ['radio', 'pitIn', 'raceControl']);
  assert.equal(s.topics.TimingData.Lines[4].InPit, true);
});

test('position samples keep only the latest', () => {
  const s = new LiveState();
  s.load({ SessionInfo: { Name: 'Race' } });
  const ups = s.apply('Position', { Position: [{ Timestamp: 'a', Entries: { 1: { X: 1 } } }, { Timestamp: 'b', Entries: { 1: { X: 2 } } }] });
  assert.equal(ups[0].replace, true);
  assert.equal(s.topics.Position.Timestamp, 'b');
});
