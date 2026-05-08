---
description: uWebSockets.js specific patterns and gotchas
globs: ["src/transport/**/*.ts", "src/core/**/*.ts"]
---

# uWebSockets.js Rules

## Key Differences from ws/Socket.IO
- WebSocket upgrade is manual — auth happens in the `upgrade` handler
- `ws.getUserData()` returns the data attached during upgrade
- Messages arrive as `ArrayBuffer` — must decode with `Buffer.from(message).toString('utf-8')`
- Use uWS topics for in-process pub/sub (`ws.subscribe()`, `app.publish()`)
- Layer Redis pub/sub on top of uWS topics for cross-instance messaging
- HTTP routes are registered on the same uWS app — no Express needed

## Important Constraints
- Do NOT use `res.end()` after `res.upgrade()` — it will crash
- `res.onAborted()` must be called before any async operation in HTTP handlers
- uWS HttpResponse is NOT a Node.js stream — different API
- WebSocket `close` handler fires even on upgrade rejection
- Topic subscriptions are per-WebSocket, managed by uWS internally

## Performance Patterns
- Avoid JSON.stringify in hot paths — pre-serialize when possible
- Use `ws.send()` with string, not buffer, for text frames
- Batch Redis operations with pipeline when possible
- uWS handles backpressure — check `ws.getBufferedAmount()` before large sends
