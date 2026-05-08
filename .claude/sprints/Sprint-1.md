# Sprint 1: Core Foundation — Completed

## Goal
Basic WebSocket server that accepts connections, authenticates via JWT, and sends/receives messages with heartbeat support.

## Tasks Completed

### S1-01: Project Setup
- `package.json` with all dependencies (uWebSockets.js, zod, pino, jsonwebtoken, nanoid, ioredis, vitest, tsx, eslint, prettier)
- `tsconfig.json` with strict mode enabled
- `.eslintrc.json` with TypeScript-specific rules (no-any, no-floating-promises, explicit-return-type)
- `.prettierrc` with consistent formatting rules
- `.gitignore` for node_modules, dist, .env, logs

### S1-02: Config Module
- `src/config/index.ts` — Zod-validated env config loader with type-safe `Config` export
- `src/config/constants.ts` — All default values centralized
- `.env.example` — Template for all environment variables

### S1-03: Logger
- `src/monitoring/logger.ts` — Pino logger with JSON (production) and pretty (development) modes
- `initLogger()` function to re-initialize after config loads

### S1-04: uWebSockets.js Server
- `src/transport/WebSocketServer.ts` — Full WS upgrade with JWT extraction from query params, open/message/close handlers, auto-subscribe to user channel + broadcast
- `src/transport/HttpServer.ts` — REST routes: GET /api/health, GET /api/connections (API key protected), 404 catch-all
- `src/index.ts` — Entry point that bootstraps everything

### S1-05: JWT Verification
- `src/auth/JwtVerifier.ts` — Supports HS256 and RS256, extracts userId/rooms/permissions from JWT payload
- `src/auth/types.ts` — JwtPayload and AuthResult interfaces

### S1-06: ConnectionManager
- `src/core/ConnectionManager.ts` — Map-based tracking with userId→Set<ws> and connectionId→ws
- Methods: add, remove, getByConnectionId, getByUserId, sendToUser, sendToConnection, broadcastAll, closeAll, isUserOnline, getStats

### S1-07: Welcome Message
- Sent automatically on successful WS connection with `connectionId` and `userId`

### S1-08: Heartbeat
- `src/core/Heartbeat.ts` — Server pings every 30s (configurable), disconnects clients that don't respond within timeout (10s default)
- Client `ping` message updates `lastPong` timestamp, server responds with `pong`

### S1-09: Graceful Shutdown
- `src/utils/gracefulShutdown.ts` — Handles SIGTERM/SIGINT, notifies clients, waits for in-flight messages, closes all connections
- `src/utils/idGenerator.ts` — nanoid-based connection/instance ID generation

### S1-10: Unit Tests (22 tests, all passing)
- `tests/unit/ConnectionManager.test.ts` — 15 tests covering add, remove, lookup, send, broadcast, stats, limits
- `tests/unit/JwtVerifier.test.ts` — 7 tests covering valid tokens, expired, invalid signature, missing sub, malformed

## Type Definitions Created
- `src/types/connection.ts` — UserData, LiveRelayWebSocket, ConnectionInfo, ConnectionStats
- `src/types/events.ts` — SendEventPayload, BroadcastEventPayload, RoomSendPayload
- `src/types/config.ts` — Re-exports Config type
- `src/protocol/messages.ts` — Zod schemas for client messages, TypeScript types for server messages
- `src/protocol/serializer.ts` — JSON serialize/deserialize with zod validation
- `src/protocol/errors.ts` — ErrorCode enum and createError helper
- `src/monitoring/healthCheck.ts` — Health status interface and getter

## How to Run
```bash
# Install dependencies
npm install

# Start dev server (requires JWT_SECRET and API_KEY env vars)
JWT_SECRET=dev-secret API_KEY=dev-key npm run dev

# Run tests
npm test
```

## Deliverable
A server you can connect to with any WebSocket client, authenticate with JWT, and receive a welcome message. Health endpoint at GET /api/health.

## Next: Sprint 2
Room subscription system, message routing, and full REST API for sending messages.
