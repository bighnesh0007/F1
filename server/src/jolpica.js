// Jolpica (https://github.com/jolpica/jolpica-f1), the community-run successor of
// the Ergast API: schedule, results, standings, lap positions, pit stops and history.
// Rate limits are 4 requests/second and 500/hour, so requests are queued and cached.
import { cached, fetchJson, MINUTE, HOUR, DAY } from './http.js';

const BASE_URL = process.env.JOLPICA_BASE_URL || 'https://api.jolpi.ca/ergast/f1';
const MIN_GAP_MS = 300;
const PAGE = 100;

let queue = Promise.resolve();
let lastRequestAt = 0;

function request(path) {
  const run = async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fetchJson(`${BASE_URL}/${path}`);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

// Fetches every page of a paged endpoint and returns the raw MRData pages.
async function allPages(path) {
  const sep = path.includes('?') ? '&' : '?';
  const first = await request(`${path}${sep}limit=${PAGE}&offset=0`);
  const pages = [first.MRData];
  const total = Number(first.MRData.total);
  for (let offset = PAGE; offset < total; offset += PAGE) {
    pages.push((await request(`${path}${sep}limit=${PAGE}&offset=${offset}`)).MRData);
  }
  return pages;
}

// Paged race tables split one race across pages; merge them back by round.
async function races(path, listKey) {
  const byRound = new Map();
  for (const page of await allPages(path)) {
    for (const race of page.RaceTable?.Races ?? []) {
      const key = `${race.season}-${race.round}`;
      const existing = byRound.get(key);
      if (existing) existing[listKey].push(...(race[listKey] ?? []));
      else byRound.set(key, { ...race, [listKey]: [...(race[listKey] ?? [])] });
    }
  }
  return [...byRound.values()];
}

const isPastSeason = (year) => year !== 'current' && Number(year) < new Date().getUTCFullYear();

// --- Normalisers ---------------------------------------------------------------

const SESSION_KEYS = [
  ['FirstPractice', 'Practice 1'],
  ['SecondPractice', 'Practice 2'],
  ['ThirdPractice', 'Practice 3'],
  ['SprintQualifying', 'Sprint Qualifying'],
  ['SprintShootout', 'Sprint Shootout'],
  ['Sprint', 'Sprint'],
  ['Qualifying', 'Qualifying'],
];

const toIso = (date, time) => (date ? `${date}T${time ?? '00:00:00Z'}` : null);

function circuit(c) {
  return {
    id: c.circuitId,
    name: c.circuitName,
    locality: c.Location?.locality,
    country: c.Location?.country,
    lat: Number(c.Location?.lat),
    lon: Number(c.Location?.long),
  };
}

function driver(d, extra = {}) {
  return {
    id: d.driverId,
    code: d.code ?? d.familyName?.slice(0, 3).toUpperCase(),
    number: d.permanentNumber ?? null,
    firstName: d.givenName,
    lastName: d.familyName,
    name: `${d.givenName} ${d.familyName}`,
    nationality: d.nationality,
    ...extra,
  };
}

function raceResult(r) {
  return {
    position: Number(r.position),
    positionText: r.positionText,
    number: r.number,
    driver: driver(r.Driver),
    team: r.Constructor?.name,
    teamId: r.Constructor?.constructorId,
    grid: Number(r.grid),
    laps: Number(r.laps),
    status: r.status,
    points: Number(r.points),
    time: r.Time?.time ?? null,
    fastestLap: r.FastestLap ? { rank: Number(r.FastestLap.rank), lap: Number(r.FastestLap.lap), time: r.FastestLap.Time?.time } : null,
  };
}

// --- Public API ----------------------------------------------------------------

export function getSchedule(year = 'current') {
  return cached(`schedule:${year}`, isPastSeason(year) ? DAY : 6 * HOUR, async () => {
    const data = await request(`${year}.json?limit=${PAGE}`);
    return data.MRData.RaceTable.Races.map((r) => {
      const sessions = SESSION_KEYS.filter(([key]) => r[key]).map(([key, name]) => ({
        key,
        name,
        start: toIso(r[key].date, r[key].time),
      }));
      sessions.push({ key: 'Race', name: 'Race', start: toIso(r.date, r.time) });
      sessions.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      return {
        season: Number(r.season),
        round: Number(r.round),
        name: r.raceName,
        circuit: circuit(r.Circuit),
        date: toIso(r.date, r.time),
        sprint: Boolean(r.Sprint),
        sessions,
      };
    });
  });
}

export function getStandings(year = 'current') {
  return cached(`standings:${year}`, isPastSeason(year) ? DAY : 10 * MINUTE, async () => {
    const [drivers, constructors] = await Promise.all([
      request(`${year}/driverStandings.json?limit=${PAGE}`),
      request(`${year}/constructorStandings.json?limit=${PAGE}`),
    ]);
    const driverList = drivers.MRData.StandingsTable.StandingsLists[0];
    const constructorList = constructors.MRData.StandingsTable.StandingsLists[0];
    return {
      season: driverList?.season ?? null,
      round: driverList ? Number(driverList.round) : null,
      drivers: (driverList?.DriverStandings ?? []).map((d) => ({
        position: Number(d.position ?? d.positionText) || null,
        points: Number(d.points),
        wins: Number(d.wins),
        driver: driver(d.Driver),
        team: d.Constructors.at(-1)?.name ?? '',
        teamId: d.Constructors.at(-1)?.constructorId ?? '',
      })),
      constructors: (constructorList?.ConstructorStandings ?? []).map((c) => ({
        position: Number(c.position ?? c.positionText) || null,
        points: Number(c.points),
        wins: Number(c.wins),
        team: c.Constructor.name,
        teamId: c.Constructor.constructorId,
        nationality: c.Constructor.nationality,
      })),
    };
  });
}

// All race (and sprint, qualifying) results of a season, keyed by round.
export function getSeasonResults(year = 'current') {
  return cached(`seasonResults:${year}`, isPastSeason(year) ? DAY : 30 * MINUTE, async () => {
    const [raceList, sprintList, qualiList] = await Promise.all([
      races(`${year}/results.json`, 'Results'),
      races(`${year}/sprint.json`, 'SprintResults'),
      races(`${year}/qualifying.json`, 'QualifyingResults'),
    ]);
    const rounds = {};
    const ensure = (r) =>
      (rounds[r.round] ??= { round: Number(r.round), name: r.raceName, circuit: circuit(r.Circuit), date: toIso(r.date, r.time) });
    for (const r of raceList) ensure(r).results = r.Results.map(raceResult);
    for (const r of sprintList) ensure(r).sprint = r.SprintResults.map(raceResult);
    for (const r of qualiList) {
      ensure(r).qualifying = r.QualifyingResults.map((q) => ({
        position: Number(q.position),
        driver: driver(q.Driver),
        team: q.Constructor?.name,
        teamId: q.Constructor?.constructorId,
        q1: q.Q1 ?? null,
        q2: q.Q2 ?? null,
        q3: q.Q3 ?? null,
      }));
    }
    return Object.values(rounds).sort((a, b) => a.round - b.round);
  });
}

// One race in detail: results, lap-by-lap positions and pit stops.
export function getRace(year, round) {
  const past = Number(year) < new Date().getUTCFullYear();
  return cached(`race:${year}:${round}`, past ? DAY : 15 * MINUTE, async () => {
    // Lap and pit data are sometimes published later than results, so they're optional.
    const [resultList, lapList, pitList] = await Promise.all([
      races(`${year}/${round}/results.json`, 'Results'),
      races(`${year}/${round}/laps.json`, 'Laps').catch(() => []),
      races(`${year}/${round}/pitstops.json`, 'PitStops').catch(() => []),
    ]);
    const race = resultList[0];
    if (!race) return null;

    // Merge lap pages (one lap's timings can be split over two pages).
    const laps = new Map();
    for (const lap of lapList[0]?.Laps ?? []) {
      const n = Number(lap.number);
      laps.set(n, [...(laps.get(n) ?? []), ...lap.Timings]);
    }
    const positions = {};
    const lapTimes = {};
    for (const [n, timings] of [...laps.entries()].sort((a, b) => a[0] - b[0])) {
      for (const t of timings) {
        (positions[t.driverId] ??= [])[n - 1] = Number(t.position);
        (lapTimes[t.driverId] ??= [])[n - 1] = t.time;
      }
    }

    return {
      season: Number(race.season),
      round: Number(race.round),
      name: race.raceName,
      circuit: circuit(race.Circuit),
      date: toIso(race.date, race.time),
      results: race.Results.map(raceResult),
      positions,
      lapTimes,
      pitStops: (pitList[0]?.PitStops ?? []).map((p) => ({
        driverId: p.driverId,
        lap: Number(p.lap),
        stop: Number(p.stop),
        duration: p.duration,
      })),
    };
  });
}

// Past winners, pole sitters and the fastest race lap at a circuit.
export function getCircuitHistory(circuitId) {
  return cached(`circuit:${circuitId}`, DAY, async () => {
    const [winners, fastest] = await Promise.all([
      races(`circuits/${circuitId}/results/1.json`, 'Results'),
      races(`circuits/${circuitId}/fastest/1/results.json`, 'Results'),
    ]);
    const winnerList = winners
      .map((r) => ({ season: Number(r.season), name: r.raceName, ...pick(raceResult(r.Results[0])) }))
      .sort((a, b) => b.season - a.season);

    let lapRecord = null;
    for (const r of fastest) {
      for (const res of r.Results) {
        const time = res.FastestLap?.Time?.time;
        if (time && (!lapRecord || toSeconds(time) < toSeconds(lapRecord.time))) {
          lapRecord = { time, season: Number(r.season), driver: driver(res.Driver), team: res.Constructor?.name };
        }
      }
    }

    const winCounts = countBy(winnerList, (w) => w.driver.id, (w) => w.driver);
    return {
      firstRace: winnerList.at(-1)?.season ?? null,
      races: winnerList.length,
      winners: winnerList.slice(0, 10),
      mostWins: winCounts.slice(0, 5),
      lapRecord,
    };
  });
}

// World champions. Jolpica only serves standings one season at a time, so each
// season is fetched once and cached for a month (past seasons never change).
const champions = new Map();
let warming = null;

async function championOf(year) {
  return cached(`champion:${year}`, 30 * DAY, async () => {
    const data = await request(`${year}/driverStandings/1.json`);
    const s = data.MRData.StandingsTable.StandingsLists[0]?.DriverStandings?.[0];
    if (!s) return null;
    return { season: year, driver: driver(s.Driver), team: s.Constructors.at(-1)?.name, points: Number(s.points) };
  });
}

// Fills in every finished season (newest first). Runs in the background.
export function warmChampions() {
  warming ??= (async () => {
    const last = new Date().getUTCFullYear() - 1;
    for (let year = last; year >= 1950; year--) {
      if (champions.has(year)) continue;
      try {
        const c = await championOf(year);
        if (c) champions.set(year, c);
      } catch (err) {
        console.error(`Champion ${year}:`, err.message);
      }
    }
  })().finally(() => {
    warming = null;
  });
  return warming;
}

const finishedSeasons = () => new Date().getUTCFullYear() - 1950;

// All-time records: most wins, poles, fastest laps and championships.
export async function getRecords() {
  const base = await cached('records', DAY, async () => {
    const [wins, poles, fastest] = await Promise.all([
      races('results/1.json', 'Results'),
      races('qualifying/1.json', 'QualifyingResults'),
      races('fastest/1/results.json', 'Results'),
    ]);
    const flat = (list, key) => list.flatMap((r) => r[key].map((x) => ({ ...x, season: r.season })));
    return {
      wins: countBy(flat(wins, 'Results'), (r) => r.Driver.driverId, (r) => driver(r.Driver)).slice(0, 10),
      poles: countBy(flat(poles, 'QualifyingResults'), (r) => r.Driver.driverId, (r) => driver(r.Driver)).slice(0, 10),
      fastestLaps: countBy(flat(fastest, 'Results'), (r) => r.Driver.driverId, (r) => driver(r.Driver)).slice(0, 10),
      totalRaces: wins.length,
      polesSince: poles.length ? Math.min(...poles.map((r) => Number(r.season))) : null,
      fastestLapsSince: fastest.length ? Math.min(...fastest.map((r) => Number(r.season))) : null,
    };
  });
  if (champions.size < finishedSeasons()) void warmChampions();
  const championList = [...champions.values()].sort((a, b) => b.season - a.season);
  return {
    ...base,
    championships: countBy(championList, (c) => c.driver.id, (c) => c.driver).slice(0, 10),
    champions: championList,
    championsComplete: champions.size >= finishedSeasons(),
  };
}

// A season at a glance, for comparing seasons and eras.
export function getSeasonSummary(year) {
  return cached(`seasonSummary:${year}`, isPastSeason(year) ? 7 * DAY : HOUR, async () => {
    const [standings, schedule, winners] = await Promise.all([
      getStandings(year),
      getSchedule(year),
      races(`${year}/results/1.json`, 'Results'),
    ]);
    const winnerList = winners.map((r) => raceResult(r.Results[0]));
    return {
      season: Number(standings.season ?? year),
      races: schedule.length,
      completed: winners.length,
      champion: standings.drivers[0] ?? null,
      constructorChampion: standings.constructors[0] ?? null,
      topDrivers: standings.drivers.slice(0, 10),
      topConstructors: standings.constructors.slice(0, 5),
      differentWinners: new Set(winnerList.map((w) => w.driver.id)).size,
      winsByDriver: countBy(winnerList, (w) => w.driver.id, (w) => ({ ...w.driver, team: w.team })),
      winsByTeam: countBy(winnerList, (w) => w.teamId, (w) => ({ id: w.teamId, name: w.team })),
    };
  });
}

function pick(result) {
  return { driver: result.driver, team: result.team, time: result.time };
}

function countBy(list, keyOf, itemOf) {
  const counts = new Map();
  for (const x of list) {
    const key = keyOf(x);
    const entry = counts.get(key) ?? { ...itemOf(x), count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function toSeconds(time) {
  const [m, s] = time.includes(':') ? time.split(':') : ['0', time];
  return Number(m) * 60 + Number(s);
}
