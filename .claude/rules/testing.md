---
description: Testing conventions for LiveRelay
globs: ["tests/**/*.ts", "vitest.config.ts"]
---

# Testing Rules

## Framework
- Use vitest for all tests
- Tests mirror source structure: `src/core/ConnectionManager.ts` → `tests/unit/ConnectionManager.test.ts`

## Unit Tests
- Test core logic in isolation (ConnectionManager, RoomManager, MessageRouter, RateLimiter)
- Mock Redis and WebSocket dependencies
- Test edge cases: max connections, rate limit boundaries, invalid messages

## Integration Tests
- Test real WebSocket connections against a running server
- Use `ws` package as client in tests (NOT uWebSockets.js client)
- Test full flows: connect → auth → subscribe → receive → disconnect
- Redis integration tests require a running Redis instance (Docker)

## Load Tests
- Separate directory: `tests/load/`
- Use autocannon for HTTP and custom scripts for WebSocket
- Capture results in `tests/load/results/`
