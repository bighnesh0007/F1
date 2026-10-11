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
- Track map with every car. With an F1 TV token the dots are live GPS; without one they're estimated from timing data (typically within about 30 m; see below).
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

**Race centre** (`/live`): tap the LIVE badge, "Open race centre" or a live session to open a full view of the session: a big track map with every car, the timing tower, race control messages (filter flags, stewards' decisions, DRS) with the latest one shown over the map, a team radio player (tap to listen, or auto-play new radio as it comes in), a driver to follow (position, gaps to the cars around them, sectors and mini-sectors, tyres, and live speed/gear/throttle/brake with an F1 TV token), pit stops with stationary times (tagged when made under a safety car), **speed traps**, and the live championship during races. The map uses the exact sector lines and real pit lane learnt from the circuit's last race, draws yellow-flag sectors and puts a short trail behind the cars you follow. On phones each part is a tab.

**More in the race centre**: a pit strategy board (pit window from tyre age, where each car would rejoin if it pitted now, undercut risk), head-to-head with the gap between two drivers lap by lap, all the lap-time/gap/position charts, tyre wear per stint, team radio transcripts (with a speech-to-text service, see below), **Pop out** (timing in a small always-on-top window to keep over your TV stream) and **TV mode** (`/live/tv`, a big-screen layout with a ticker).

**Phone notifications**: session about to start, safety car / red flag, and your driver's pit stops, even with the app closed (Settings → Phone notifications; needs VAPID keys, see below).

**Stats**: all-time records (wins, titles, poles, fastest laps), every champion, and season-vs-season comparison.

**Replay**: play back any finished session since 2018 with moving cars, flags and race control messages. The board matches the session:
- **Race and sprint**: lap counter and progress bar, places gained from the grid, interval or gap to the leader, tyres, pit stops, fastest lap, and retired cars in their own list.
- **Qualifying** (and sprint qualifying): Q1/Q2/Q3 tabs, the time left, the drop zone, and drivers knocked out in each part.
- **Practice**: ranked by fastest lap, with gaps, laps run and who is out on track.

The map shows the track coloured by sector (exact sector lines, worked out from where cars are when their sector times appear), the real pit lane (traced from a car's pit stop), yellow-flag sectors, full-throttle zones and a short weather line (air and track temperature, wind, rain). A car that stops or retires is marked where it stopped and then removed. Recent incidents are pinned to their corner. The side panel has tabs for the order, **speed traps** (fastest through each trap), **team radio** (clips play as the replay reaches them, at up to 5×) and race control. Dots under the timeline mark the followed driver's pit stops, places gained or lost and radio; click one to jump there.

**Follow a driver in a replay** (tap a car or a name) to open a panel with three tabs:
- **Onboard**: speed, gear, throttle, brake, revs and rear wing, in sync with the replay.
- **Lap**: the lap's speed, throttle and braking along the lap with corner labels, against any other lap (the fastest so far, or another driver's best), with the time gap point by point, top speed, share of the lap at full throttle and short driving notes (lifting before braking, speed dropping at full throttle). The map can show that lap as a **speed map**, and the full-throttle zones then come from its telemetry.
- **Tyres**: lap time against tyre age for each stint, with the slowdown per lap, and each pit stop with its time in the pit lane, what it cost and whether it was under a safety car.

This uses F1's archived car telemetry, which is published for every finished session. Battery and fuel use are not published, so notes about them are a best guess.

**Profiles**: sign up with [Clerk](https://clerk.com) (email, Google and any other provider you turn on), pick your team tribe (Tifosi, Papaya Army, Silver Arrows…) or let the "which team are you?" quiz decide, set your favourite driver, earn badges, and share a public profile page. Your settings follow you to any device.

**Predict & play**: call each race weekend (winner, podium, pole, fastest lap, sprint, retirements, teammate battles) for **points**. Tap an option to make or change your call until the session starts; long shots are worth more (a back-marker win pays far more than the favourite). Calls are scored automatically from the official results. Rankings: everyone, **tribe vs tribe** (which fan base calls races best), and private leagues with invite codes.

**Fantasy team**: pick 5 drivers and 2 teams within a 100.0 budget before qualifying (prices follow the championship), name a captain who scores double, and score from the real results: championship points, places gained and a penalty for retiring. Teams carry over between weekends.

**Weekly quiz**: five questions from real race history (winners, poles, podiums, teams, fastest laps), the same for everyone that week, for extra points.

**Live chat and polls**: chat during sessions with everyone or just your tribe (sign-in to post, slow mode, report and hide), plus fan polls in races: "Who wins?" until half distance and "Driver of the day" at the end, with live results.

**Friends and achievements**: follow other fans, rank against them, and see their calls once they lock. Badges for streaks (predicting weekends in a row), quizzes, fantasy, watching live sessions, hosting watch parties and more. **Share cards**: share a correct call or your profile as a picture card on social media.

**Driver and team pages**: every driver's and team's career from the full results history: titles, wins, podiums, poles, points by season, season-by-season tables and their latest races (linked from the standings).

**News**: headlines from Formula1.com, Autosport, Motorsport.com and The Race, filterable by team, on the home page, driver and team pages. Articles open on the publisher's site.

**Going to the race**: time at the track vs. yours, sunrise and sunset, the race-day forecast (or typical weather from the last five years), plus ticket and directions links.

**AI race analyst** (with an Anthropic API key): a written recap of each finished race, "Catch me up" during live sessions, and questions like "why did Hamilton pit?" answered from the live timing data, in the race centre's Ask AI tab.

**Languages**: English, Hindi and Spanish (Settings → Language; follows your browser's language by default). The main screens are translated; anything not yet translated shows in English.

**Installable app**: install from the browser (Settings → App), with home-screen shortcuts to the race centre, Play, Schedule and News. See below for publishing to app stores.

**Calendar**: add a weekend or the whole season to Google Calendar in one tap, open any race in Google Calendar without an account, download an .ics for Apple/Outlook, or subscribe to a season feed that updates itself. **Watch parties** create a Google Calendar event with your friends invited and a Google Meet link.

**Settings**: favourite driver (highlighted everywhere, optional team-colour theme), dark/light theme, spoiler-free mode, alerts, flag effects, sounds, reminders, and which live panels show in what order. Installable as an app on phones and desktops.

**Works offline**: the app keeps working on a bad connection. Pages and public F1 data are cached by a service worker, and the last live timing is kept on the device: if the connection drops (or you reopen the app without signal) you see the last timing received, clearly marked, until it reconnects.

**Accessibility**: keyboard navigation everywhere (skip link, visible focus, cars on the map can be selected with Tab and Enter, dialogs keep focus inside), screen-reader labels and live announcements for race control, a colour-blind friendly palette (blue/orange instead of green/red), and a reduce-motion switch that also follows the device setting.

### If the server shows as unhealthy

See its own log (database logs are kept out of `docker compose up`):

```bash
docker compose logs server
```

The server starts answering straight away and connects to the databases in the background, so a database problem shows up in that log (e.g. `MongoDB: can't connect yet ...`) instead of blocking start-up. With MongoDB Atlas, the usual cause is the IP access list: allow your machine's IP (or `0.0.0.0/0` while testing) under Atlas → Network Access, and check the user name and password in `MONGODB_URI`.

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

Every car reports when it passes each of the ~25 timing points ("mini-sectors") around a lap, and that part of the feed is free. The server learns where those points fall on the lap, and the browser moves each car smoothly between them at the car's current pace, stopping at the next timing point until the car is seen passing it. Timing messages arrive a little after the car has actually passed each point, so cars are drawn about 1.75 s behind the raw timing. Tested against real recorded car positions from the 2021 Bahrain GP (about 32,000 samples), the estimate is typically within about 30 m (median 28 m, 90% within 120 m) on a 5.4 km lap; before the delay correction it was 81 m.

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

## Pro (subscriptions)

`/pro` sells F1 Live Pro through [Clerk Billing](https://clerk.com/docs/billing/overview): turn on Billing in the Clerk dashboard and create a plan with the key `pro` (or set `PRO_PLAN`). Pro raises the AI question limit (100/hour) and private league limit (50), and shows a Supporter badge. Everything else stays free.

## Roadmap: Web3

Points are off-chain and have no monetary value. The first step is in place: turn on **Web3 wallets** in the Clerk dashboard and fans can sign in with or link a wallet (MetaMask, Coinbase Wallet…); a linked wallet shows on their profile and earns a "Web3 ready" badge. On-chain badges or a fan token could follow. Anything that can be bought or cashed out turns predictions into real-money betting in most countries, which needs a gambling licence and legal advice, and F1 and team names are trademarks.

See [ROADMAP.md](ROADMAP.md) for the status of every planned improvement.

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
  src/game.js         predictions, scoring, rankings, tribes, leagues, badges
  src/fantasy.js      fantasy teams, prices and scoring
  src/quiz.js         weekly quiz from race history
  src/chat.js         live chat (SSE, Redis pub/sub)
  src/polls.js        fan polls during races
  src/social.js       friends, feed, live-session check-ins
  src/push.js         push notifications
  src/transcribe.js   team radio transcripts
  src/observe.js      request logs, browser error reports, metrics
  src/ai.js           AI race analyst (Claude)
  src/news.js         news feeds
  src/trip.js         time zone, daylight and weather for race trips
  src/calendar.js     season .ics feed, Google Calendar sync, watch parties
  src/db/             Redis and MongoDB connections
docker-compose.yml
```

## Your own domain (Cloudflare Tunnel)

To open the app at your own address (e.g. `https://f1.bighnesh.space`) whenever `docker compose up` is running, without opening ports on your router:

1. **Put the domain on Cloudflare.** In Cloudflare, add the site `bighnesh.space` (the Free plan is fine). Cloudflare gives you two nameservers. At your registrar (Hostinger → Domains → bighnesh.space → DNS / Nameservers), replace the current nameservers with those two. Copy over any DNS records you still need first, because whatever the old nameservers served stops being used.
2. **Create a tunnel.** Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared. Name it `f1`, then skip the install step. Docker runs cloudflared for you.
3. **Add a public hostname.** In the tunnel, set subdomain `f1`, domain `bighnesh.space`, and service `HTTP` → `client:3000`.
4. **Add these lines to `.env`** (the tunnel token is a secret, so keep it only in `.env`):
   ```
   COMPOSE_PROFILES=tunnel
   CLOUDFLARE_TUNNEL_TOKEN=<token shown when you created the tunnel>
   PUBLIC_URL=https://f1.bighnesh.space
   ```
5. Run `docker compose up --build`. The `f1-tunnel` container connects out to Cloudflare, and the site is live at `https://f1.bighnesh.space` with HTTPS. Stop the containers and the site goes offline.

### Start automatically when the computer boots

Every container has `restart: unless-stopped`, so Docker brings them back after a reboot. You only need Docker itself to start at boot, and to run the app once in the background:

```bash
sudo systemctl enable --now docker   # start Docker at boot
docker compose up -d --build         # run in the background (from the project folder)
```

To update later, run `git pull && docker compose up -d --build`. `docker compose stop` or `down` takes the site offline until you run `up -d` again. Logs: `docker compose logs -f`.

For sign-in on that address, add `f1.bighnesh.space` to your Clerk app as well (Clerk dashboard → Domains), especially if you use production keys.

## Optional services

**Push notifications.** Generate keys once and put them in `.env`:

```bash
npx web-push generate-vapid-keys
```
```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

**Team radio transcripts.** Any OpenAI-compatible speech-to-text API works (OpenAI Whisper, Groq, or a self-hosted faster-whisper server):

```
TRANSCRIBE_URL=https://api.openai.com/v1
TRANSCRIBE_API_KEY=...
TRANSCRIBE_MODEL=whisper-1
```

Each clip is transcribed once and cached for 30 days.

**AI race analyst.** Uses Claude (Anthropic's API):

```
ANTHROPIC_API_KEY=...
AI_MODEL=claude-opus-5-5   # optional
```

If Claude's safety checks decline a request, the API automatically retries it on a fallback model (`AI_FALLBACKS=off` to disable). Recaps are written once per race and cached; questions are limited to 20 per user per hour and need sign-in when Clerk is set up.

**News feeds.** `NEWS_FEEDS` (comma-separated RSS URLs) replaces the default list.

### Publishing to app stores

F1 Live is a Progressive Web App, so the same site can be wrapped as a store app:

- **Google Play**: build a Trusted Web Activity with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or [PWABuilder](https://www.pwabuilder.com/) from `https://your-domain/manifest.webmanifest`, then set `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_SHA256` so `/.well-known/assetlinks.json` verifies the app (no browser bar).
- **iOS App Store**: PWABuilder can generate an iOS wrapper project; people can also simply "Add to Home Screen" in Safari.

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
| `GET /api/replay/lap?path=&driver=&lap=` | One lap's telemetry (distance, speed, throttle, brake, gear, RPM, DRS, position) |
| `GET /api/replay/car?path=&driver=` | One car's telemetry through a session, twice a second |
| `GET /api/circuit-extras?key=` | Sector lines, pit lane and usual pit stop cost for a circuit (from its last race) |
| `GET /api/auth/me`, `POST /api/auth/refresh` | The signed-in user's app profile (re-synced from Clerk) |
| `GET/PATCH/DELETE /api/profile`, `PUT /api/profile/settings` | Your profile and synced settings |
| `GET /api/users/:handle` | Public profile |
| `GET /api/game/markets/:season/:round` | What you can call for a race weekend, with points per option |
| `PUT/DELETE/GET /api/game/predictions` | Make, change, remove and list your calls |
| `GET /api/game/leaderboard`, `/api/game/tribes`, `/api/game/leagues…` | Rankings: everyone, tribes, leagues |
| `GET /api/calendar/feed.ics?season=` | Season calendar feed |
| `GET/PUT /api/game/fantasy/:season/:round`, `GET /api/game/fantasy/leaderboard`, `/history` | Fantasy team, prices, rankings |
| `GET/POST /api/game/quiz` | This week's quiz, submit answers |
| `GET /api/game/calls/:id` | A correct call (for share cards) |
| `GET/POST /api/chat/:room`, `GET /api/chat/:room/stream` | Chat rooms (`everyone`, `tribe-<team>`), live stream |
| `GET /api/polls/live`, `POST /api/polls/:kind/vote` | Fan polls during races |
| `POST/DELETE /api/users/:handle/follow`, `GET /api/friends`, `/friends/leaderboard`, `/friends/feed` | Friends |
| `POST /api/push/subscribe`, `/unsubscribe`, `GET /api/push/key` | Push notifications |
| `GET /api/driver/:id`, `GET /api/team/:id` | Driver career, team history |
| `GET /api/news?q=` | News headlines (optionally matching words) |
| `GET /api/trip?lat=&lon=&date=` | Time zone, daylight and weather for a race |
| `GET /api/ai/status`, `/api/ai/recap/:season/:round`, `/api/ai/catch-up`; `POST /api/ai/ask` | AI analyst |
| `POST /api/calendar/google/sync`, `/google/watch-party` | Google Calendar sync and watch parties |
