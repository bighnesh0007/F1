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

// Builds a compact replay of a finished session: car positions once per second,
// running order, lap count, track status and race control messages.
export function getReplay(path) {
  if (!/^\d{4}\/[\w\-.]+\/[\w\-.]+\/$/.test(path)) throw Object.assign(new Error('Invalid session path'), { status: 400 });
  return cached(`replay:${path}`, DAY, async () => {
    const [info, drivers, position, timing, lapCount, trackStatus, rc] = await Promise.all([
      fetchStaticJson(`${path}SessionInfo.json`),
      fetchStaticJson(`${path}DriverList.json`),
      fetchStatic(`${path}Position.z.jsonStream`),
      fetchStatic(`${path}TimingData.jsonStream`),
      fetchStatic(`${path}LapCount.jsonStream`).catch(() => ''),
      fetchStatic(`${path}TrackStatus.jsonStream`).catch(() => ''),
      fetchStaticJson(`${path}RaceControlMessages.json`).catch(() => ({ Messages: [] })),
    ]);

    const driverMap = normalizeDrivers(drivers);
    const numbers = Object.keys(driverMap).sort((a, b) => (drivers[a]?.Line ?? 99) - (drivers[b]?.Line ?? 99));

    // Positions: sample every REPLAY_STEP_MS, keyed by stream offset.
    const frames = [];
    let startUtc = null;
    let nextT = 0;
    const lastSeen = {};
    for (const [t, data] of parseStream(position, true)) {
      for (const sample of data.Position ?? []) {
        const sampleUtc = Date.parse(sample.Timestamp);
        if (startUtc == null && sampleUtc) startUtc = sampleUtc - t;
        for (const [n, e] of Object.entries(sample.Entries ?? {})) {
          if (e.X || e.Y) lastSeen[n] = [Math.round(e.X), Math.round(e.Y)];
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

    // Running order changes from TimingData.
    const order = [];
    const positions = {};
    for (const [t, data] of parseStream(timing, false)) {
      for (const [n, line] of Object.entries(data.Lines ?? {})) {
        if (line?.Position) {
          positions[n] = Number(line.Position);
          order.push([Math.max(0, t - offsetMs), n, positions[n]]);
        }
        if (line?.Retired === true) order.push([Math.max(0, t - offsetMs), n, 0]);
      }
    }

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
      order,
      laps: parseStream(lapCount, false)
        .filter(([, d]) => d.CurrentLap != null)
        .map(([t, d]) => [Math.max(0, t - offsetMs), d.CurrentLap, d.TotalLaps ?? null]),
      trackStatus: parseStream(trackStatus, false).map(([t, d]) => [Math.max(0, t - offsetMs), d.Status, d.Message]),
      raceControl: (rc.Messages ?? [])
        .map((m) => ({ t: m.Utc ? toT(m.Utc) : null, message: m.Message, flag: m.Flag ?? null, category: m.Category, lap: m.Lap ?? null }))
        .filter((m) => m.t != null && m.t >= 0),
    };
  });
}
