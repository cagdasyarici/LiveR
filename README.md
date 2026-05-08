# LiveRelay

> High-performance, self-hosted real-time notification & messaging microservice

Built with **TypeScript**, **uWebSockets.js**, and **Redis** for horizontal scaling.

## Features

- **uWebSockets.js** — 10x faster than Socket.IO, handles 10K+ concurrent connections
- **Horizontal Scaling** — Redis pub/sub, no sticky sessions required
- **JWT Authentication** — Stateless, secure WebSocket connections
- **REST API** — Send messages from any backend via HTTP
- **Rate Limiting** — Redis-backed sliding window (WebSocket + HTTP)
- **Prometheus Metrics** — `/api/metrics` endpoint for monitoring
- **Client SDK** — Browser & Node.js compatible with auto-reconnection
- **Docker Ready** — One command deployment with Docker Compose

## Quick Start

```bash
# Start everything (app + Redis + dashboard)
docker compose -f docker/docker-compose.yml up -d

# Check health
curl http://localhost:3001/api/health

# Generate a test JWT token
npx tsx scripts/generate-jwt.ts

# Open monitoring dashboard
open http://localhost:8080
```

## Development

```bash
# Install dependencies
npm install

# Start Redis via Docker
docker compose -f docker/docker-compose.yml up redis -d

# Start dev server with hot reload
JWT_SECRET=dev-secret API_KEY=dev-key npm run dev

# Run tests
npm test
```

## Architecture

```
Client (WebSocket) ──► LiveRelay Instance 1 ──► Redis Pub/Sub ──► LiveRelay Instance 2 ──► Client
Backend (REST API) ──► LiveRelay Instance 1 ──► Redis Pub/Sub ──► All Instances ──► Clients
```

**Core Components:**
- `ConnectionManager` — WebSocket connection tracking per user
- `RoomManager` — Channel subscription management
- `MessageRouter` — Routes messages to users/rooms/broadcast
- `RateLimiter` — Redis-backed sliding window rate limiting
- `MetricsCollector` — Connection, message, and error tracking

## API

### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check with Redis status |
| GET | `/api/metrics` | None | Prometheus-format metrics |
| POST | `/api/send` | API Key | Send to user or room |
| POST | `/api/broadcast` | API Key | Broadcast to all clients |
| POST | `/api/rooms/:id/send` | API Key | Send to specific room |
| GET | `/api/rooms` | API Key | List active rooms |
| GET | `/api/connections` | API Key | Connection statistics |

### WebSocket Protocol

Connect: `ws://localhost:3001/ws?token=<JWT>`

```json
// Subscribe to a room
{ "type": "subscribe", "room": "room:dashboard" }

// Send a message (requires "send" permission)
{ "type": "publish", "room": "room:chat", "event": "message", "data": { "text": "hello" } }

// Keepalive
{ "type": "ping" }
```

See [docs/API.md](docs/API.md) and [docs/WEBSOCKET-PROTOCOL.md](docs/WEBSOCKET-PROTOCOL.md) for full documentation.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ LTS |
| Language | TypeScript 5.x (strict) |
| WebSocket | uWebSockets.js |
| HTTP | uWebSockets.js (built-in) |
| Pub/Sub & State | Redis 7+ (ioredis) |
| Auth | JWT (jsonwebtoken) |
| Validation | zod |
| Logging | pino |
| Testing | vitest |
| Containerization | Docker + Docker Compose |

## Testing

```bash
npm test              # Run all unit tests
npm run test:watch    # Watch mode
```

## Load Testing

```bash
npx tsx tests/load/ws-load-test.ts --connections 1000 --duration 30
```

## License

MIT
