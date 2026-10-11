// F1's public live timing archive (livetiming.formula1.com/static). After a session
// ends, its full data (including car positions) is published here for free.
import { inflateRawSync } from 'node:zlib';
import { cached, fetchText, MINUTE, HOUR, DAY } from './http.js';

const BASE_URLS = [
  process.env.F1_STATIC_URL || 'https://livetiming.formula1.com/static',
  'https://livetiming-mirror.fastf1.dev/static', // FastF1's mirror, used if F1's is down
];
const HEADERS = { 'User-Agent': 'BestHTTP' };

export async function fetchStatic(path) {
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

export const fetchStaticJson = async (path) => JSON.parse(await fetchStatic(path));

// "HH:MM:SS.mmm" offsets from the start of the stream, then JSON (or a base64 .z string).
export function parseStream(text, zipped) {
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

export function normalizeDrivers(list) {
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
