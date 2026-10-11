// Client for Formula 1's official live timing feed (SignalR Core), the same feed
// used by the F1 app, FastF1 and undercut-f1.
//
// Without a token the feed still carries timing, gaps, tyres, race control,
// weather, team radio and track status. Car positions on track (Position.z) and
// telemetry (CarData.z) need an F1 TV subscription token in F1_AUTH_TOKEN.
import { EventEmitter } from 'node:events';
import * as signalR from '@microsoft/signalr';
import { LiveState } from './state.js';
import { kv } from './db/redis.js';

const BASE_URL = process.env.F1_LIVETIMING_URL || 'https://livetiming.formula1.com';
const RECONNECT_DELAY_MS = 30_000;
const PERSIST_INTERVAL_MS = 15_000;
const PERSIST_KEY = 'live:derived';

export const TOPICS = [
  'Heartbeat',
  'ExtrapolatedClock',
  'SessionInfo',
  'SessionStatus',
  'SessionData',
  'TrackStatus',
  'LapCount',
  'DriverList',
  'TimingData',
  'TimingAppData',
  'TimingStats',
  'TopThree',
  'RaceControlMessages',
  'WeatherData',
  'TeamRadio',
  'PitLaneTimeCollection',
  'PitStopSeries',
  'ChampionshipPrediction',
  'Position.z',
  'CarData.z',
];

// F1_AUTH_TOKEN may be the subscription token itself, or the raw value of the
// `login-session` cookie from formula1.com (URL-encoded JSON that contains it).
function authToken() {
  const raw = process.env.F1_AUTH_TOKEN?.trim();
  if (!raw) return null;
  if (!raw.startsWith('{') && !raw.startsWith('%7B')) return raw;
  try {
    return JSON.parse(decodeURIComponent(raw)).data?.subscriptionToken ?? null;
  } catch {
    return null;
  }
}

export class LiveTimingClient extends EventEmitter {
  constructor() {
    super();
    this.state = new LiveState();
    this.status = 'disconnected';
    this.lastError = null;
    this.lastMessageAt = null;
    this.connection = null;
    this.stopped = false;
  }

  get authenticated() {
    return Boolean(authToken());
  }

  info() {
    return {
      status: this.status,
      authenticated: this.authenticated,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
    };
  }

  async start() {
    this.stopped = false;
    try {
      await this.connect();
    } catch (err) {
      const connection = this.connection;
      this.connection = null;
      await connection?.stop().catch(() => {});
      this.fail(err);
    }
  }

  async connect() {
    this.setStatus('connecting');

    // Pre-negotiate to obtain the load balancer's sticky-session cookie.
    const headers = {};
    const pre = await fetch(`${BASE_URL}/signalrcore/negotiate`, { method: 'OPTIONS' });
    const cookie = pre.headers.getSetCookie?.().find((c) => c.startsWith('AWSALBCORS='));
    if (cookie) headers.Cookie = cookie.split(';')[0];

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE_URL}/signalrcore`, {
        headers,
        transport: signalR.HttpTransportType.WebSockets,
        accessTokenFactory: this.authenticated ? authToken : undefined,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.on('feed', (topic, data, timestamp) => this.handle(topic, data, timestamp));
    connection.onreconnecting(() => this.setStatus('connecting'));
    connection.onreconnected(() => this.subscribe());
    connection.onclose((err) => {
      if (this.connection !== connection) return;
      this.connection = null;
      if (err) this.fail(err);
      else this.scheduleReconnect();
    });

    await connection.start();
    this.connection = connection;
    await this.subscribe();
  }

  async subscribe() {
    const snapshot = await this.connection.invoke('Subscribe', TOPICS);
    this.state.load(snapshot);
    try {
      const saved = JSON.parse((await kv.get(PERSIST_KEY)) ?? 'null');
      if (this.state.restore(saved)) console.log('Live timing: restored lap history and race feed for this session');
    } catch (err) {
      console.error('Live timing: could not restore saved session data:', err.message);
    }
    this.startPersisting();
    this.lastMessageAt = new Date().toISOString();
    this.setStatus('connected');
    this.lastError = null;
    this.emit('snapshot', this.state.snapshot());
  }

  handle(topic, data, timestamp) {
    this.lastMessageAt = new Date().toISOString();
    try {
      for (const update of this.state.apply(topic, data, timestamp)) this.emit('update', update);
    } catch (err) {
      console.error(`Failed to process ${topic}:`, err.message);
    }
  }

  startPersisting() {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      if (!this.state.topics.SessionInfo?.Path) return;
      kv.set(PERSIST_KEY, JSON.stringify(this.state.persisted()), 6 * 3600).catch(() => {});
    }, PERSIST_INTERVAL_MS);
    this.persistTimer.unref();
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', this.info());
  }

  fail(err) {
    const cause = err?.cause?.code ?? err?.cause?.errors?.map((e) => e.code).filter(Boolean).join('/');
    this.lastError = `${err?.message || String(err)}${cause ? ` (${cause})` : ''}`;
    console.error('Live timing error:', this.lastError);
    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.setStatus('disconnected');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start();
    }, RECONNECT_DELAY_MS);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.persistTimer);
    if (this.state.topics.SessionInfo?.Path) await kv.set(PERSIST_KEY, JSON.stringify(this.state.persisted()), 6 * 3600).catch(() => {});
    const connection = this.connection;
    this.connection = null;
    await connection?.stop();
  }
}
