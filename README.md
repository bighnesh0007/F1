# F1 Live

A real-time Formula 1 companion: live timing, a track map with every car, race alerts, schedule, standings, stats and replays. Everything comes from real data sources; there is no mock or sample data.

## Run with Docker

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

This starts four containers: the web app, the API server, **Redis** (cache, sessions, live session state) and **MongoDB** (accounts, profiles, predictions). Data is kept in Docker volumes between restarts. To use **MongoDB Atlas** instead of the local database, copy `.env.example` to `.env` and set `MONGODB_URI`.

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

**Stats**: all-time records (wins, titles, poles, fastest laps), every champion, and season-vs-season comparison.

**Replay**: play back any finished session since 2018 with moving cars, running order, flags and race control messages.

**Profiles**: sign up with email or Google, pick your team tribe (Tifosi, Papaya Army, Silver Arrows…) or let the "which team are you?" quiz decide, set your favourite driver, earn badges, and share a public profile page. Your settings follow you to any device.

**Predict & play**: call each race weekend (winner, podium, pole, fastest lap, sprint, retirements, teammate battles) with **Pit Coins**. Everyone starts with 1,000, there's a daily bonus with streaks, odds are fixed when you predict, and predictions settle automatically from the official results. Global leaderboard plus private leagues with invite codes. Pit Coins are just for fun: they can't be bought, sold or cashed out.

**Calendar**: add a weekend or the whole season to Google Calendar in one tap, open any race in Google Calendar without an account, download an .ics for Apple/Outlook, or subscribe to a season feed that updates itself. **Watch parties** create a Google Calendar event with your friends invited and a Google Meet link.

**Settings**: favourite driver (highlighted everywhere, optional team-colour theme), dark/light theme, spoiler-free mode, alerts, flag effects, sounds, reminders, and which live panels show in what order. Installable as an app on phones and desktops.

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

## Accounts, Google sign-in and Google Calendar

Email + password accounts work out of the box. Google sign-in (and with it Google Calendar sync and watch parties) needs a Google OAuth client:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (External; add yourself as a test user while testing).
3. Create credentials → **OAuth client ID** → *Web application*, with the authorised redirect URI `http://localhost:3000/api/auth/google/callback` (use your real address in production, matching `PUBLIC_URL`).
4. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` and a random `SESSION_SECRET` (`openssl rand -base64 32`) in `.env`, then `docker compose up --build`.

Google refresh tokens are stored encrypted (AES-256-GCM). Passwords are hashed with scrypt. Sessions are random tokens in an httpOnly cookie, stored in Redis.

## Data storage

| Store | What | Why |
| --- | --- | --- |
| MongoDB (local container or Atlas) | Users, profiles, settings, predictions, the coin ledger, leagues | Flexible documents, easy to host on Atlas |
| Redis (container) | Cached F1 data (schedule, results, replays, maps), login sessions, the live session's lap history and race feed | Fast, survives server restarts, shared if you run several servers |

Every coin movement is an entry in an append-only ledger with a unique reference, so settlement can't pay twice. That ledger is also the starting point for a future on-chain token (see below).

## Roadmap: an F1 fan token

Pit Coins are deliberately off-chain and have no monetary value for now. If you take them on-chain later:

- **Token**: an ERC-20 on a low-fee network (e.g. Base or Polygon). Each ledger entry (welcome bonus, daily bonus, payouts) maps to a mint or transfer; users link a wallet to their profile.
- **Custody**: start custodial (the server holds balances and settles) and let users withdraw to their own wallet, rather than requiring a wallet to play.
- **Legal**: once coins can be bought or cashed out, predicting with them is real-money betting in most countries, which needs a gambling licence, age and identity checks, and may make the token a regulated asset. Keeping coins earn-only and non-redeemable, or using them for perks (badges, profile themes, league entry), avoids that. Get legal advice before launching anything with real value. F1 and team names are trademarks: an official-looking token would need licensing.

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
  src/auth.js         accounts, sessions, Google sign-in
  src/profile.js      profiles, settings sync, public profiles
  src/game.js         Pit Coins, predictions, settlement, leaderboards, leagues
  src/calendar.js     season .ics feed, Google Calendar sync, watch parties
  src/db/             Redis and MongoDB connections
docker-compose.yml
```

## Run without Docker (development)

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The client reads `SERVER_URL` (default `http://localhost:4000`) to reach the server. For accounts, start Redis and MongoDB (`docker run -d -p 6379:6379 redis:7-alpine` and `docker run -d -p 27017:27017 mongo:7`) and run the server with `REDIS_URL=redis://localhost:6379 MONGODB_URI=mongodb://localhost:27017 npm run dev`. Without them the server still runs; accounts and predictions are just switched off.

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
| `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me` | Email accounts and sessions |
| `GET /api/auth/google` | Google sign-in (`?calendar=1` also asks for Calendar access) |
| `GET/PATCH/DELETE /api/profile`, `PUT /api/profile/settings` | Your profile and synced settings |
| `GET /api/users/:handle` | Public profile |
| `GET /api/game/markets/:season/:round` | Predictions and odds for a race weekend |
| `POST /api/game/bets`, `GET /api/game/bets` | Make and list predictions |
| `POST /api/game/daily` | Daily coin bonus |
| `GET /api/game/leaderboard`, `/api/game/leagues…` | Leaderboards and leagues |
| `GET /api/calendar/feed.ics?season=` | Season calendar feed |
| `POST /api/calendar/google/sync`, `/google/watch-party` | Google Calendar sync and watch parties |
