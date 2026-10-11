// Replays of finished sessions from F1's public live timing archive.
//
// A session is downloaded and parsed once and its heavy parts (every car's
// position and telemetry samples) are kept in memory for the two most recently
// used sessions. From that the server builds:
//   - the replay itself (positions twice a second, the timing board as it
//     changed, weather, radio, flags, pit stops, sector lines, pit lane), and
//   - telemetry for a single lap or a single car on request.
import { cached, DAY } from './http.js';
import { fetchStatic, fetchStaticJson, getArchivedSessions, normalizeDrivers, parseStream } from './f1static.js';
import { getCircuitMap } from './maps.js';

const STEP_MS = 500;
// Timing messages reach the feed a moment after the car crosses the timing line
// (measured against GPS positions on archived sessions: about 1.75 s).
const TIMING_LAG_MS = 1750;
const PATH_RE = /^\d{4}\/[\w\-.]+\/[\w\-.]+\/$/;

function checkPath(path) {
  if (!PATH_RE.test(path)) throw Object.assign(new Error('Invalid session path'), { status: 400 });
}

// --- Timing board ------------------------------------------------------------

// Merges a feed patch into a state object. Arrays in the first message are later
// patched by index ("1": {...}), so they are kept as index-keyed objects.
function merge(target, patch) {
  const src = Array.isArray(patch) ? Object.fromEntries(patch.map((v, i) => [i, v])) : patch;
  for (const [k, v] of Object.entries(src ?? {})) {
    if (v && typeof v === 'object') target[k] = merge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
    else target[k] = v;
  }
  return target;
}

const lastOf = (obj) => {
  const keys = Object.keys(obj ?? {}).sort((a, b) => Number(a) - Number(b));
  return keys.length ? obj[keys.at(-1)] : undefined;
};

// The board fields the replay needs from one driver's TimingData line.
function timingSummary(line, before = {}) {
  const parts = line.BestLapTimes ?? {};
  // Personal best time in each sector so far (sector times reset every lap).
  const bestSector = (i) => {
    const v = Number(line.Sectors?.[i]?.Value);
    const prev = before[`bs${i + 1}`] ?? null;
    return v > 5 && v < 200 && (prev == null || v < prev) ? v : prev;
  };
  // Highest speed through each speed trap so far (km/h).
  const topSpeed = (trap, key) => {
    const v = Number(line.Speeds?.[trap]?.Value);
    const prev = before[key] ?? null;
    return v > 50 && v < 420 && (prev == null || v > prev) ? v : prev;
  };
  return {
    p: Number(line.Position) || null,
    laps: Number(line.NumberOfLaps) || 0,
    best: line.BestLapTime?.Value || null,
    last: line.LastLapTime?.Value || null,
    gap: line.GapToLeader || line.TimeDiffToFastest || null,
    int: line.IntervalToPositionAhead?.Value || line.TimeDiffToPositionAhead || null,
    pit: line.InPit === true,
    stops: Number(line.NumberOfPitStops) || 0,
    out: line.Retired === true,
    stop: line.Stopped === true,
    ko: line.KnockedOut === true,
    q1: parts[0]?.Value || null,
    q2: parts[1]?.Value || null,
    q3: parts[2]?.Value || null,
    bs1: bestSector(0),
    bs2: bestSector(1),
    bs3: bestSector(2),
    st: topSpeed('ST', 'st'),
    fl: topSpeed('FL', 'fl'),
    i1: topSpeed('I1', 'i1'),
    i2: topSpeed('I2', 'i2'),
  };
}

function appSummary(line) {
  const stint = lastOf(line.Stints);
  return {
    grid: Number(line.GridPos) || null,
    tyre: stint?.Compound && stint.Compound !== 'UNKNOWN' ? stint.Compound : null,
    fresh: stint?.New === true || stint?.New === 'true',
    tyreLaps: stint ? Math.max(0, (Number(stint.TotalLaps) || 0) - (Number(stint.StartLaps) || 0)) : null,
  };
}

// Turns a TimingData-like stream into [t, driver, changes] rows (only fields that changed).
function diffStream(stream, summarize, offsetMs) {
  const lines = {};
  const prev = {};
  const out = [];
  for (const [t, data] of stream) {
    for (const [n, patch] of Object.entries(data.Lines ?? {})) {
      if (!patch || typeof patch !== 'object') continue;
      merge((lines[n] ??= {}), patch);
      const before = prev[n] ?? {};
      const now = summarize(lines[n], before);
      const changes = {};
      for (const [k, v] of Object.entries(now)) if (before[k] !== v) changes[k] = v;
      prev[n] = now;
      if (Object.keys(changes).length) out.push([Math.max(0, t - offsetMs), n, changes]);
    }
  }
  return out;
}

// Board changes from TimingData and TimingAppData, plus qualifying parts.
export function buildTimeline(timingStream, appStream, offsetMs = 0) {
  const parts = [];
  let cutoffs = null;
  for (const [t, data] of timingStream) {
    if (data.SessionPart != null && Number(data.SessionPart) !== parts.at(-1)?.[1]) parts.push([Math.max(0, t - offsetMs), Number(data.SessionPart)]);
    if (data.NoEntries) cutoffs = Object.values(data.NoEntries).map(Number);
  }
  const timing = [...diffStream(timingStream, timingSummary, offsetMs), ...diffStream(appStream, appSummary, offsetMs)].sort((a, b) => a[0] - b[0]);
  return { timing, parts, cutoffs, sectorTimes: medianSectors(timingStream) };
}

// Typical time for each of the three sectors (median of every sector time set in
// the session), used to colour the map by sector when exact lines aren't known.
function medianSectors(timingStream) {
  const times = [[], [], []];
  for (const [, data] of timingStream) {
    for (const line of Object.values(data.Lines ?? {})) {
      const sectors = line?.Sectors;
      if (!sectors || typeof sectors !== 'object') continue;
      for (const [i, sector] of Object.entries(sectors)) {
        const v = Number(sector?.Value);
        if (times[i] && v > 5 && v < 200) times[i].push(v);
      }
    }
  }
  if (times.some((t) => t.length === 0)) return null;
  return times.map((t) => median(t));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// [t, current lap, total laps]; the total is only sent now and then, so carry it forward.
function lapRows(stream, offsetMs) {
  let total = null;
  const rows = [];
  for (const [t, d] of stream) {
    if (d.TotalLaps != null) total = d.TotalLaps;
    if (d.CurrentLap != null) rows.push([Math.max(0, t - offsetMs), d.CurrentLap, total]);
  }
  return rows;
}

// Remaining session time: [t, remaining ms, counting down?].
function parseClock(stream, offsetMs) {
  return stream
    .filter(([, d]) => d.Remaining)
    .map(([t, d]) => {
      const [h, m, s] = String(d.Remaining).split(':').map(Number);
      return [Math.max(0, t - offsetMs), ((h * 60 + m) * 60 + s) * 1000, d.Extrapolating === true];
    });
}

// [t, air °C, track °C, wind direction °, wind m/s, humidity %, raining 0/1]
export function parseWeather(stream, offsetMs) {
  const state = {};
  const rows = [];
  for (const [t, d] of stream) {
    Object.assign(state, d);
    const num = (k) => (state[k] != null && state[k] !== '' ? Number(state[k]) : null);
    rows.push([Math.max(0, t - offsetMs), num('AirTemp'), num('TrackTemp'), num('WindDirection'), num('WindSpeed'), num('Humidity'), num('Rainfall') ? 1 : 0]);
  }
  return rows;
}

// [t, driver, clip path] for every team radio clip.
export function parseRadio(stream, toT) {
  const seen = new Set();
  const rows = [];
  for (const [, d] of stream) {
    const captures = Array.isArray(d.Captures) ? d.Captures : Object.values(d.Captures ?? {});
    for (const c of captures) {
      if (!c?.Path || seen.has(c.Path)) continue;
      seen.add(c.Path);
      const t = c.Utc ? toT(c.Utc) : null;
      if (t != null && t >= 0) rows.push([t, String(c.RacingNumber), c.Path]);
    }
  }
  return rows.sort((a, b) => a[0] - b[0]);
}

const lapMs = (value) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(value ?? '').trim());
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 : null;
};

// --- Positions ---------------------------------------------------------------

// Every position sample per car, as typed arrays (t is ms from the stream start).
function parsePositions(text, numbers) {
  const tmp = Object.fromEntries(numbers.map((n) => [n, { t: [], x: [], y: [] }]));
  let startUtc = null;
  for (const [t, data] of parseStream(text, true)) {
    for (const sample of data.Position ?? []) {
      const utc = Date.parse(sample.Timestamp);
      if (!utc) continue;
      if (startUtc == null) startUtc = utc - t;
      const st = utc - startUtc;
      for (const [n, e] of Object.entries(sample.Entries ?? {})) {
        const car = tmp[n];
        if (!car) continue;
        const off = e.Status === 'OffTrack' || String(e.Status) === '1'; // older sessions use 0/1
        car.t.push(st);
        // Off track / no signal is stored as a gap (NaN) so the car isn't frozen in place.
        car.x.push(off || (!e.X && !e.Y) ? NaN : e.X);
        car.y.push(off || (!e.X && !e.Y) ? NaN : e.Y);
      }
    }
  }
  const pos = {};
  for (const [n, c] of Object.entries(tmp)) pos[n] = { t: Float64Array.from(c.t), x: Float32Array.from(c.x), y: Float32Array.from(c.y) };
  return { pos, startUtc };
}

// Index of the last sample at or before t (binary search), or -1.
function indexAt(times, t) {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || times[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// A car's position at stream time t, interpolated between samples; null when it
// isn't on track or the last sample is too old.
function positionAt(car, t, maxGap = 3000) {
  if (!car) return null;
  const i = indexAt(car.t, t);
  if (i < 0 || t - car.t[i] > maxGap || Number.isNaN(car.x[i])) return null;
  const j = i + 1;
  if (j < car.t.length && !Number.isNaN(car.x[j]) && car.t[j] - car.t[i] < maxGap) {
    const k = (t - car.t[i]) / (car.t[j] - car.t[i] || 1);
    return [car.x[i] + (car.x[j] - car.x[i]) * k, car.y[i] + (car.y[j] - car.y[i]) * k];
  }
  return [car.x[i], car.y[i]];
}

// The sample point with the smallest total distance to the others (robust "middle").
export function medoid(points, max = 300) {
  if (points.length === 0) return null;
  const step = Math.max(1, Math.floor(points.length / max));
  const pts = points.filter((_, i) => i % step === 0);
  let best = pts[0];
  let bestSum = Infinity;
  for (const a of pts) {
    let sum = 0;
    for (const b of pts) sum += Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (sum < bestSum) {
      bestSum = sum;
      best = a;
    }
  }
  return [Math.round(best[0]), Math.round(best[1])];
}

// --- Session -----------------------------------------------------------------

// Small least-recently-used cache of promises.
function memo(map, key, max, load) {
  if (map.has(key)) {
    const hit = map.get(key);
    map.delete(key);
    map.set(key, hit);
    return hit;
  }
  const promise = load().catch((err) => {
    map.delete(key);
    throw err;
  });
  map.set(key, promise);
  while (map.size > max) map.delete(map.keys().next().value);
  return promise;
}

const sessions = new Map();

function loadSession(path) {
  checkPath(path);
  return memo(sessions, path, 2, () => buildSession(path));
}

async function buildSession(path) {
  const optional = (file) => fetchStatic(`${path}${file}`).catch(() => '');
  const [info, drivers, position, timing, timingApp, lapCount, clock, trackStatus, rc, weather, radio] = await Promise.all([
    fetchStaticJson(`${path}SessionInfo.json`),
    fetchStaticJson(`${path}DriverList.json`),
    fetchStatic(`${path}Position.z.jsonStream`),
    fetchStatic(`${path}TimingData.jsonStream`),
    optional('TimingAppData.jsonStream'),
    optional('LapCount.jsonStream'),
    optional('ExtrapolatedClock.jsonStream'),
    optional('TrackStatus.jsonStream'),
    fetchStaticJson(`${path}RaceControlMessages.json`).catch(() => ({ Messages: [] })),
    optional('WeatherData.jsonStream'),
    optional('TeamRadio.jsonStream'),
  ]);

  const driverMap = normalizeDrivers(drivers);
  const numbers = Object.keys(driverMap).sort((a, b) => (drivers[a]?.Line ?? 99) - (drivers[b]?.Line ?? 99));
  const { pos, startUtc } = parsePositions(position, numbers);

  // Positions twice a second for every car, from the first moment any car is out.
  const end = Math.max(0, ...Object.values(pos).map((c) => c.t.at(-1) ?? 0));
  let firstT = Infinity;
  for (const c of Object.values(pos)) {
    const i = c.x.findIndex((v) => !Number.isNaN(v));
    if (i >= 0) firstT = Math.min(firstT, c.t[i]);
  }
  if (!Number.isFinite(firstT)) firstT = 0;
  const offsetMs = Math.floor(firstT / STEP_MS) * STEP_MS;
  const frames = [];
  for (let T = offsetMs; T <= end; T += STEP_MS) {
    frames.push(numbers.flatMap((n) => {
      const p = positionAt(pos[n], T);
      return p ? [Math.round(p[0]), Math.round(p[1])] : [null, null];
    }));
  }

  const toT = (utcString) => (startUtc ? Date.parse(String(utcString).endsWith('Z') ? utcString : `${utcString}Z`) - startUtc - offsetMs : null);
  const timingStream = parseStream(timing, false);
  const statusRows = parseStream(trackStatus, false).map(([t, d]) => [Math.max(0, t - offsetMs), d.Status, d.Message]);
  const board = buildTimeline(timingStream, parseStream(timingApp, false), offsetMs);
  const derived = analyseTiming(timingStream, pos, statusRows, offsetMs);
  const circuitKey = info.Meeting?.Circuit?.Key ?? null;
  const map = circuitKey ? await getCircuitMap({ key: circuitKey, location: info.Meeting?.Location }).catch(() => null) : null;

  const replay = {
    path,
    meeting: info.Meeting?.Name,
    session: info.Name,
    type: info.Type,
    circuitKey,
    location: info.Meeting?.Location,
    stepMs: STEP_MS,
    startUtc: startUtc ? new Date(startUtc + offsetMs).toISOString() : null,
    drivers: numbers.map((n) => driverMap[n]),
    frames,
    timing: board.timing,
    parts: board.parts,
    cutoffs: board.cutoffs,
    sectorTimes: board.sectorTimes,
    sectorPoints: derived.sectorPoints,
    pitLane: derived.pitLane,
    pitLoss: derived.pitLoss,
    stops: derived.stops,
    clock: parseClock(parseStream(clock, false), offsetMs),
    laps: lapRows(parseStream(lapCount, false), offsetMs),
    trackStatus: statusRows,
    weather: parseWeather(parseStream(weather, false), offsetMs),
    radio: parseRadio(parseStream(radio, false), toT),
    raceControl: (rc.Messages ?? [])
      .map((m) => ({
        t: m.Utc ? toT(m.Utc) : null,
        message: m.Message,
        flag: m.Flag ?? null,
        category: m.Category,
        scope: m.Scope ?? null,
        sector: m.Sector ?? null,
        lap: m.Lap ?? null,
        driver: m.RacingNumber ?? null,
      }))
      .filter((m) => m.t != null && m.t >= 0),
  };

  return {
    replay,
    pos,
    startUtc,
    offsetMs,
    lapEnds: derived.lapEnds,
    lapTimes: derived.lapTimes,
    finish: map?.source === 'multiviewer' ? [map.x[0], map.y[0]] : null,
  };
}

// Things worked out from the timing stream together with the car positions:
// exact sector lines, the pit lane, every pit stop and the time a stop costs.
export function analyseTiming(timingStream, pos, statusRows, offsetMs) {
  const lines = {};
  const lapEnds = {}; // driver -> lap -> stream time the lap was completed
  const lapTimes = {}; // driver -> lap -> ms
  const sectorHits = [[], []];
  const pitOpen = {};
  const pits = [];

  for (const [t, data] of timingStream) {
    for (const [n, patch] of Object.entries(data.Lines ?? {})) {
      if (!patch || typeof patch !== 'object') continue;
      const before = lines[n] ? Number(lines[n].NumberOfLaps) || 0 : 0;
      const line = merge((lines[n] ??= {}), patch);
      const laps = Number(line.NumberOfLaps) || 0;
      if (laps > before) {
        (lapEnds[n] ??= {})[laps] = t;
        const ms = lapMs(line.LastLapTime?.Value);
        if (ms) (lapTimes[n] ??= {})[laps] = ms;
      }
      // The car is at the end of sector 1 or 2 when that sector's time appears.
      const sectors = patch.Sectors && typeof patch.Sectors === 'object' ? (Array.isArray(patch.Sectors) ? Object.fromEntries(patch.Sectors.map((v, i) => [i, v])) : patch.Sectors) : null;
      for (const i of [0, 1]) {
        const v = sectors?.[i]?.Value;
        if (v && Number(v) > 5) {
          const p = positionAt(pos[n], t - TIMING_LAG_MS);
          if (p) sectorHits[i].push(p);
        }
      }
      if (patch.InPit === true && pitOpen[n] == null) pitOpen[n] = { t, lap: laps + 1 };
      if ((patch.InPit === false || patch.PitOut === true) && pitOpen[n] != null) {
        pits.push({ n, in: pitOpen[n].t, out: t, lap: pitOpen[n].lap });
        delete pitOpen[n];
      }
    }
  }

  const statusAt = (t) => {
    let s = '1';
    for (const [st, status] of statusRows) {
      if (st > t) break;
      s = status;
    }
    return s;
  };
  const neutralised = (t) => ['4', '6', '7'].includes(String(statusAt(t)));

  // Pit stops: time in the lane, and the time lost against a normal lap.
  const greenMedian = (n) => median(Object.values(lapTimes[n] ?? {}).filter((v) => v > 30_000 && v < 200_000));
  const stops = pits
    .filter((p) => p.out - p.in > 5000 && p.out - p.in < 90_000)
    .map((p) => {
      const typical = greenMedian(p.n);
      const inLap = lapTimes[p.n]?.[p.lap];
      const outLap = lapTimes[p.n]?.[p.lap + 1];
      const loss = typical && inLap && outLap ? (inLap + outLap - 2 * typical) / 1000 : null;
      return {
        t: Math.max(0, p.in - offsetMs),
        n: p.n,
        lap: p.lap,
        lane: Math.round((p.out - p.in) / 100) / 10,
        loss: loss != null && loss > 5 && loss < 60 ? Math.round(loss * 10) / 10 : null,
        sc: neutralised(p.in - offsetMs),
      };
    });
  const greenLosses = stops.filter((s) => !s.sc && s.loss != null).map((s) => s.loss);
  const pitLoss = greenLosses.length >= 2 ? median(greenLosses) : null;

  // The pit lane: the path of a typical stop (not a long garage stay).
  let pitLane = null;
  const candidates = pits.filter((p) => p.out - p.in > 12_000 && p.out - p.in < 45_000).sort((a, b) => a.out - a.in - (b.out - b.in));
  for (const p of candidates.length ? [candidates[Math.floor(candidates.length / 2)], ...candidates] : []) {
    const car = pos[p.n];
    if (!car) continue;
    const pts = [];
    for (let i = indexAt(car.t, p.in - 4000); i >= 0 && i < car.t.length && car.t[i] <= p.out + 2000; i++) {
      if (Number.isNaN(car.x[i])) continue;
      const q = [Math.round(car.x[i]), Math.round(car.y[i])];
      const last = pts.at(-1);
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 40) pts.push(q);
    }
    if (pts.length >= 8) {
      pitLane = pts;
      break;
    }
  }

  const sectorPoints = sectorHits.every((h) => h.length >= 3) ? sectorHits.map((h) => medoid(h)) : null;
  return { lapEnds, lapTimes, sectorPoints, pitLane, pitLoss, stops };
}

export function getReplay(path) {
  checkPath(path);
  return cached(`replay:v5:${path}`, DAY, async () => (await loadSession(path)).replay);
}

// --- Telemetry ---------------------------------------------------------------

const carCache = new Map();

// Speed, RPM, gear, throttle, brake and DRS for every car (about 4 samples a second).
function loadCarData(path) {
  return memo(carCache, path, 2, async () => {
    const session = await loadSession(path);
    const text = await fetchStatic(`${path}CarData.z.jsonStream`);
    const tmp = {};
    for (const [, data] of parseStream(text, true)) {
      for (const entry of data.Entries ?? []) {
        const utc = Date.parse(entry.Utc);
        if (!utc) continue;
        const st = utc - session.startUtc;
        for (const [n, car] of Object.entries(entry.Cars ?? {})) {
          const ch = car?.Channels ?? {};
          const c = (tmp[n] ??= { t: [], speed: [], rpm: [], gear: [], throttle: [], brake: [], drs: [] });
          c.t.push(st);
          c.speed.push(Number(ch['2']) || 0);
          c.rpm.push(Number(ch['0']) || 0);
          c.gear.push(Number(ch['3']) || 0);
          c.throttle.push(Math.min(100, Math.max(0, Number(ch['4']) || 0)));
          c.brake.push(Number(ch['5']) > 0 ? 1 : 0);
          c.drs.push(Number(ch['45']) || 0);
        }
      }
    }
    const out = {};
    for (const [n, c] of Object.entries(tmp)) {
      out[n] = {
        t: Float64Array.from(c.t),
        speed: Int16Array.from(c.speed),
        rpm: Int16Array.from(c.rpm),
        gear: Int8Array.from(c.gear),
        throttle: Int8Array.from(c.throttle),
        brake: Uint8Array.from(c.brake),
        drs: Uint8Array.from(c.drs),
      };
    }
    return out;
  });
}

// When the car crossed the finish line near stream time t (from its positions).
function crossing(session, n, t) {
  const car = session.pos[n];
  if (!session.finish || !car) return t - TIMING_LAG_MS;
  let best = null;
  let bestD = Infinity;
  for (let i = Math.max(0, indexAt(car.t, t - 7000)); i < car.t.length && car.t[i] <= t + 1500; i++) {
    if (Number.isNaN(car.x[i])) continue;
    const d = Math.hypot(car.x[i] - session.finish[0], car.y[i] - session.finish[1]);
    if (d < bestD) {
      bestD = d;
      best = car.t[i];
    }
  }
  return best != null && bestD < 600 ? best : t - TIMING_LAG_MS;
}

// One lap of one car: distance, speed, throttle, brake, gear, RPM, DRS and
// position for every telemetry sample, as columns.
export function getLapTelemetry(path, driver, lap) {
  checkPath(path);
  if (!/^\d{1,2}$/.test(driver) || !(lap > 0)) throw Object.assign(new Error('Invalid driver or lap'), { status: 400 });
  return cached(`lapTelemetry:v1:${path}:${driver}:${lap}`, DAY, async () => {
    const session = await loadSession(path);
    const car = (await loadCarData(path))[driver];
    const endT = session.lapEnds[driver]?.[lap];
    if (!car || endT == null) throw Object.assign(new Error('No data for that lap'), { status: 404 });
    const ms = session.lapTimes[driver]?.[lap];
    const startGuess = session.lapEnds[driver]?.[lap - 1] ?? (ms ? endT - ms : null);
    if (startGuess == null) throw Object.assign(new Error('No data for that lap'), { status: 404 });
    const start = crossing(session, driver, startGuess);
    const end = crossing(session, driver, endT);

    const cols = { t: [], d: [], speed: [], throttle: [], brake: [], gear: [], rpm: [], drs: [], x: [], y: [] };
    let d = 0;
    let prevT = null;
    let prevV = null;
    for (let i = Math.max(0, indexAt(car.t, start)); i < car.t.length && car.t[i] <= end; i++) {
      if (car.t[i] < start) continue;
      const v = car.speed[i];
      if (prevT != null) d += (((v + prevV) / 2) / 3.6) * ((car.t[i] - prevT) / 1000);
      prevT = car.t[i];
      prevV = v;
      const p = positionAt(session.pos[driver], car.t[i], 2000);
      cols.t.push(Math.round(car.t[i] - start));
      cols.d.push(Math.round(d));
      cols.speed.push(v);
      cols.throttle.push(car.throttle[i]);
      cols.brake.push(car.brake[i]);
      cols.gear.push(car.gear[i]);
      cols.rpm.push(car.rpm[i]);
      cols.drs.push(car.drs[i]);
      cols.x.push(p ? Math.round(p[0]) : null);
      cols.y.push(p ? Math.round(p[1]) : null);
    }
    return { driver, lap, lapMs: ms ?? Math.round(end - start), ...cols };
  });
}

// One car's telemetry for the whole session, twice a second (for the onboard dials).
export function getCarTrace(path, driver) {
  checkPath(path);
  if (!/^\d{1,2}$/.test(driver)) throw Object.assign(new Error('Invalid driver'), { status: 400 });
  return cached(`carTrace:v1:${path}:${driver}`, DAY, async () => {
    const session = await loadSession(path);
    const car = (await loadCarData(path))[driver];
    if (!car) throw Object.assign(new Error('No telemetry for that driver'), { status: 404 });
    const cols = { t: [], speed: [], throttle: [], brake: [], gear: [], rpm: [], drs: [] };
    let next = -Infinity;
    for (let i = 0; i < car.t.length; i++) {
      const t = car.t[i] - session.offsetMs;
      if (t < 0 || t < next) continue;
      next = t + STEP_MS;
      cols.t.push(Math.round(t));
      cols.speed.push(car.speed[i]);
      cols.throttle.push(car.throttle[i]);
      cols.brake.push(car.brake[i]);
      cols.gear.push(car.gear[i]);
      cols.rpm.push(car.rpm[i]);
      cols.drs.push(car.drs[i]);
    }
    return cols;
  });
}

// --- Circuit extras ------------------------------------------------------------

// Exact sector lines, the pit lane and the usual pit stop loss for a circuit,
// learnt from its most recent archived race (for the live map and strategy).
export function getCircuitExtras(circuitKey) {
  const key = Number(circuitKey);
  if (!key) throw Object.assign(new Error('Invalid circuit'), { status: 400 });
  return cached(`circuitExtras:v1:${key}`, 30 * DAY, async () => {
    const year = new Date().getUTCFullYear();
    for (const y of [year, year - 1, year - 2]) {
      const sessionsThisYear = await getArchivedSessions(y).catch(() => []);
      const races = sessionsThisYear.filter((s) => s.circuitKey === key && s.type === 'Race');
      for (const s of races) {
        const replay = await getReplay(s.path).catch(() => null);
        if (replay && (replay.sectorPoints || replay.pitLane)) {
          return { from: `${replay.meeting} ${y}`, sectorPoints: replay.sectorPoints, pitLane: replay.pitLane, pitLoss: replay.pitLoss };
        }
      }
    }
    return { from: null, sectorPoints: null, pitLane: null, pitLoss: null };
  });
}
