// Championship standings from Jolpica (https://github.com/jolpica/jolpica-f1),
// the community-run successor of the Ergast API. Updated after each race.
const BASE_URL = process.env.JOLPICA_BASE_URL || 'https://api.jolpi.ca/ergast/f1';
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = null;

async function get(path) {
  const res = await fetch(`${BASE_URL}/${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Jolpica ${res.status} for ${path}`);
  return res.json();
}

export async function getStandings() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const [drivers, constructors] = await Promise.all([
    get('current/driverStandings.json'),
    get('current/constructorStandings.json'),
  ]);
  const driverList = drivers.MRData.StandingsTable.StandingsLists[0];
  const constructorList = constructors.MRData.StandingsTable.StandingsLists[0];

  const data = {
    season: driverList?.season ?? null,
    round: driverList?.round ?? null,
    drivers: (driverList?.DriverStandings ?? []).map((d) => ({
      position: Number(d.position),
      points: Number(d.points),
      wins: Number(d.wins),
      code: d.Driver.code,
      name: `${d.Driver.givenName} ${d.Driver.familyName}`,
      team: d.Constructors.at(-1)?.name ?? '',
    })),
    constructors: (constructorList?.ConstructorStandings ?? []).map((c) => ({
      position: Number(c.position),
      points: Number(c.points),
      wins: Number(c.wins),
      name: c.Constructor.name,
    })),
  };
  cache = { at: Date.now(), data };
  return data;
}
