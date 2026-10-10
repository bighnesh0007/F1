# F1 Live

A real-time Formula 1 race tracker: a track layout with every driver shown as a moving dot, powered by real timing data from [OpenF1](https://openf1.org). No mock or sample data.

## Project structure

```
client/   Next.js web app (UI)              → http://localhost:3000
server/   Node.js + Express API (OpenF1)    → http://localhost:4000
docker-compose.yml
```

## Run with Docker

Requires [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open http://localhost:3000. Stop with `Ctrl+C`, or `docker compose down`.

## Run without Docker (development)

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The client reads `SERVER_URL` (default `http://localhost:4000`) to reach the server.

## API

| Endpoint           | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| `GET /api/health`  | Health check                                                  |
| `GET /api/weekend` | The current or next race weekend and its sessions, with status |

## Data source

All data comes from the [OpenF1 API](https://openf1.org). Historical data is free; live data during a session may require an OpenF1 account. See their docs for details.
