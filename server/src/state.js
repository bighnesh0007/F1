// In-memory copy of the F1 live timing state.
//
// The feed sends a full snapshot per topic on subscribe, then partial updates
// that must be deep-merged into it. Lists arrive as arrays in snapshots but as
// objects keyed by index in updates ({"Lines": {"3": {...}}}), so every array is
// normalised to an index-keyed object before merging.
import { inflateRawSync } from 'node:zlib';

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
    this.topics = {};
    this.updatedAt = null;
  }

  reset() {
    this.topics = {};
    this.updatedAt = null;
  }

  // Applies one message; returns the normalised patch that was merged.
  apply(rawTopic, rawData, timestamp) {
    const { topic, data } = decodeTopic(rawTopic, rawData);
    const patch = normalize(data);
    // Position and CarData are high-frequency streams of samples: keep only the latest.
    if (topic === 'Position' || topic === 'CarData') {
      const entries = Object.values(patch.Position || patch.Entries || {});
      const latest = entries.at(-1);
      if (!latest) return null;
      this.topics[topic] = latest;
      this.updatedAt = timestamp || new Date().toISOString();
      return { topic, data: latest, replace: true };
    }
    this.topics[topic] = deepMerge(this.topics[topic], patch);
    this.updatedAt = timestamp || new Date().toISOString();
    return { topic, data: patch, replace: false };
  }

  snapshot() {
    return { topics: this.topics, updatedAt: this.updatedAt };
  }
}
