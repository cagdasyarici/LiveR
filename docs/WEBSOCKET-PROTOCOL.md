# LiveRelay WebSocket Protocol

## Connection

Connect via WebSocket with a JWT token:

```
ws://localhost:3001/ws?token=<JWT_TOKEN>
```

On successful connection, you receive a `welcome` message:

```json
{ "type": "welcome", "connectionId": "conn_abc123", "userId": "user-abc" }
```

## Client → Server Messages

### ping (keepalive)
```json
{ "type": "ping" }
```
Server responds with `{ "type": "pong" }`.

### subscribe
```json
{ "type": "subscribe", "room": "room:dashboard-1" }
```
Server responds with `{ "type": "subscribed", "room": "room:dashboard-1" }`.

### unsubscribe
```json
{ "type": "unsubscribe", "room": "room:dashboard-1" }
```
Server responds with `{ "type": "unsubscribed", "room": "room:dashboard-1" }`.

### publish (requires "send" permission)
```json
{
  "type": "publish",
  "room": "room:chat-123",
  "event": "message",
  "data": { "text": "hello" }
}
```

## Server → Client Messages

### welcome
```json
{ "type": "welcome", "connectionId": "conn_abc123", "userId": "user-abc" }
```

### subscribed / unsubscribed
```json
{ "type": "subscribed", "room": "room:dashboard-1" }
{ "type": "unsubscribed", "room": "room:dashboard-1" }
```

### message (incoming)
```json
{
  "type": "message",
  "room": "room:dashboard-1",
  "event": "update",
  "data": { "price": 42.50 },
  "timestamp": 1700000000000
}
```

### pong
```json
{ "type": "pong" }
```

### error
```json
{ "type": "error", "code": "RATE_LIMIT_EXCEEDED", "message": "Too many messages" }
```

### system
```json
{ "type": "system", "event": "shutdown", "data": { "message": "Server restarting" } }
```

## Error Codes

| Code | Description |
|------|-------------|
| AUTH_FAILED | JWT verification failed |
| TOKEN_EXPIRED | JWT token has expired |
| RATE_LIMIT_EXCEEDED | Too many messages in window |
| ROOM_NOT_FOUND | Target room does not exist |
| PERMISSION_DENIED | Missing required permission |
| INVALID_MESSAGE | Message format is invalid |
| CONNECTION_LIMIT | Max connections reached |
| INTERNAL_ERROR | Server-side error |

## Room Types

| Pattern | Description |
|---------|-------------|
| `user:<userId>` | Private channel for a specific user |
| `room:<roomId>` | Shared channel, all subscribers receive |
| `broadcast` | Global channel, all clients (auto-subscribed) |

## Heartbeat

- Server sends `{ "type": "ping" }` every 30 seconds
- Client must respond with `{ "type": "ping" }` within 10 seconds
- Missing 1 heartbeat cycle = disconnected
