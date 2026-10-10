import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveContext } from '../src/ai.js';

test('live context lists the order and recent events in plain text', () => {
  const text = liveContext({
    SessionInfo: { Name: 'Race', Type: 'Race', Meeting: { Name: 'Monaco Grand Prix' } },
    LapCount: { CurrentLap: 30, TotalLaps: 78 },
    TrackStatus: { Status: '4' },
    DriverList: { 16: { Tla: 'LEC', FullName: 'Charles Leclerc' }, 81: { Tla: 'PIA', FullName: 'Oscar Piastri' } },
    TimingData: { Lines: { 16: { Position: '1', NumberOfPitStops: 1 }, 81: { Position: '2', GapToLeader: '+1.2', InPit: true } } },
    TimingAppData: { Lines: { 16: { Stints: { 0: { Compound: 'HARD', TotalLaps: 12 } } } } },
    Events: { 0: { type: 'pitIn', driver: '81', lap: 30, position: 2, ts: '2024-05-26T14:00:05Z' }, 1: { type: 'radio', driver: '16', path: 'a.mp3', ts: '2024-05-26T14:00:09Z' } },
    RadioTranscripts: { 'a.mp3': 'Box box' },
  });
  assert.match(text, /Monaco Grand Prix - Race/);
  assert.match(text, /Lap 30 of 78/);
  assert.match(text, /Track status: safety car/);
  assert.match(text, /1 \| Charles Leclerc \(LEC\) \|.*HARD \| 12 \| 1/);
  assert.match(text, /Oscar Piastri \(PIA\).*in pit/);
  assert.match(text, /14:00:05 PIA pitted on lap 30 from P2/);
  assert.match(text, /Team radio LEC: "Box box"/);
});
