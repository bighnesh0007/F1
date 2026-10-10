import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireJson, requireUser } from '../src/auth.js';

const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err)));

test('requireUser explains when sign-in is not configured or missing', async () => {
  delete process.env.CLERK_SECRET_KEY;
  assert.equal((await run(requireUser, { user: null })).status, 503);
  process.env.CLERK_SECRET_KEY = 'sk_test_x';
  process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_x';
  assert.equal((await run(requireUser, { user: null })).status, 401);
  assert.equal(await run(requireUser, { user: { _id: 1 } }), undefined);
});

test('requireJson blocks non-JSON writes', async () => {
  const req = (method, json) => ({ method, is: () => json });
  assert.equal((await run(requireJson, req('POST', false))).status, 415);
  assert.equal(await run(requireJson, req('POST', true)), undefined);
  assert.equal(await run(requireJson, req('GET', false)), undefined);
});
