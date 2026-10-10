# F1 Live

A real-time Formula 1 dashboard: live timing tower, track map with every car as a dot, race control messages, weather, team radio and championship standings. Everything comes from real data sources; there is no mock or sample data.

## Project structure

```
client/   Next.js web app (UI)                       → http://localhost:3000
server/   Node.js + Express: connects to the data sources and streams them to the UI
docker-compose.yml
```

## Run with Docker

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

Live data shows up while a session (practice, qualifying, sprint, race) is running, and shortly before and after it. Outside of sessions the dashboard waits for the next one, and the race weekend schedule and standings are still shown.

## Run without Docker (development)

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The client reads `SERVER_URL` (default `http://localhost:4000`) to reach the server.

## Data sources

| Source | What it provides | Cost |
| --- | --- | --- |
| [F1 live timing](https://livetiming.formula1.com) (the feed behind the official F1 app, also used by [FastF1](https://github.com/theOehrly/Fast-F1) and [undercut-f1](https://github.com/JustAman62/undercut-f1)) | Session info and status, timing tower (positions, gaps, intervals, lap and sector times), tyres and stints, pit stops, lap count, session clock, track status (flags, safety car), race control messages, weather, team radio | Free |
| Same feed, with an F1 TV token | Live car positions on track (track map), car telemetry | Needs F1 TV Access/Pro |
| [OpenF1](https://openf1.org) | This weekend's session schedule | Free |
| [Jolpica](https://github.com/jolpica/jolpica-f1) (Ergast successor) | Driver and constructor championship standings | Free |

### Enabling live car positions (optional)

Since mid-2025, F1 only publishes live car positions to F1 TV subscribers. To enable the track map during live sessions:

1. Sign in at [formula1.com](https://www.formula1.com) with an account that has F1 TV Access or Pro.
2. Open the browser developer tools → Application/Storage → Cookies → `https://www.formula1.com`, and copy the value of the `login-session` cookie.
3. Create a `.env` file next to `docker-compose.yml` (see `.env.example`):

   ```
   F1_AUTH_TOKEN=<paste the cookie value here>
   ```

4. Restart: `docker compose up --build`.

The token expires after a few days, so repeat this when the track map stops updating. The token is tied to your personal account: keep it private and do not run a public site with it.

## Server API

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Health check and live feed connection status |
| `GET /api/live/stream` | Server-Sent Events: full live state on connect, then incremental updates |
| `GET /api/live/state` | Current live state as JSON |
| `GET /api/weekend` | The current or next race weekend and its sessions |
| `GET /api/standings` | Driver and constructor championship standings |
