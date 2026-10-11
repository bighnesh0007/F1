// F1's public live timing archive (livetiming.formula1.com/static). After a session
// ends, its full data (including car positions) is published here for free.
import { inflateRawSync } from 'node:zlib';
import { cached, fetchText, MINUTE, HOUR, DAY } from './http.js';

const BASE_URLS = [
  process.env.F1_STATIC_URL || 'https://livetiming.formula1.com/static',
  'https://livetiming-mirror.fastf1.dev/static', // FastF1's mirror, used if F1's is down
];
const HEADERS = { 'User-Agent': 'BestHTTP' };

async function fetchStatic(path) {
  let lastError;
  for (const base of BASE_URLS) {
    try {
      return await fetchText(`${base}/${path}`, { headers: HEADERS, timeoutMs: 60_000 });
    } catch (err) {
      lastError = err;
      if (err.status === 404 || err.status === 403) continue;
    }
  }
  throw lastError;
}

const fetchStaticJson = async (path) => JSON.parse(await fetchStatic(path));

// "HH:MM:SS.mmm" offsets from the start of the stream, then JSON (or a base64 .z string).
function parseStream(text, zipped) {
  const out = [];
  for (const line of text.split('\n')) {
    const row = line.trim();
    if (row.length < 13) continue;
    const [h, m, s] = row.slice(0, 12).split(':');
    const t = (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000;
    let body = row.slice(12);
    try {
      if (zipped) body = inflateRawSync(Buffer.from(body.replace(/^"|"$/g, ''), 'base64')).toString('utf8');
      out.push([t, JSON.parse(body)]);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

// --- Season index ---------------------------------------------------------------

function parseOffset(gmtOffset = '00:00:00') {
  const negative = gmtOffset.startsWith('-');
  const [h, m] = gmtOffset.replace('-', '').split(':').map(Number);
  return (negative ? -1 : 1) * (h * 60 + m) * 60_000;
}

const utc = (local, offset) => (local ? new Date(Date.parse(`${local}Z`) - parseOffset(offset)).toISOString() : null);

export function getIndex(year) {
  const current = Number(year) >= new Date().getUTCFullYear();
  return cached(`index:${year}`, current ? 10 * MINUTE : DAY, async () => {
    const data = await fetchStaticJson(`${year}/Index.json`);
    return (data.Meetings ?? []).map((m) => ({
      key: m.Key,
      name: m.Name,
      location: m.Location,
      country: m.Country?.Name,
      circuitKey: m.Circuit?.Key,
      circuitName: m.Circuit?.ShortName,
      sessions: (m.Sessions ?? [])
        .filter((s) => s.Key !== -1 && s.Name)
        .map((s) => ({
          key: s.Key,
          name: s.Name,
          type: s.Type,
          path: s.Path ?? null,
          start: utc(s.StartDate, s.GmtOffset),
          end: utc(s.EndDate, s.GmtOffset),
        })),
    }));
  });
}

// Finished sessions with archived data, newest first.
export async function getArchivedSessions(year) {
  const meetings = await getIndex(year);
  const now = Date.now();
  return meetings
    .flatMap((m) =>
      m.sessions
        .filter((s) => s.path && s.end && Date.parse(s.end) + 30 * MINUTE < now)
        .map((s) => ({ ...s, meeting: m.name, location: m.location, country: m.country, circuitKey: m.circuitKey })),
    )
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}

// Drivers (photo, team colour, code) from the most recent archived session.
export function getLatestDrivers() {
  return cached('latestDrivers', HOUR, async () => {
    const year = new Date().getUTCFullYear();
    let sessions = await getArchivedSessions(year).catch(() => []);
    if (!sessions.length) sessions = await getArchivedSessions(year - 1);
    for (const session of sessions.slice(0, 3)) {
      try {
        const list = await fetchStaticJson(`${session.path}DriverList.json`);
        return { session: `${session.meeting} · ${session.name}`, drivers: normalizeDrivers(list) };
      } catch {
        // try an older session
      }
    }
    return { session: null, drivers: {} };
  });
}

function normalizeDrivers(list) {
  const out = {};
  for (const [number, d] of Object.entries(list ?? {})) {
    if (!d || typeof d !== 'object') continue;
    out[number] = {
      number,
      tla: d.Tla,
      firstName: d.FirstName,
      lastName: d.LastName,
      fullName: d.FullName,
      team: d.TeamName,
      teamColour: d.TeamColour,
      headshot: d.HeadshotUrl ?? null,
    };
  }
  return out;
}

// Matches a Jolpica circuit (locality, country) to F1's circuit key, used for maps.
export async function findCircuitKey({ locality, country, name }) {
  const year = new Date().getUTCFullYear();
  const meetings = [
    ...(await getIndex(year).catch(() => [])),
    ...(await getIndex(year - 1).catch(() => [])),
    ...(await getIndex(year - 2).catch(() => [])),
  ];
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const tests = [
    (m) => norm(m.location) === norm(locality),
    (m) => norm(m.location).includes(norm(locality)) || norm(locality).includes(norm(m.location)),
    (m) => norm(m.circuitName) && norm(name).includes(norm(m.circuitName)),
  ];
  for (const test of tests) {
    const found = meetings.find((m) => m.circuitKey && norm(m.location) && test(m));
    if (found) return found.circuitKey;
  }
  const sameCountry = [...new Set(meetings.filter((m) => norm(m.country) === norm(country)).map((m) => m.circuitKey))];
  return sameCountry.length === 1 ? sameCountry[0] : null;
}

// --- Replay -------------------------------------------------------------------

const REPLAY_STEP_MS = 1000;

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
function timingSummary(line) {
  const parts = line.BestLapTimes ?? {};
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
      const now = summarize(lines[n]);
      const before = prev[n] ?? {};
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
// the session), used to colour the map by sector.
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
  return times.map((t) => t.sort((a, b) => a - b)[Math.floor(t.length / 2)]);
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

// Builds a compact replay of a finished session: car positions once per second,
// the timing board as it changed, lap count, session clock, track status and
// race control messages.
export function getReplay(path) {
  if (!/^\d{4}\/[\w\-.]+\/[\w\-.]+\/$/.test(path)) throw Object.assign(new Error('Invalid session path'), { status: 400 });
  return cached(`replay:v3:${path}`, DAY, async () => {
    const [info, drivers, position, timing, timingApp, lapCount, clock, trackStatus, rc] = await Promise.all([
      fetchStaticJson(`${path}SessionInfo.json`),
      fetchStaticJson(`${path}DriverList.json`),
      fetchStatic(`${path}Position.z.jsonStream`),
      fetchStatic(`${path}TimingData.jsonStream`),
      fetchStatic(`${path}TimingAppData.jsonStream`).catch(() => ''),
      fetchStatic(`${path}LapCount.jsonStream`).catch(() => ''),
      fetchStatic(`${path}ExtrapolatedClock.jsonStream`).catch(() => ''),
      fetchStatic(`${path}TrackStatus.jsonStream`).catch(() => ''),
      fetchStaticJson(`${path}RaceControlMessages.json`).catch(() => ({ Messages: [] })),
    ]);

    const driverMap = normalizeDrivers(drivers);
    const numbers = Object.keys(driverMap).sort((a, b) => (drivers[a]?.Line ?? 99) - (drivers[b]?.Line ?? 99));

    // Positions: sample every REPLAY_STEP_MS, keyed by stream offset. A car that
    // stops sending a position (off track, in the garage, retired) is left out
    // rather than frozen where it was last seen.
    const frames = [];
    let startUtc = null;
    let nextT = 0;
    const lastSeen = {};
    for (const [t, data] of parseStream(position, true)) {
      for (const sample of data.Position ?? []) {
        const sampleUtc = Date.parse(sample.Timestamp);
        if (startUtc == null && sampleUtc) startUtc = sampleUtc - t;
        for (const [n, e] of Object.entries(sample.Entries ?? {})) {
          const off = e.Status === 'OffTrack' || String(e.Status) === '1'; // older sessions use 0/1
          lastSeen[n] = off || (!e.X && !e.Y) ? null : [Math.round(e.X), Math.round(e.Y)];
        }
      }
      while (t >= nextT) {
        frames.push(numbers.flatMap((n) => lastSeen[n] ?? [null, null]));
        nextT += REPLAY_STEP_MS;
      }
    }
    // Drop the long empty stretch before cars leave the garage.
    let firstFrame = frames.findIndex((f) => f.some((v) => v !== null));
    if (firstFrame < 0) firstFrame = 0;
    const offsetMs = firstFrame * REPLAY_STEP_MS;

    const board = buildTimeline(parseStream(timing, false), parseStream(timingApp, false), offsetMs);
    const toT = (utcString) => (startUtc ? Date.parse(utcString.endsWith('Z') ? utcString : `${utcString}Z`) - startUtc - offsetMs : null);

    return {
      path,
      meeting: info.Meeting?.Name,
      session: info.Name,
      type: info.Type,
      circuitKey: info.Meeting?.Circuit?.Key ?? null,
      location: info.Meeting?.Location,
      stepMs: REPLAY_STEP_MS,
      startUtc: startUtc ? new Date(startUtc + offsetMs).toISOString() : null,
      drivers: numbers.map((n) => driverMap[n]),
      frames: frames.slice(firstFrame),
      timing: board.timing,
      parts: board.parts,
      cutoffs: board.cutoffs,
      sectorTimes: board.sectorTimes,
      clock: parseClock(parseStream(clock, false), offsetMs),
      laps: lapRows(parseStream(lapCount, false), offsetMs),
      trackStatus: parseStream(trackStatus, false).map(([t, d]) => [Math.max(0, t - offsetMs), d.Status, d.Message]),
      raceControl: (rc.Messages ?? [])
        .map((m) => ({ t: m.Utc ? toT(m.Utc) : null, message: m.Message, flag: m.Flag ?? null, category: m.Category, lap: m.Lap ?? null, driver: m.RacingNumber ?? null }))
        .filter((m) => m.t != null && m.t >= 0),
    };
  });
}
