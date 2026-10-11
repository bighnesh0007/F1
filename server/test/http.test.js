import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFetchError } from '../src/http.js';

test('network errors name the host and the reason', () => {
  const single = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENETUNREACH' } });
  assert.equal(describeFetchError(single, 'https://api.open-meteo.com/v1/x').message, 'fetch failed: api.open-meteo.com (ENETUNREACH)');
  const many = Object.assign(new TypeError('fetch failed'), { cause: { errors: [{ code: 'ETIMEDOUT' }, { code: 'ENETUNREACH' }] } });
  assert.equal(describeFetchError(many, 'https://example.com/').message, 'fetch failed: example.com (ETIMEDOUT/ENETUNREACH)');
  const other = new Error('boom');
  assert.equal(describeFetchError(other, 'https://example.com/'), other);
});
