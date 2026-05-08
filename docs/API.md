# LiveRelay REST API Documentation

## Authentication

All endpoints (except `/api/health` and `/api/metrics`) require an API key:

```
Authorization: Bearer <API_KEY>
```

This is a **server-to-server** API key, not a client JWT token.

---

## Endpoints

### GET /api/health

Health check. No authentication required.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 86400,
  "connections": 1523,
  "rooms": 42,
  "redis": "connected",
  "version": "1.0.0",
  "instanceId": "instance-1"
}
```

Status values: `healthy` (Redis connected), `degraded` (Redis down).

---

### GET /api/metrics

Prometheus-compatible metrics. No authentication required.

**Response (text/plain):**
```
# HELP liverelay_connections_active Current active WebSocket connections
# TYPE liverelay_connections_active gauge
liverelay_connections_active 1523

# HELP liverelay_messages_sent_total Total messages sent to clients
# TYPE liverelay_messages_sent_total counter
liverelay_messages_sent_total 458291
```

---

### POST /api/send

Send a message to a specific user or room.

**Request:**
```json
{
  "target": "user:abc123",
  "event": "notification",
  "data": {
    "title": "New Order",
    "message": "Order #5678 received"
  }
}
```

**Response:**
```json
{
  "success": true,
  "delivered": 2,
  "timestamp": "2026-03-22T10:00:00.000Z"
}
```

Target formats:
- `user:<userId>` — Send to a specific user's connections
- `room:<roomId>` — Send to all subscribers of a room

---

### POST /api/broadcast

Send a message to ALL connected clients.

**Request:**
```json
{
  "event": "system:maintenance",
  "data": {
    "message": "Server restart in 5 minutes"
  }
}
```

**Response:**
```json
{
  "success": true,
  "delivered": 1523,
  "timestamp": "2026-03-22T10:00:00.000Z"
}
```

---

### POST /api/rooms/:roomId/send

Send a message to a specific room.

**Request:**
```json
{
  "event": "price-update",
  "data": { "price": 42.50 }
}
```

**Response:**
```json
{
  "success": true,
  "delivered": 45,
  "timestamp": "2026-03-22T10:00:00.000Z",
  "room": "room:stocks-AAPL"
}
```

---

### GET /api/rooms

List active rooms with member counts. Requires API key.

**Response:**
```json
{
  "rooms": [
    { "id": "room:dashboard-1", "members": 12, "created": "2026-03-22T09:00:00.000Z" },
    { "id": "room:stocks-AAPL", "members": 45, "created": "2026-03-22T08:30:00.000Z" }
  ],
  "total": 2
}
```

---

### GET /api/connections

Connection statistics. Requires API key.

**Response:**
```json
{
  "total": 1523,
  "uniqueUsers": 1200
}
```

---

## Error Responses

### 400 Bad Request
```json
{ "error": "Invalid request body", "details": { "event": ["Required"] } }
```

### 401 Unauthorized
```json
{ "error": "Invalid or missing API key" }
```

### 429 Too Many Requests
```json
{ "error": "Too many requests", "retryAfter": 60 }
```

Headers: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`

### 404 Not Found
```json
{ "error": "Not found" }
```
