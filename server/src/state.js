// In-memory copy of the F1 live timing state.
//
// The feed sends a full snapshot per topic on subscribe, then partial updates
// that must be deep-merged into it. Lists arrive as arrays in snapshots but as
// objects keyed by index in updates ({"Lines": {"3": {...}}}), so every array is
// normalised to an index-keyed object before merging.
import { inflateRawSync } from 'node:zlib';
import { Analysis } from './analysis.js';

export function normalize(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((v, i) => [String(i), normalize(v)]));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === '_kf') continue;
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

export function deepMerge(target, patch) {
  if (!isObject(patch)) return patch;
  const base = isObject(target) ? target : {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === '_deleted' && Array.isArray(value)) {
      for (const k of value) delete base[k];
      continue;
    }
    base[key] = isObject(value) ? deepMerge(base[key], value) : value;
  }
  return base;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// "Position.z" / "CarData.z" are base64 deflate-raw compressed JSON.
export function decodeTopic(topic, data) {
  if (topic.endsWith('.z') && typeof data === 'string') {
    return { topic: topic.slice(0, -2), data: JSON.parse(inflateRawSync(Buffer.from(data, 'base64')).toString('utf8')) };
  }
  return { topic, data };
}

export class LiveState {
  constructor() {
    this.analysis = new Analysis();
    this.reset();
  }

  reset() {
    this.topics = {};
    this.updatedAt = null;
    this.analysis.reset();
  }

  // Replaces the whole state with a subscription snapshot ({topic: data}).
  load(snapshot) {
    this.reset();
    for (const [rawTopic, rawData] of Object.entries(snapshot || {})) {
      const { topic, data } = decodeTopic(rawTopic, rawData);
      if (topic === 'Position' || topic === 'CarData') {
        const latest = latestSample(topic, normalize(data));
        if (latest) this.topics[topic] = latest;
        continue;
      }
      this.topics[topic] = normalize(data);
    }
    this.updatedAt = new Date().toISOString();
    const derived = this.analysis.initFromSnapshot(this.topics, this.updatedAt);
    for (const [topic, data] of Object.entries(derived)) this.topics[topic] = data;
  }

  // Applies one feed message; returns the updates to broadcast (feed + derived topics).
  apply(rawTopic, rawData, timestamp) {
    const { topic, data } = decodeTopic(rawTopic, rawData);
    const ts = timestamp || new Date().toISOString();
    const patch = normalize(data);
    this.updatedAt = ts;

    // Position and CarData are high-frequency streams of samples: keep only the latest.
    if (topic === 'Position' || topic === 'CarData') {
      const latest = latestSample(topic, patch);
      if (!latest) return [];
      this.topics[topic] = latest;
      return [{ topic, data: latest, replace: true, ts }];
    }

    this.topics[topic] = deepMerge(this.topics[topic], patch);
    const updates = [{ topic, data: patch, replace: false, ts }];
    for (const [derivedTopic, derivedPatch] of Object.entries(this.analysis.onUpdate(topic, patch, this.topics, ts))) {
      this.topics[derivedTopic] = deepMerge(this.topics[derivedTopic], derivedPatch);
      updates.push({ topic: derivedTopic, data: derivedPatch, replace: false, ts });
    }
    return updates;
  }

  snapshot() {
    return { topics: this.topics, updatedAt: this.updatedAt };
  }
}

function latestSample(topic, patch) {
  const samples = Object.values((topic === 'Position' ? patch.Position : patch.Entries) || {});
  return samples.at(-1) ?? null;
}
