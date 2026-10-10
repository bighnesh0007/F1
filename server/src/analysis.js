// Derived live data computed from the raw F1 feed:
//  - LapHistory:  per driver, one entry per completed lap (time, position, gap, tyre)
//  - Events:      overtakes, pit stops, fastest laps, flags, retirements, radio, race control
//  - CarProgress: an estimate of where each car is on the lap, from mini-sector timing.
//                 Used to draw cars on the map when real positions (F1 TV only) are missing.
//
// Each derived topic is merged into the live state and streamed like any feed topic.

const SC_STATUSES = new Set(['4', '6', '7']);
const FALLBACK_LAP_MS = 95_000;

export class Analysis {
  constructor() {
    this.reset();
  }

  reset() {
    this.eventCount = 0;
    this.lastOrder = null;
    this.drivers = {};
    this.segmentCounts = [];
    this.boundarySums = [];
    this.boundaryCounts = [];
    this.lapDurations = [];
    this.fastestLap = null;
    this.pendingPitExits = [];
  }

  driver(number) {
    return (this.drivers[number] ??= {
      inPit: false,
      retired: false,
      pittedThisLap: false,
      lapStartT: null,
      segTimes: [],
      lastLapMs: null,
      prePitPosition: null,
    });
  }

  // Called once with the full state after (re)subscribing. Returns derived topics.
  initFromSnapshot(topics, now) {
    this.reset();
    const out = {};
    this.learnSegmentLayout(topics.TimingData);
    for (const [number, line] of Object.entries(topics.TimingData?.Lines ?? {})) {
      const d = this.driver(number);
      d.inPit = Boolean(line.InPit);
      d.retired = Boolean(line.Retired);
    }
    this.lastOrder = this.order(topics);

    // Race control and team radio already in the snapshot become the feed's history.
    const events = {};
    for (const m of Object.values(topics.RaceControlMessages?.Messages ?? {})) {
      events[this.nextId()] = rcEvent(m);
    }
    for (const c of Object.values(topics.TeamRadio?.Captures ?? {})) {
      events[this.nextId()] = { type: 'radio', ts: c.Utc ?? now, driver: c.RacingNumber, path: c.Path };
    }
    if (Object.keys(events).length) out.Events = events;
    return out;
  }

  // Called after a feed patch has been merged into `topics`. Returns derived patches.
  onUpdate(topic, patch, topics, ts) {
    const t = Date.parse(ts);
    const events = [];
    const laps = {};
    const progress = {};

    if (topic === 'TimingData') {
      this.learnSegmentLayout(patch);
      for (const [number, linePatch] of Object.entries(patch.Lines ?? {})) {
        this.onTimingLine(number, linePatch, topics, t, ts, events, laps, progress);
      }
      this.detectOvertakes(topics, ts, events);
    }

    if (topic === 'TrackStatus' && patch.Status) {
      events.push({ type: 'trackStatus', ts, status: patch.Status, message: topics.TrackStatus?.Message });
    }

    if (topic === 'SessionStatus' && patch.Status) {
      events.push({ type: 'sessionStatus', ts, status: patch.Status, session: topics.SessionInfo?.Name });
    }

    if (topic === 'RaceControlMessages') {
      for (const m of Object.values(patch.Messages ?? {})) events.push(rcEvent(m));
    }

    if (topic === 'TeamRadio') {
      for (const c of Object.values(patch.Captures ?? {})) {
        events.push({ type: 'radio', ts: c.Utc ?? ts, driver: c.RacingNumber, path: c.Path });
      }
    }

    this.resolvePitExits(topics, t, ts, events);

    const out = {};
    if (events.length) {
      out.Events = Object.fromEntries(events.map((e) => [this.nextId(), e]));
    }
    if (Object.keys(laps).length) out.LapHistory = laps;
    if (Object.keys(progress).length) out.CarProgress = progress;
    return out;
  }

  nextId() {
    return String(this.eventCount++);
  }

  onTimingLine(number, linePatch, topics, t, ts, events, laps, progress) {
    const d = this.driver(number);
    const line = topics.TimingData?.Lines?.[number] ?? {};
    const driverTla = () => topics.DriverList?.[number]?.Tla ?? number;

    // Pit stops
    if (linePatch.InPit === true && !d.inPit) {
      d.inPit = true;
      d.pittedThisLap = true;
      d.prePitPosition = Number(line.Position) || null;
      events.push({ type: 'pitIn', ts, driver: number, lap: currentLap(topics, line), position: d.prePitPosition });
      progress[number] = { pit: true };
    } else if (linePatch.InPit === false && d.inPit) {
      d.inPit = false;
      // Tyre and position settle a few seconds after the car leaves the pit lane.
      this.pendingPitExits.push({ number, due: t + 8000, prePitPosition: d.prePitPosition });
      progress[number] = { pit: false };
    }

    // Retirements. "Stopped" also toggles for brief stops, so it only hides the car.
    if (linePatch.Retired === true && !d.retired) {
      d.retired = true;
      events.push({ type: 'retired', ts, driver: number, lap: currentLap(topics, line) });
      progress[number] = { ...(progress[number] ?? {}), out: true };
    }
    if (typeof linePatch.Stopped === 'boolean') {
      progress[number] = { ...(progress[number] ?? {}), out: linePatch.Stopped || d.retired };
    }

    // Fastest lap of the session
    const last = linePatch.LastLapTime;
    if (last?.OverallFastest === true) {
      const value = line.LastLapTime?.Value;
      if (value && value !== this.fastestLap) {
        this.fastestLap = value;
        events.push({ type: 'fastestLap', ts, driver: number, time: value, lap: line.NumberOfLaps });
      }
    }

    // Lap history
    if (linePatch.NumberOfLaps != null) {
      const lap = Number(linePatch.NumberOfLaps);
      const compound = latestStint(topics, number)?.Compound;
      laps[number] = {
        [lap]: {
          lap,
          time: line.LastLapTime?.Value || null,
          position: Number(line.Position) || null,
          gap: line.GapToLeader ?? line.TimeDiffToFastest ?? null,
          interval: line.IntervalToPositionAhead?.Value ?? line.TimeDiffToPositionAhead ?? null,
          sectors: [0, 1, 2].map((i) => line.Sectors?.[i]?.Value || null),
          compound: compound ?? null,
          pit: d.pittedThisLap,
          ts,
        },
      };
      d.pittedThisLap = d.inPit;
      d.lastLapRecorded = { lap, at: t };
    } else if (last?.Value && d.lastLapRecorded && t - d.lastLapRecorded.at < 5000) {
      // The lap time sometimes lands just after the lap counter.
      laps[number] = { [d.lastLapRecorded.lap]: { time: last.Value } };
    }

    // A new lap time arrives as the car crosses the finish line.
    if (last?.Value && last.Value !== d.lastLapValue) {
      d.lastLapValue = last.Value;
      progress[number] = { ...(progress[number] ?? {}), ...this.onLapStart(number, t, parseLapTime(last.Value)) };
    }

    // Mini-sector progress
    for (const [s, sector] of Object.entries(linePatch.Sectors ?? {})) {
      for (const [k, seg] of Object.entries(sector?.Segments ?? {})) {
        const status = Number(seg?.Status ?? 0);
        if (!status) continue;
        const anchor = this.onSegment(number, Number(s), Number(k), t);
        // Status bit 16 marks a mini-sector driven through the pit lane.
        if (anchor) progress[number] = { ...(progress[number] ?? {}), ...anchor, pit: d.inPit || Boolean(status & 16) };
      }
    }
  }

  learnSegmentLayout(timing) {
    for (const line of Object.values(timing?.Lines ?? {})) {
      for (const [s, sector] of Object.entries(line?.Sectors ?? {})) {
        for (const k of Object.keys(sector?.Segments ?? {})) {
          const count = Number(k) + 1;
          if (count > (this.segmentCounts[s] ?? 0)) this.segmentCounts[s] = count;
        }
      }
    }
  }

  get totalSegments() {
    return this.segmentCounts.reduce((a, b) => a + (b ?? 0), 0);
  }

  segmentIndex(sector, k) {
    let g = k;
    for (let i = 0; i < sector; i++) g += this.segmentCounts[i] ?? 0;
    return g;
  }

  // Fraction of the lap (by time) at which segment g ends; learned from completed laps.
  // The last mini-sector ends a little before the finish line.
  boundary(g) {
    const n = this.totalSegments;
    if (!n) return 0;
    if (g >= n) return 1;
    const count = this.boundaryCounts[g];
    return count >= 3 ? this.boundarySums[g] / count : (g + 1) / (n + 0.5);
  }

  referenceLapMs(d) {
    const sorted = [...this.lapDurations].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    if (d.lastLapMs && (!median || (d.lastLapMs > median * 0.85 && d.lastLapMs < median * 1.5))) return d.lastLapMs;
    return median ?? FALLBACK_LAP_MS;
  }

  // Lap time implied by the car's recent mini-sectors, so a slow (cool-down, safety
  // car) lap is not drawn at push-lap pace. Blended with the reference lap time.
  currentPaceMs(d, g, t) {
    const ref = this.referenceLapMs(d);
    if (d.lapStartT == null) return ref;
    let j = g - 1;
    while (j >= 0 && d.segTimes[j] == null) j--;
    const fromT = j >= 0 ? d.segTimes[j] : 0;
    const fromP = j >= 0 ? this.boundary(j) : 0;
    const dp = this.boundary(g) - fromP;
    const dt = t - d.lapStartT - fromT;
    if (dp <= 0.02 || dt <= 0) return ref;
    const implied = dt / dp;
    const pace = Math.min(Math.max(implied / ref, 0.8), 2.5);
    d.pace = d.pace ? d.pace * 0.5 + pace * 0.5 : pace;
    return Math.round(ref * d.pace);
  }

  // The lap counter ticks over as the car crosses the finish line.
  onLapStart(number, t, lapMs) {
    const d = this.driver(number);
    const n = this.totalSegments;
    if (d.lapStartT != null && n) {
      const measured = t - d.lapStartT;
      // Prefer the official lap time when it matches what we measured.
      const duration = lapMs && Math.abs(lapMs - measured) < 3000 ? lapMs : measured;
      const complete = d.segTimes.filter((x) => x != null).length >= n - 2;
      if (complete && !d.pittedThisLap && duration > 30_000 && duration < 300_000) {
        d.lastLapMs = duration;
        this.lapDurations.push(duration);
        if (this.lapDurations.length > 200) this.lapDurations.shift();
        d.segTimes.forEach((rel, j) => {
          if (rel == null || rel >= duration) return;
          this.boundarySums[j] = (this.boundarySums[j] ?? 0) + rel / duration;
          this.boundaryCounts[j] = (this.boundaryCounts[j] ?? 0) + 1;
        });
      }
    }
    d.lapStartT = t;
    d.segTimes = [];
    return { p: 0, pMax: this.boundary(0), t, lapMs: this.referenceLapMs(d) };
  }

  onSegment(number, sector, k, t) {
    if (!this.totalSegments) return null;
    const d = this.driver(number);
    const g = this.segmentIndex(sector, k);
    if (d.lapStartT != null) d.segTimes[g] = t - d.lapStartT;
    return { p: this.boundary(g), pMax: this.boundary(g + 1), t, lapMs: this.currentPaceMs(d, g, t) };
  }

  order(topics) {
    const lines = topics.TimingData?.Lines ?? {};
    const positions = {};
    for (const [number, line] of Object.entries(lines)) {
      const pos = Number(line.Position);
      if (pos) positions[number] = pos;
    }
    const values = Object.values(positions);
    if (values.length === 0 || new Set(values).size !== values.length) return null;
    return positions;
  }

  detectOvertakes(topics, ts, events) {
    const current = this.order(topics);
    if (!current) return; // positions mid-update (duplicates): wait for a consistent order
    const previous = this.lastOrder;
    this.lastOrder = current;
    if (!previous || !isRace(topics) || topics.SessionStatus?.Status !== 'Started') return;

    const lines = topics.TimingData?.Lines ?? {};
    const busy = (n) => {
      const l = lines[n] ?? {};
      return l.InPit || l.PitOut || l.Retired || l.Stopped || this.driver(n).inPit;
    };
    for (const [a, newPos] of Object.entries(current)) {
      const oldPos = previous[a];
      if (!oldPos || newPos >= oldPos || busy(a)) continue;
      // Who held A's new position before, and is now behind A?
      const b = Object.keys(previous).find((n) => previous[n] === newPos);
      if (!b || b === a || current[b] <= newPos || busy(b)) continue;
      events.push({ type: 'overtake', ts, driver: a, passed: b, position: newPos, lap: currentLap(topics, lines[a]) });
    }
  }

  resolvePitExits(topics, t, ts, events) {
    if (!this.pendingPitExits.length) return;
    const due = this.pendingPitExits.filter((p) => p.due <= t);
    this.pendingPitExits = this.pendingPitExits.filter((p) => p.due > t);
    for (const p of due) {
      const line = topics.TimingData?.Lines?.[p.number] ?? {};
      const stint = latestStint(topics, p.number);
      const position = Number(line.Position) || null;
      events.push({
        type: 'pitOut',
        ts,
        driver: p.number,
        compound: stint?.Compound ?? null,
        newTyres: stint?.New === true || stint?.New === 'true',
        position,
        change: p.prePitPosition && position ? p.prePitPosition - position : null,
        stops: line.NumberOfPitStops ?? null,
      });
    }
  }
}

export function parseLapTime(value) {
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return Math.round((Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000);
}

function rcEvent(m) {
  return {
    type: 'raceControl',
    ts: m.Utc ? (m.Utc.endsWith('Z') ? m.Utc : `${m.Utc}Z`) : new Date().toISOString(),
    message: m.Message,
    category: m.Category,
    flag: m.Flag ?? null,
    lap: m.Lap ?? null,
    driver: m.RacingNumber ?? null,
  };
}

function latestStint(topics, number) {
  const stints = topics.TimingAppData?.Lines?.[number]?.Stints ?? {};
  const keys = Object.keys(stints).sort((a, b) => Number(a) - Number(b));
  return keys.length ? stints[keys.at(-1)] : null;
}

function currentLap(topics, line) {
  return topics.LapCount?.CurrentLap ?? (line?.NumberOfLaps != null ? Number(line.NumberOfLaps) + 1 : null);
}

export function isRace(topics) {
  const type = topics.SessionInfo?.Type ?? '';
  return type === 'Race' || /sprint$/i.test(topics.SessionInfo?.Name ?? '');
}

export function isSafetyCar(topics) {
  return SC_STATUSES.has(String(topics.TrackStatus?.Status));
}
