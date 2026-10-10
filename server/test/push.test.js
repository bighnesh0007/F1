import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationsFor, notify, setSender, validEndpoint } from '../src/push.js';

test('only real push services are accepted', () => {
  assert.ok(validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.ok(validEndpoint('https://web.push.apple.com/x'));
  assert.ok(!validEndpoint('http://fcm.googleapis.com/x'));
  assert.ok(!validEndpoint('https://evil.example.com/fcm.googleapis.com'));
  assert.ok(!validEndpoint('https://169.254.169.254/latest'));
  assert.ok(!validEndpoint('not a url'));
});

const topics = { SessionInfo: { Path: '2024/x/', Meeting: { Name: 'Monaco Grand Prix' } }, DriverList: { 16: { Tla: 'LEC' } } };

test('safety car and red flag go to flag subscribers', () => {
  const [n] = notificationsFor({ type: 'trackStatus', status: '4', ts: 't' }, topics);
  assert.deepEqual(n.filter, { 'prefs.flags': true });
  assert.match(n.payload.title, /Safety car · Monaco/);
  assert.equal(notificationsFor({ type: 'trackStatus', status: '1', ts: 't' }, topics).length, 0);
});

test("a pit stop goes to that driver's fans", () => {
  const [n] = notificationsFor({ type: 'pitIn', driver: '16', lap: 30, position: 1, ts: 't' }, topics);
  assert.deepEqual(n.filter, { 'prefs.driver': '16' });
  assert.equal(n.payload.title, 'LEC is in the pits');
  assert.match(n.payload.body, /lap 30 · was P1/);
});

test('notify sends to matching subscribers and drops expired ones', async () => {
  const { pushRouter } = await import('../src/push.js');
  process.env.VAPID_PUBLIC_KEY = 'x';
  process.env.VAPID_PRIVATE_KEY = 'y';
  // Subscribe two devices through the API handler.
  const router = pushRouter();
  const subscribe = router.stack.find((l) => l.route?.path === '/subscribe').route.stack[0].handle;
  const call = (body) => new Promise((resolve) => subscribe({ body, user: null }, { status: () => ({ json: resolve }), json: resolve }));
  await call({ subscription: { endpoint: 'https://fcm.googleapis.com/a', keys: { p256dh: 'p', auth: 'a' } }, prefs: { driver: '16' } });
  await call({ subscription: { endpoint: 'https://fcm.googleapis.com/b', keys: { p256dh: 'p', auth: 'a' } }, prefs: { driver: '16', flags: true } });
  const calls = [];
  setSender(async (sub) => {
    calls.push(sub.endpoint);
    if (sub.endpoint.endsWith('/a')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  });
  assert.equal(await notify({ 'prefs.driver': '16' }, { title: 't' }), 1);
  assert.equal(calls.length, 2);
  calls.length = 0;
  assert.equal(await notify({ 'prefs.driver': '16' }, { title: 't' }), 1);
  assert.deepEqual(calls, ['https://fcm.googleapis.com/b']);
});
