// Circuit maps. The primary source is MultiViewer's free circuit API, whose points
// share the coordinate system of F1's car position data and start at the finish
// line. If it is unavailable, a bundled outline from bacinger/f1-circuits (MIT) is
// used instead; that one only shows the track shape.
import fs from 'node:fs';
import { cached, fetchJson, DAY } from './http.js';

const MULTIVIEWER_URL = process.env.MULTIVIEWER_URL || 'https://api.multiviewer.app/api/v1/circuits';
const outlines = JSON.parse(fs.readFileSync(new URL('../data/f1-circuits.geojson', import.meta.url), 'utf8')).features;

// Jolpica circuit id → bacinger outline id.
const OUTLINE_IDS = {
  albert_park: 'au-1953', bahrain: 'bh-2002', shanghai: 'cn-2004', suzuka: 'jp-1962', miami: 'us-2022',
  imola: 'it-1953', monaco: 'mc-1929', catalunya: 'es-1991', villeneuve: 'ca-1978', red_bull_ring: 'at-1969',
  silverstone: 'gb-1948', hungaroring: 'hu-1986', spa: 'be-1925', zandvoort: 'nl-1948', monza: 'it-1922',
  baku: 'az-2016', marina_bay: 'sg-2008', americas: 'us-2012', rodriguez: 'mx-1962', interlagos: 'br-1940',
  vegas: 'us-2023', losail: 'qa-2004', yas_marina: 'ae-2009', jeddah: 'sa-2021', madring: 'es-2026',
  ricard: 'fr-1969', portimao: 'pt-2008', mugello: 'it-1914', istanbul: 'tr-2005', sochi: 'ru-2014',
  sepang: 'my-1999', hockenheimring: 'de-1932', nurburgring: 'de-1927',
};

export function getCircuitMap({ key, location, circuitId, year = new Date().getUTCFullYear() }) {
  return cached(`map:v2:${key}:${location}:${circuitId}:${year}`, DAY, async () => {
    if (key) {
      for (const y of [year, year - 1, year - 2]) {
        try {
          const m = await fetchJson(`${MULTIVIEWER_URL}/${key}/${y}`);
          if (m?.x?.length) return { ...fromMultiViewer(m), length: fromOutline(location, circuitId)?.length ?? null };
        } catch {
          // try the previous year's layout
        }
      }
    }
    return fromOutline(location, circuitId);
  });
}

function fromMultiViewer(m) {
  return {
    source: 'multiviewer',
    name: m.circuitName,
    // Points of a real lap from the finish line; "time" is set when timestamps are included.
    x: m.x,
    y: m.y,
    time: Array.isArray(m.trackPositionTime) && m.trackPositionTime.length === m.x.length ? m.trackPositionTime : null,
    rotation: Number(m.rotation) || 0,
    startsAtFinish: true,
    corners: (m.corners ?? []).map((c) => ({
      number: c.number,
      letter: c.letter ?? '',
      x: c.trackPosition?.x,
      y: c.trackPosition?.y,
      angle: c.angle,
    })),
    // Marshal posts split the lap into the sectors race control waves flags in.
    marshalSectors: (m.marshalSectors ?? [])
      .filter((c) => c?.trackPosition)
      .map((c) => ({ number: c.number, x: c.trackPosition.x, y: c.trackPosition.y })),
  };
}

function fromOutline(location, circuitId) {
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const target = norm(location);
  const feature =
    outlines.find((f) => f.properties.id === OUTLINE_IDS[circuitId]) ??
    outlines.find((f) => norm(f.properties.Location) === target) ??
    outlines.find((f) => target && (norm(f.properties.Location).includes(target) || target.includes(norm(f.properties.Location)))) ??
    outlines.find((f) => target && norm(f.properties.Name).includes(target));
  if (!feature) return null;

  // Project longitude/latitude to metres (×10, the unit F1 position data uses).
  const coords = feature.geometry.coordinates;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180) * 10;
  const ky = 110_540 * 10;
  return {
    source: 'outline',
    name: feature.properties.Name,
    length: feature.properties.length,
    x: coords.map((c) => Math.round((c[0] - lon0) * kx)),
    y: coords.map((c) => Math.round((c[1] - lat0) * ky)),
    time: null,
    rotation: 0,
    startsAtFinish: false,
    corners: [],
  };
}
