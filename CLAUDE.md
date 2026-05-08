# LiveRelay — Project Rules

## What is this?
LiveRelay is a self-hosted, high-performance real-time notification & messaging microservice built with TypeScript and uWebSockets.js. Full architecture spec lives in `LiveRelay-Architecture.md`.

## Tech Stack
- **Runtime:** Node.js 20+ LTS
- **Language:** TypeScript 5.x (strict mode)
- **WebSocket:** uWebSockets.js (NOT Socket.IO)
- **HTTP:** uWebSockets.js built-in HTTP (NOT Express)
- **Redis:** Redis 7+ via ioredis (run via Docker in dev)
- **Auth:** JWT (jose/jsonwebtoken)
- **Logging:** pino
- **Validation:** zod
- **Testing:** vitest
- **Containerization:** Docker + Docker Compose

## Development Workflow
- Sprint-based development (5 sprints total, executed one at a time)
- Sprint progress is tracked in `.claude/sprints/Sprint-{N}.md`
- Redis runs via Docker Compose during development
- Node.js v20.14.0 is available locally

## Code Conventions
- All code, comments, documentation, and commit messages in **English**
- TypeScript strict mode — no `any` types unless absolutely necessary
- Use zod for all runtime validation (config, messages, API payloads)
- Structured JSON logging with pino — no `console.log`
- Error codes defined as enums, not magic strings
- Use `nanoid` for ID generation
- Prefer `Map`/`Set` over plain objects for collections

## Architecture Rules
- uWebSockets.js only — never add Socket.IO or Express as dependencies
- Redis pub/sub for cross-instance communication — no sticky sessions
- JWT is stateless auth — no session storage
- REST API uses a separate API key (server-to-server), not client JWTs
- Every public endpoint must be rate-limited
- All config loaded via zod-validated env variables

## File Structure
Follow the structure defined in `LiveRelay-Architecture.md` Section 3. Key directories:
- `src/config/` — env config loader
- `src/core/` — ConnectionManager, RoomManager, MessageRouter, RateLimiter, MetricsCollector
- `src/transport/` — WebSocket and HTTP server setup
- `src/redis/` — Redis client, pub/sub, presence, room sync
- `src/auth/` — JWT verification
- `src/protocol/` — Message types, serializer, error codes
- `src/monitoring/` — Health, metrics, logger
- `src/types/` — Shared type definitions

## Testing
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- Load tests in `tests/load/`
- Run tests with `npm test` (vitest)

## Docker
- `docker/Dockerfile` — multi-stage production build
- `docker/Dockerfile.dev` — dev with hot reload
- `docker/docker-compose.yml` — full stack (app + Redis)
- Redis in dev: `docker compose -f docker/docker-compose.yml up redis`
