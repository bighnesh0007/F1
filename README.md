# F1 Live

A real-time Formula 1 companion: live timing, a track map with every car, race alerts, schedule, standings, stats and replays. Everything comes from real data sources; there is no mock or sample data.

## Run with Docker

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

This starts four containers: the web app, the API server, **Redis** (cache, sessions, live session state) and **MongoDB** (profiles, predictions, rankings). Data is kept in Docker volumes between restarts.

All configuration lives in one file: copy `.env.example` to `.env` in the project root and fill in what you need (Clerk keys for sign-in, `MONGODB_URI` for **MongoDB Atlas**). `.env` is git-ignored, so your secrets never get committed. Docker Compose, the server (`npm run dev`) and the web app all read it.

## What's inside

**Live** (during a session)
- Timing tower: positions, gaps (interval or to leader), sector colours, lap times, tyres and age, places gained. Rows slide when positions change.
- Track map with every car. With an F1 TV token the dots are live GPS; without one they're estimated from timing data (typically within about 100 m; see below).
- Battle tracker for cars within 1 second.
- Pop-up alerts for overtakes, pit stops (new tyre, places lost or gained), fastest laps and retirements.
- Full-screen safety car, VSC, red flag and chequered flag moments; start-lights animation at a race start; sound effects.
- Race feed with race control messages and team radio you can play.
- Insights: gap chart, lap times, position chart, tyre strategy, and head-to-head between any two drivers.
- Driver card: photo, this session's numbers, tyres, lap chart, season stats and teammate battle.
- Weather, rain warning and a live rain radar.

**Between sessions**: countdown to the next session, the weekend schedule in your time zone, calendar export (.ics), reminders, a circuit guide (map, corners, lap record, past winners), the last race's podium and the championship.

**Schedule**: the season calendar with winners, and a page per round with a post-race summary: podium, key moments, classification, lap-by-lap position chart and pit stops.

**Standings**: drivers, teams, a title-fight calculator ("can they still win it?"), a points simulator for the next race, and teammate head-to-heads.

**Race centre** (`/live`): tap the LIVE badge, "Open race centre" or a live session to open a full view of the session: a big track map with every car, the timing tower, race control messages (filter flags, stewards' decisions, DRS) with the latest one shown over the map, a team radio player (tap to listen, or auto-play new radio as it comes in), a driver to follow (position, gaps to the cars around them, sectors and mini-sectors, tyres, and live speed/gear/throttle/brake with an F1 TV token), pit stops with stationary times, and the live championship during races. On phones each part is a tab.

**Stats**: all-time records (wins, titles, poles, fastest laps), every champion, and season-vs-season comparison.

**Replay**: play back any finished session since 2018 with moving cars, running order, flags and race control messages.

**Profiles**: sign up with [Clerk](https://clerk.com) (email, Google and any other provider you turn on), pick your team tribe (Tifosi, Papaya Army, Silver Arrows…) or let the "which team are you?" quiz decide, set your favourite driver, earn badges, and share a public profile page. Your settings follow you to any device.

**Predict & play**: call each race weekend (winner, podium, pole, fastest lap, sprint, retirements, teammate battles) for **points**. Tap an option to make or change your call until the session starts; long shots are worth more (a back-marker win pays far more than the favourite). Calls are scored automatically from the official results. Rankings: everyone, **tribe vs tribe** (which fan base calls races best), and private leagues with invite codes.

**Calendar**: add a weekend or the whole season to Google Calendar in one tap, open any race in Google Calendar without an account, download an .ics for Apple/Outlook, or subscribe to a season feed that updates itself. **Watch parties** create a Google Calendar event with your friends invited and a Google Meet link.

**Settings**: favourite driver (highlighted everywhere, optional team-colour theme), dark/light theme, spoiler-free mode, alerts, flag effects, sounds, reminders, and which live panels show in what order. Installable as an app on phones and desktops.

**Works offline**: the app keeps working on a bad connection. Pages and public F1 data are cached by a service worker, and the last live timing is kept on the device: if the connection drops (or you reopen the app without signal) you see the last timing received, clearly marked, until it reconnects.

**Accessibility**: keyboard navigation everywhere (skip link, visible focus, cars on the map can be selected with Tab and Enter, dialogs keep focus inside), screen-reader labels and live announcements for race control, a colour-blind friendly palette (blue/orange instead of green/red), and a reduce-motion switch that also follows the device setting.

## Data sources

| Source | Used for | Cost |
| --- | --- | --- |
| [F1 live timing](https://livetiming.formula1.com) (the feed behind the official app, also used by [FastF1](https://github.com/theOehrly/Fast-F1) and [undercut-f1](https://github.com/JustAman62/undercut-f1)) | Everything live: timing, tyres, pit stops, track status, race control, weather, team radio | Free |
| Same feed with an F1 TV token | Live car GPS positions | F1 TV Access/Pro |
| F1 live timing archive (`/static`) | Replays, driver photos and team colours, circuit keys | Free |
| [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast successor) | Schedule, results, standings, lap positions, pit stops, records | Free |
| [MultiViewer](https://multiviewer.app) circuit API | Track maps with corner numbers | Free |
| [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT, bundled in `server/data`) | Fallback track outlines and lap lengths | Free |
| [RainViewer](https://www.rainviewer.com) | Rain radar | Free |

### How the map works without F1 TV

Every car reports when it passes each of the ~25 timing points ("mini-sectors") around a lap, and that part of the feed is free. The server learns where those points fall on the lap, and the browser moves each car smoothly between them at the car's current pace, stopping at the next timing point until the car is seen passing it. Tested against real recorded car positions from the 2021 Bahrain GP, the estimate was typically within about 80 m (90% within 150 m) on a 5.4 km lap.

### Enabling live car positions (optional)

Since mid-2025, F1 only publishes live car positions to F1 TV subscribers.

1. Sign in at [formula1.com](https://www.formula1.com) with an account that has F1 TV Access or Pro.
2. Open the browser developer tools → Application/Storage → Cookies → `https://www.formula1.com`, and copy the value of the `login-session` cookie.
3. Create a `.env` file next to `docker-compose.yml` (see `.env.example`):

   ```
   F1_AUTH_TOKEN=<paste the cookie value here>
   ```

4. Restart: `docker compose up --build`.

The token expires after a few days. It is tied to your personal account: keep it private and do not run a public site with it.

## Sign-in with Clerk

Accounts use [Clerk](https://clerk.com). Without keys the app still runs; sign-in, profiles and predictions are just switched off.

1. In the [Clerk dashboard](https://dashboard.clerk.com), open your application → **API keys**.
2. Put the two keys in `.env` in the project root:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
   The publishable key is public (it is built into the browser code). The secret key stays on the server: never commit it or put it in client code.
3. `docker compose up --build` (the publishable key is baked in at build time, so rebuild after changing it), then open http://localhost:3000 and sign up. The first account you create is your test user.

The web app forwards each request with the signed-in user's Clerk session token; the API server verifies it and keeps an app profile (tribe, points, predictions, settings) per Clerk user in MongoDB. Deleting your account in the app deletes both the Clerk user and the app data.

### Google Calendar and watch parties

These use the Google account people sign in with through Clerk:

1. In Clerk → **SSO connections**, enable **Google** and switch to **custom credentials** (a client ID and secret from [Google Cloud Console](https://console.cloud.google.com/) with the **Google Calendar API** enabled; use the redirect URI Clerk shows you).
2. Add the scope `https://www.googleapis.com/auth/calendar.events`.

People who signed in another way can connect Google from their profile or the calendar menu. The server asks Clerk for a fresh Google access token whenever it writes to the calendar; it never stores Google tokens itself.

## Data storage

| Store | What | Why |
| --- | --- | --- |
| Clerk | Sign-in, passwords, social logins, sessions | Secure, managed accounts |
| MongoDB (local container or Atlas) | App profiles, settings, predictions, points, leagues | Flexible documents, easy to host on Atlas |
| Redis (container) | Cached F1 data (schedule, results, replays, maps), the live session's lap history and race feed | Fast, survives server restarts, shared if you run several servers |

## Roadmap: Web3

Points are off-chain and have no monetary value. A future version could add a Web3 layer: Clerk already supports wallet sign-in (MetaMask, Coinbase Wallet, …), which would be the first step for linking a wallet to a profile; on-chain badges or a fan token could follow. Anything that can be bought or cashed out turns predictions into real-money betting in most countries, which needs a gambling licence and legal advice, and F1 and team names are trademarks.

## Project structure

```
client/   Next.js app (UI)                                  → http://localhost:3000
  app/          pages: / (live), /schedule, /standings, /stats, /replay
  components/   live/, race/, standings/, stats/, replay/, track/, shell/, ui/
  lib/          live state, settings, drivers, formatting, track geometry
server/   Node.js + Express                                 → http://localhost:4000
  src/livetiming.js   connection to F1's live feed
  src/state.js        merges feed updates into the live state
  src/analysis.js     lap history, race events, estimated car positions
  src/jolpica.js      schedule, results, standings, history (rate-limited, cached)
  src/f1static.js     F1 archive: season index, driver list, replays
  src/maps.js         circuit maps
  src/auth.js         Clerk token checks, app profiles
  src/profile.js      profiles, settings sync, public profiles
  src/game.js         predictions, scoring, rankings, tribes, leagues
  src/calendar.js     season .ics feed, Google Calendar sync, watch parties
  src/db/             Redis and MongoDB connections
docker-compose.yml
```

## Tests and monitoring

```bash
cd server && npm test   # scoring, live feed parsing and events, auth checks
cd client && npm test   # live state merging, map position estimate, formatting
```

GitHub Actions runs these plus lint, type checks and a production build on every push (`.github/workflows/ci.yml`).

The server logs every failed or slow request (over `SLOW_REQUEST_MS`, default 1500 ms; `LOG_FORMAT=json` for log tools, `LOG_REQUESTS=1` to log everything). Browsers report crashes and page-speed numbers (Core Web Vitals) back to the server. Set `METRICS_TOKEN` to read the summary:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:4000/api/health/metrics
```

It shows response times per route (p50/p95), error counts, page-speed (LCP, INP, CLS…) and the latest browser errors.

## Run without Docker (development)

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

Both read the root `.env`. The client reads `SERVER_URL` (default `http://localhost:4000`) to reach the server. For accounts, set the Clerk keys and either `MONGODB_URI` (Atlas) or start MongoDB locally (`docker run -d -p 27017:27017 mongo:7`, then `MONGODB_URI=mongodb://localhost:27017`); Redis is optional (`REDIS_URL=redis://localhost:6379`). Without them the server still runs; accounts and predictions are just switched off.

## Server API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Health check and live feed status |
| `GET /api/live/stream` | Server-Sent Events: live state snapshot, then updates |
| `GET /api/live/state` | Current live state as JSON |
| `GET /api/weekend` | Current or next race weekend, plus the previous race |
| `GET /api/schedule?year=` | Season calendar |
| `GET /api/standings?year=` | Driver and constructor standings |
| `GET /api/season-results?year=` | Every race, sprint and qualifying result of a season |
| `GET /api/race/:year/:round` | One race: results, lap-by-lap positions, pit stops |
| `GET /api/circuit-history/:circuitId` | Past winners and lap record at a circuit |
| `GET /api/circuit-map?key=&locality=` | Circuit map |
| `GET /api/records` | All-time records |
| `GET /api/season-summary/:year` | A season at a glance |
| `GET /api/drivers` | Current drivers: photos, team colours |
| `GET /api/replay/sessions?year=` | Finished sessions with archived data |
| `GET /api/replay?path=` | Replay data for one session |
| `GET /api/auth/me`, `POST /api/auth/refresh` | The signed-in user's app profile (re-synced from Clerk) |
| `GET/PATCH/DELETE /api/profile`, `PUT /api/profile/settings` | Your profile and synced settings |
| `GET /api/users/:handle` | Public profile |
| `GET /api/game/markets/:season/:round` | What you can call for a race weekend, with points per option |
| `PUT/DELETE/GET /api/game/predictions` | Make, change, remove and list your calls |
| `GET /api/game/leaderboard`, `/api/game/tribes`, `/api/game/leagues…` | Rankings: everyone, tribes, leagues |
| `GET /api/calendar/feed.ics?season=` | Season calendar feed |
| `POST /api/calendar/google/sync`, `/google/watch-party` | Google Calendar sync and watch parties |
