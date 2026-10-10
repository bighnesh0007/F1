// Calendar integration:
//  - an iCalendar feed of every session in a season (subscribe once, stays updated)
//  - Google Calendar sync for signed-in users who connected Calendar
//  - "watch party" events with a Google Meet link and invited friends
import crypto from 'node:crypto';
import express from 'express';
import { getSchedule } from './jolpica.js';
import { googleAccessToken, HttpError } from './auth.js';
import { mongo } from './db/mongo.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DURATION_MIN = { Race: 120, Sprint: 60 };
const PUBLIC_URL = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

const endOf = (session) => new Date(Date.parse(session.start) + (DURATION_MIN[session.key] ?? 60) * 60_000);
// Google event ids allow 0-9 and a-v; a hex digest fits, and is stable per session,
// so syncing again updates events instead of duplicating them.
const eventId = (season, round, key) => crypto.createHash('sha1').update(`f1live:${season}:${round}:${key}`).digest('hex');

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(races, name) {
  const now = icsDate(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//F1 Live//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(name)}`, 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const race of races) {
    for (const s of race.sessions) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${eventId(race.season, race.round, s.key)}@f1live`,
        `DTSTAMP:${now}`,
        `DTSTART:${icsDate(s.start)}`,
        `DTEND:${icsDate(endOf(s))}`,
        `SUMMARY:${icsEscape(`F1 ${s.name} · ${race.name}`)}`,
        `LOCATION:${icsEscape(`${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country}`)}`,
        `URL:${PUBLIC_URL()}/schedule/${race.round}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(`${s.name} starts in 15 minutes`)}`,
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  // RFC 5545: lines over 75 octets are folded.
  return lines.map((l) => (l.length > 74 ? l.match(/.{1,73}/g).join('\r\n ') : l)).join('\r\n') + '\r\n';
}

function googleEvent(race, session) {
  return {
    id: eventId(race.season, race.round, session.key),
    status: 'confirmed',
    summary: `🏁 F1 ${session.name} · ${race.name}`,
    location: `${race.circuit.name}, ${race.circuit.locality}, ${race.circuit.country}`,
    description: `Round ${race.round} of the ${race.season} season.\nFollow it live: ${PUBLIC_URL()}/`,
    start: { dateTime: new Date(session.start).toISOString() },
    end: { dateTime: endOf(session).toISOString() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
    source: { title: 'F1 Live', url: `${PUBLIC_URL()}/schedule/${race.round}` },
  };
}

async function googleRequest(token, url, method, body) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function upsertEvent(token, event) {
  const created = await googleRequest(token, CALENDAR_API, 'POST', event);
  if (created.status === 409) {
    const updated = await googleRequest(token, `${CALENDAR_API}/${event.id}`, 'PUT', event);
    if (updated.status >= 400) throw new HttpError(502, `Google Calendar: ${updated.json.error?.message ?? updated.status}`);
    return updated.json;
  }
  if (created.status >= 400) throw new HttpError(created.status === 401 ? 401 : 502, `Google Calendar: ${created.json.error?.message ?? created.status}`);
  return created.json;
}

async function findRace(season, round) {
  const schedule = await getSchedule(season ?? 'current');
  const race = schedule.find((r) => r.round === Number(round));
  if (!race) throw new HttpError(404, 'No such race');
  return { race, schedule };
}

export function calendarRouter(requireUser) {
  const router = express.Router();

  // Subscribe from any calendar app: e.g. webcal://your-host/api/calendar/feed.ics
  router.get('/feed.ics', async (req, res) => {
    const season = /^\d{4}$/.test(String(req.query.season ?? '')) ? Number(req.query.season) : 'current';
    const races = await getSchedule(season);
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="f1-live.ics"', 'Cache-Control': 'public, max-age=3600' });
    res.send(buildIcs(races, `F1 ${races[0]?.season ?? ''} · F1 Live`));
  });

  // Adds one weekend (or every remaining weekend) to the user's Google Calendar.
  router.post('/google/sync', requireUser, async (req, res) => {
    const token = await googleAccessToken(req.user);
    const { schedule } = await findRace(req.body?.season, req.body?.round ?? 1);
    const now = Date.now();
    const races = req.body?.all ? schedule.filter((r) => Date.parse(r.date) > now) : schedule.filter((r) => r.round === Number(req.body?.round));
    const sessions = req.body?.session ? races.flatMap((r) => r.sessions.filter((s) => s.key === req.body.session).map((s) => [r, s])) : races.flatMap((r) => r.sessions.map((s) => [r, s]));
    let added = 0;
    for (const [race, session] of sessions) {
      if (Date.parse(session.start) < now) continue;
      await upsertEvent(token, googleEvent(race, session));
      added++;
    }
    res.json({ added });
  });

  // A watch party: an event with invited friends and a Google Meet link.
  router.post('/google/watch-party', requireUser, async (req, res) => {
    const token = await googleAccessToken(req.user);
    const { race } = await findRace(req.body?.season, req.body?.round);
    const session = race.sessions.find((s) => s.key === (req.body?.session ?? 'Race'));
    if (!session) throw new HttpError(400, 'No such session');
    const guests = [...new Set((Array.isArray(req.body?.guests) ? req.body.guests : []).map((g) => String(g).trim().toLowerCase()))].filter((g) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g)).slice(0, 50);
    const startsEarly = Math.max(0, Math.min(120, Number(req.body?.minutesBefore ?? 30)));
    const start = new Date(Date.parse(session.start) - startsEarly * 60_000);
    const note = String(req.body?.note ?? '').slice(0, 500);
    const event = {
      summary: `🍿 ${session.name} watch party · ${race.name}`,
      location: String(req.body?.location ?? '').slice(0, 200) || undefined,
      description: [`${req.user.displayName} invited you to watch the ${race.name} ${session.name.toLowerCase()} together.`, note, `Live timing: ${PUBLIC_URL()}/`].filter(Boolean).join('\n\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: endOf(session).toISOString() },
      attendees: guests.map((email) => ({ email })),
      conferenceData: req.body?.meet === false ? undefined : { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    };
    const { status, json } = await googleRequest(token, `${CALENDAR_API}?conferenceDataVersion=1&sendUpdates=all`, 'POST', event);
    if (status >= 400) throw new HttpError(502, `Google Calendar: ${json.error?.message ?? status}`);
    await mongo().collection('users').updateOne({ _id: req.user._id }, { $inc: { 'stats.watchParties': 1 } });
    await mongo().collection('users').updateOne({ _id: req.user._id }, { $inc: { 'stats.watchParties': 1 } });
    res.status(201).json({ link: json.htmlLink, meet: json.hangoutLink ?? null, invited: guests.length });
  });

  return router;
}
