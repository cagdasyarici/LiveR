# Sprint 3: Redis Integration — Completed

## Goal
Redis pub/sub for multi-instance support, presence tracking, distributed room state.

## Tasks Completed

### S3-01: Redis Client Setup
- `src/redis/RedisClient.ts` — ioredis factory with reconnection strategy (exponential backoff, max 5s), ready/error/close event logging, `checkRedisHealth()` ping helper
- Three separate Redis instances: main (with keyPrefix), subscriber (no prefix), publisher (no prefix)

### S3-02: RedisPubSub
- `src/redis/RedisPubSub.ts` — Cross-instance message broadcasting
- Publish: `publishToUser()`, `publishToRoom()`, `publishBroadcast()`
- Subscribe: `subscribeForUser()`, `subscribeForRoom()`, auto-subscribe to broadcast
- Message handler forwards Redis messages to local uWS topics or direct user connections
- Pattern: channel:user:{userId}, channel:room:{roomId}, channel:broadcast

### S3-03: Cross-Instance Message Relay
- MessageRouter now publishes to Redis in addition to local uWS topics
- WebSocket publish handler sends to both local uWS topic + Redis channel
- Redis subscriber receives messages and forwards to local clients

### S3-04: RedisPresence
- `src/redis/RedisPresence.ts` — Online/offline tracking with sorted sets
- Methods: setOnline, setOffline, isOnline, getOnlineCount, getOnlineUsers, refreshPresence, cleanStale, removeInstance
- Score = timestamp for stale detection (60s threshold)

### S3-05: RedisRoomSync
- `src/redis/RedisRoomSync.ts` — Distributed room membership via Redis sets
- Bidirectional tracking: room:{roomId}:members ↔ user:{userId}:rooms
- Pipeline-batched operations for add/remove
- Methods: addMember, removeMember, getMembers, getMemberCount, getUserRooms, isMember, removeUserFromAllRooms, cleanEmptyRoom

### S3-06: Health Endpoint Updated
- `/api/health` now pings Redis and reports: connected / disconnected / error / not_configured
- Overall status: "healthy" if Redis connected, "degraded" if not

### S3-07–S3-08: Rooms & Connections Endpoints
- Already built in Sprint 2, now backed by both in-memory + Redis state

### S3-09: Connection Cleanup
- WebSocket close handler now calls: `redisPresence.setOffline()` + `redisRoomSync.removeUserFromAllRooms()`
- Graceful shutdown: closes Redis pub/sub, quits all 3 Redis connections

### S3-10: Unit Tests (64 total, all passing)
- `tests/unit/RedisPresence.test.ts` — 9 tests (mock-based)
- `tests/unit/RedisRoomSync.test.ts` — 11 tests (mock-based)
- Previous: ConnectionManager (15) + RoomManager (16) + MessageRouter (6) + JwtVerifier (7)

## Architecture Decisions
- **3 Redis connections**: main (state/data with keyPrefix), subscriber (pub/sub, no prefix), publisher (pub/sub, no prefix). ioredis requires separate connections for subscribe mode.
- **Optional Redis**: All Redis dependencies are optional (`?` params). Server works without Redis for single-instance dev.
- **Dependency injection**: WebSocketServer and HttpServer accept deps objects, making Redis integration clean and testable.

## Files Created
- `src/redis/RedisClient.ts`, `RedisPubSub.ts`, `RedisPresence.ts`, `RedisRoomSync.ts`
- `tests/unit/RedisPresence.test.ts`, `tests/unit/RedisRoomSync.test.ts`

## Files Modified
- `src/index.ts` — Redis initialization and wiring
- `src/transport/WebSocketServer.ts` — Redis presence/pubsub/roomsync on connect/message/disconnect
- `src/transport/HttpServer.ts` — Async health check with Redis ping
- `src/core/MessageRouter.ts` — Redis pub/sub for cross-instance delivery
- `src/utils/gracefulShutdown.ts` — Redis cleanup on shutdown

## Next: Sprint 4
Production hardening — rate limiting (Redis-backed sliding window), connection limits, metrics collector, error handling.
