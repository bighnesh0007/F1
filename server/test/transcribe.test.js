import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeClip } from '../src/transcribe.js';

test('sends the clip to an OpenAI-compatible transcription API', async () => {
  process.env.TRANSCRIBE_URL = 'https://stt.example/v1/';
  process.env.TRANSCRIBE_API_KEY = 'key';
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('.mp3')) return new Response(new Uint8Array([1, 2, 3]));
    const form = init.body;
    assert.equal(form.get('model'), 'whisper-1');
    assert.match(form.get('prompt'), /Leclerc/);
    assert.equal((await form.get('file').arrayBuffer()).byteLength, 3);
    return Response.json({ text: '  Box, box. ' });
  };
  const text = await transcribeClip('https://static/x.mp3', { DriverList: { 16: { LastName: 'Leclerc' } } }, fakeFetch);
  assert.equal(text, 'Box, box.');
  assert.equal(calls[1].url, 'https://stt.example/v1/audio/transcriptions');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer key');
});

test('fails clearly when the clip is missing', async () => {
  await assert.rejects(transcribeClip('https://static/x.mp3', {}, async () => new Response('', { status: 404 })), /404 fetching radio clip/);
});
