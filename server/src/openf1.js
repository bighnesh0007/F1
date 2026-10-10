// Thin client for the OpenF1 API (https://openf1.org) — real F1 timing data.
const BASE_URL = process.env.OPENF1_BASE_URL || 'https://api.openf1.org/v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

async function get(path, params = {}) {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const cached = cache.get(url.href);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenF1 ${res.status} for ${url.pathname}${url.search}`);
  const data = await res.json();
  cache.set(url.href, { at: Date.now(), data });
  return data;
}

// The race weekend that is happening now, or the next one on the calendar.
export async function getCurrentWeekend(now = new Date()) {
  const year = now.getUTCFullYear();
  let sessions = await get('sessions', { year });
  let upcoming = sessions.find((s) => new Date(s.date_end) >= now);

  // Season is over: look at next year's calendar once it is published.
  if (!upcoming) {
    sessions = await get('sessions', { year: year + 1 });
    upcoming = sessions.find((s) => new Date(s.date_end) >= now);
  }
  if (!upcoming) return null;

  const [meeting] = await get('meetings', { meeting_key: upcoming.meeting_key });
  const weekendSessions = sessions
    .filter((s) => s.meeting_key === upcoming.meeting_key)
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

  return {
    meeting,
    sessions: weekendSessions.map((s) => ({
      ...s,
      status: sessionStatus(s, now),
    })),
  };
}

function sessionStatus(session, now) {
  if (now < new Date(session.date_start)) return 'upcoming';
  if (now > new Date(session.date_end)) return 'finished';
  return 'live';
}
