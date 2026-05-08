# Sprint 2: Rooms & Messaging — Completed

## Goal
Room subscription system, message routing, and full REST API for sending messages.

## Tasks Completed

### S2-01: RoomManager
- `src/core/RoomManager.ts` — Full room membership tracking
- Methods: subscribe, unsubscribe, removeUserFromAllRooms, getMembers, getMemberCount, getRoomsForUser, getAllRooms, isMember, hasRoom
- Per-user room limit enforcement
- Auto-cleanup of empty rooms

### S2-02: MessageRouter
- `src/core/MessageRouter.ts` — Routes messages to correct recipients
- `sendToTarget(target, event, data)` — Routes to user:* or room:* targets
- `sendToRoom(roomId, event, data)` — Direct room publish via uWS topics
- `broadcast(event, data)` — All clients via 'broadcast' topic
- Returns `RouteResult` with success, delivered count, timestamp

### S2-03: WS Protocol Handler Update
- `src/transport/WebSocketServer.ts` — Now accepts dependency object instead of positional args
- Subscribe/unsubscribe now syncs both uWS topics AND RoomManager
- Disconnect handler calls `roomManager.removeUserFromAllRooms()`

### S2-04–S2-06: REST API Endpoints
- `POST /api/send` — Send to user or room with `{ target, event, data }`
- `POST /api/broadcast` — Broadcast to all with `{ event, data }`
- `POST /api/rooms/:roomId/send` — Send to specific room with `{ event, data }`
- `GET /api/rooms` — List active rooms with member counts
- `GET /api/connections` — Connection statistics

### S2-07: API Key Authentication
- `src/transport/middleware/auth.ts` — `requireApiKey()` middleware
- All REST endpoints (except /health) require `Authorization: Bearer <API_KEY>`

### S2-08: Message Validation
- `src/transport/validation.ts` — Zod schemas for all REST payloads
- sendMessageSchema, broadcastMessageSchema, roomSendMessageSchema
- Invalid payloads return 400 with field-level error details

### S2-09–S2-10: Unit Tests (44 total, all passing)
- `tests/unit/RoomManager.test.ts` — 16 tests
- `tests/unit/MessageRouter.test.ts` — 6 tests
- Previous: ConnectionManager (15) + JwtVerifier (7)

## Files Created/Modified
- **New:** RoomManager.ts, MessageRouter.ts, middleware/auth.ts, validation.ts
- **New tests:** RoomManager.test.ts, MessageRouter.test.ts
- **Modified:** WebSocketServer.ts (dependency injection), HttpServer.ts (full REST API), index.ts (wiring)

## Next: Sprint 3
Redis integration — pub/sub for cross-instance messaging, presence tracking, distributed room state.
