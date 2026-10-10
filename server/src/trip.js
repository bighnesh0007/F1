// "Going to the race": local time zone, sunrise and sunset, the forecast for race
// day when it's close, and the typical weather on that date over the last five years.
// Data from Open-Meteo (free, no key).
import { cached, fetchJson, HOUR, DAY } from './http.js';

const FORECAST = process.env.OPEN_METEO_URL || 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = process.env.OPEN_METEO_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive';

const day = (iso) => iso.slice(0, 10);
const shiftYears = (iso, years) => {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return day(d.toISOString());
};

export function summariseClimate(rows) {
  const valid = rows.filter((r) => r.max != null);
  if (!valid.length) return null;
  const avg = (k) => Math.round((valid.reduce((s, r) => s + r[k], 0) / valid.length) * 10) / 10;
  return { years: valid.length, maxTemp: avg('max'), minTemp: avg('min'), rainyYears: valid.filter((r) => (r.rain ?? 0) >= 1).length };
}

export function getTrip(lat, lon, raceDate) {
  const key = `trip:${lat.toFixed(2)}:${lon.toFixed(2)}:${day(raceDate)}`;
  const close = Date.parse(raceDate) - Date.now() < 15 * 86400_000 && Date.parse(raceDate) > Date.now() - 86400_000;
  return cached(key, close ? 3 * HOUR : DAY, async () => {
    const date = day(raceDate);
    const forecastUrl = `${FORECAST}?latitude=${lat}&longitude=${lon}&timezone=auto&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&start_date=${date}&end_date=${date}`;
    const now = await fetchJson(close ? forecastUrl : `${FORECAST}?latitude=${lat}&longitude=${lon}&timezone=auto&daily=sunrise,sunset&forecast_days=1`);
    const past = await Promise.all(
      [1, 2, 3, 4, 5].map((y) =>
        fetchJson(`${ARCHIVE}?latitude=${lat}&longitude=${lon}&timezone=auto&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${shiftYears(raceDate, y)}&end_date=${shiftYears(raceDate, y)}`)
          .then((d) => ({ max: d.daily?.temperature_2m_max?.[0] ?? null, min: d.daily?.temperature_2m_min?.[0] ?? null, rain: d.daily?.precipitation_sum?.[0] ?? null }))
          .catch(() => ({ max: null })),
      ),
    );
    const d = now.daily ?? {};
    return {
      timezone: now.timezone ?? null,
      utcOffsetSeconds: now.utc_offset_seconds ?? null,
      sunrise: d.sunrise?.[0] ?? null,
      sunset: d.sunset?.[0] ?? null,
      forecast: close && d.temperature_2m_max ? { maxTemp: d.temperature_2m_max[0], minTemp: d.temperature_2m_min[0], rainChance: d.precipitation_probability_max?.[0] ?? null, code: d.weather_code?.[0] ?? null } : null,
      climate: summariseClimate(past),
    };
  });
}
