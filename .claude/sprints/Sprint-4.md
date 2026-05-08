# Sprint 4: Production Hardening — Completed

## Goal
Rate limiting, metrics, error handling, and stability improvements.

## Tasks Completed

### S4-01: RateLimiter (Redis-backed sliding window)
- `src/core/RateLimiter.ts` — Sliding window algorithm using Redis sorted sets
- Pipeline-batched: zremrangebyscore (cleanup) → zadd (add) → zcard (count) → pexpire (ttl)
- **Fail-open strategy**: if Redis is down, requests are allowed
- Methods: `checkLimit(identifier)` returns `{ allowed, remaining, limit, resetIn }`
- Separate instances for WS (per userId) and HTTP (per IP)

### S4-02: HTTP Rate Limiting Middleware
- `src/transport/middleware/rateLimit.ts` — `checkHttpRateLimit()` extracts IP from X-Forwarded-For
- Returns 429 Too Many Requests with Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining headers
- Applied to POST /api/send, POST /api/broadcast, POST /api/rooms/:roomId/send

### S4-03–S4-04: Connection & Room Limits
- Connection limit enforced in upgrade handler (503 if over max)
- Double-check in open handler (error frame + close if over)
- Room limit per user enforced via RoomManager (configurable WS_MAX_ROOMS_PER_CONNECTION)

### S4-05–S4-06: MetricsCollector & Prometheus Endpoint
- `src/core/MetricsCollector.ts` — In-memory counters for all key metrics
- Tracks: connections opened/closed, messages received/sent, errors, rate limit hits, uptime
- `GET /api/metrics` — Prometheus text format (text/plain; version=0.0.4)
- Gauges: active connections, active rooms, uptime
- Counters: connections opened/closed total, messages received/sent total, errors total, rate limit hits total

### S4-07–S4-09: Error Handling & Structured Responses
- WS: invalid messages → error frame with INVALID_MESSAGE code
- WS: rate limit exceeded → error frame with RATE_LIMIT_EXCEEDED code
- WS: permission denied → error frame with PERMISSION_DENIED code
- HTTP: invalid JSON → 400 with error message
- HTTP: invalid API key → 401
- HTTP: rate limited → 429 with retry headers
- HTTP: not found → 404
- All errors tracked in MetricsCollector

### S4-08: Reconnection Logic
- Redis client has built-in reconnection via ioredis retryStrategy (exponential backoff, max 5s)
- Rate limiter fail-open means service continues even if Redis is temporarily down

### S4-10: Tests (83 total, all passing)
- `tests/unit/RateLimiter.test.ts` — 7 tests (under/over/at limit, fail-open, key prefix, cleanup)
- `tests/unit/MetricsCollector.test.ts` — 12 tests (all counters, uptime, Prometheus format)
- Previous: 64 tests from Sprint 1-3

## Files Created
- `src/core/RateLimiter.ts`, `src/core/MetricsCollector.ts`
- `src/transport/middleware/rateLimit.ts`
- `tests/unit/RateLimiter.test.ts`, `tests/unit/MetricsCollector.test.ts`

## Files Modified
- `src/transport/WebSocketServer.ts` — Rate limiting on WS messages, metrics tracking on open/message/close
- `src/transport/HttpServer.ts` — Rate limiting on POST endpoints, metrics endpoint, error metrics
- `src/index.ts` — RateLimiter and MetricsCollector initialization and wiring

## Next: Sprint 5
Docker, client SDK, dashboard, load testing, documentation, deployment.
