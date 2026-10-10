// Team radio transcripts: each new radio clip is sent to a speech-to-text service and
// the text is streamed to browsers as the "RadioTranscripts" topic ({clipPath: text}).
//
// Works with any OpenAI-compatible transcription API (OpenAI Whisper, Groq, or a
// self-hosted faster-whisper server): set TRANSCRIBE_URL (e.g. https://api.openai.com/v1),
// TRANSCRIBE_API_KEY and optionally TRANSCRIBE_MODEL (default whisper-1).
import { kv } from './db/redis.js';
import { log } from './observe.js';

const STATIC_URL = process.env.F1_STATIC_URL || 'https://livetiming.formula1.com/static';
const MAX_QUEUE = 60;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export const transcribeConfigured = () => Boolean(process.env.TRANSCRIBE_URL && process.env.TRANSCRIBE_API_KEY);

// Driver and team names help the model spell them right.
function prompt(topics) {
  const names = Object.values(topics.DriverList ?? {}).map((d) => d?.LastName ?? d?.FullName).filter(Boolean);
  return `Formula 1 team radio. Drivers: ${names.slice(0, 22).join(', ')}. Box, push, tyres, DRS, safety car.`;
}

export async function transcribeClip(audioUrl, topics, fetchImpl = fetch) {
  const audio = await fetchImpl(audioUrl, { signal: AbortSignal.timeout(20_000) });
  if (!audio.ok) throw new Error(`${audio.status} fetching radio clip`);
  const bytes = await audio.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error('Radio clip too large');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'radio.mp3');
  form.append('model', process.env.TRANSCRIBE_MODEL || 'whisper-1');
  form.append('language', 'en');
  form.append('prompt', prompt(topics));
  form.append('response_format', 'json');
  const res = await fetchImpl(`${process.env.TRANSCRIBE_URL.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${res.status} from transcription service`);
  const data = await res.json();
  return String(data.text ?? '').trim().slice(0, 1000);
}

export function startTranscripts(live) {
  if (!transcribeConfigured()) {
    console.log('Transcripts: TRANSCRIBE_URL / TRANSCRIBE_API_KEY not set, team radio is audio only');
    return;
  }
  const queue = [];
  const queued = new Set();
  let running = false;

  const publish = (path, text) => {
    const data = { [path]: text };
    live.state.topics.RadioTranscripts = { ...(live.state.topics.RadioTranscripts ?? {}), ...data };
    live.emit('update', { topic: 'RadioTranscripts', data, replace: false, ts: new Date().toISOString() });
  };

  const run = async () => {
    if (running) return;
    running = true;
    while (queue.length) {
      const { session, path } = queue.shift();
      const key = `radio:text:${session}${path}`;
      try {
        let text = await kv.get(key);
        if (text == null) {
          text = await transcribeClip(`${STATIC_URL}/${session}${path}`, live.state.topics);
          await kv.set(key, text, 30 * 86400);
        }
        if (live.state.topics.SessionInfo?.Path === session && text) publish(path, text);
      } catch (err) {
        log('warn', `Transcript failed for ${path}: ${err.message}`);
      }
    }
    running = false;
  };

  const enqueue = (captures) => {
    const session = live.state.topics.SessionInfo?.Path;
    if (!session) return;
    for (const c of Object.values(captures ?? {})) {
      const id = `${session}${c?.Path}`;
      if (!c?.Path || queued.has(id) || queue.length >= MAX_QUEUE) continue;
      queued.add(id);
      queue.push({ session, path: c.Path });
    }
    run();
  };

  live.on('snapshot', () => enqueue(live.state.topics.TeamRadio?.Captures));
  live.on('update', (u) => u.topic === 'TeamRadio' && enqueue(u.data?.Captures));
  console.log('Transcripts: team radio will be transcribed');
}
