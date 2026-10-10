# F1 Live

A real-time Formula 1 companion: live timing, a track map with every car, race alerts, schedule, standings, stats and replays. Everything comes from real data sources; there is no mock or sample data.

## Run with Docker

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

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
docker-compose.yml
```

## Run without Docker (development)

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The client reads `SERVER_URL` (default `http://localhost:4000`) to reach the server.

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
