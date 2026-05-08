# LiveRelay — Real-time Notification & Messaging Microservice

## Architecture Document v1.0

---

## 0. Project Overview

### What is LiveRelay?
LiveRelay is a self-hosted, lightweight, high-performance real-time notification and messaging microservice built with TypeScript and uWebSockets.js. It provides a plug-and-play WebSocket server that any application can integrate to deliver instant notifications, messages, and live updates to connected clients.

### Why Does It Exist?
- **Pusher/Ably alternative:** Self-hosted, zero recurring cost
- **Socket.IO replacement:** 8-10x better performance with uWebSockets.js
- **TypeScript ecosystem gap:** No production-ready, lightweight, self-hosted real-time server exists in the Node.js/TypeScript ecosystem
- **Portfolio showcase:** Demonstrates WebSocket mastery, Redis pub/sub, horizontal scaling, JWT auth, Docker deployment

### Key Design Principles
1. **Performance First:** uWebSockets.js over Socket.IO — raw speed matters
2. **Horizontally Scalable:** Multiple instances via Redis Pub/Sub — no sticky sessions
3. **Simple Integration:** REST API to send messages, WebSocket to receive — any app can use it
4. **Production-Ready:** Health checks, graceful shutdown, connection limits, rate limiting
5. **Observable:** Metrics endpoint, structured logging, connection tracking

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Web Client   │  │ Mobile Client│  │ Any HTTP Client  │  │
│  │  (JS/TS SDK)  │  │  (SDK)       │  │  (REST API)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │ WSS              │ WSS               │ HTTPS      │
└─────────┼──────────────────┼───────────────────┼────────────┘
          │                  │                   │
┌─────────┼──────────────────┼───────────────────┼────────────┐
│         │        LIVERELAY SERVER               │            │
│  ┌──────┴──────────────────┴─────────┐  ┌──────┴─────────┐ │
│  │      WebSocket Handler            │  │   REST API     │ │
│  │  • Connection Management          │  │  • POST /send  │ │
│  │  • Room/Channel Management        │  │  • POST /broad │ │
│  │  • Heartbeat/Ping-Pong            │  │  • GET /health │ │
│  │  • JWT Authentication             │  │  • GET /metrics│ │
│  │  • Message Routing                │  │  • GET /rooms  │ │
│  └──────────────┬────────────────────┘  └──────┬─────────┘ │
│                 │                               │           │
│  ┌──────────────┴───────────────────────────────┴─────────┐ │
│  │              Core Engine                                │ │
│  │  • ConnectionManager (track all connections)            │ │
│  │  • RoomManager (channel subscriptions)                  │ │
│  │  • MessageRouter (route messages to recipients)         │ │
│  │  • RateLimiter (per-connection rate limiting)            │ │
│  │  • MetricsCollector (connection counts, msg rates)      │ │
│  └──────────────┬─────────────────────────────────────────┘ │
│                 │                                            │
│  ┌──────────────┴─────────────────────────────────────────┐ │
│  │              Redis Layer                                │ │
│  │  • Pub/Sub (cross-instance message broadcasting)        │ │
│  │  • Presence (online users tracking)                     │ │
│  │  • Rate Limit Counters (sliding window)                 │ │
│  │  • Room Membership (distributed room state)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────┐
│  HORIZONTAL SCALING (Multiple Instances)                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │Instance 1│  │Instance 2│  │Instance 3│  ... N instances  │
│  │  :3001   │  │  :3002   │  │  :3003   │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │              │              │                        │
│  ┌────┴──────────────┴──────────────┴──────────────────┐    │
│  │           Redis Pub/Sub (Message Fanout)             │    │
│  │           Redis Cluster (State Store)                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js 20+ LTS | Async I/O, ecosystem |
| Language | TypeScript 5.x (strict mode) | Type safety, better DX |
| WebSocket Server | uWebSockets.js | 8-10x faster than Socket.IO, C++ core |
| HTTP API | uWebSockets.js (built-in HTTP) | Same process, no Express overhead |
| Pub/Sub & State | Redis 7+ | Cross-instance communication, presence |
| Redis Client | ioredis | Cluster support, Lua scripting, reconnection |
| Auth | jsonwebtoken (jose) | JWT verification, lightweight |
| Logging | pino | Fastest structured JSON logger |
| Validation | zod | Runtime type validation, TS inference |
| Testing | vitest | Fast, TS-native, good DX |
| Load Testing | autocannon + custom WS script | HTTP + WebSocket benchmarks |
| Containerization | Docker + Docker Compose | Reproducible deployment |
| Process Manager | Node.js cluster module | Multi-core utilization |

### Why NOT Socket.IO?
- Socket.IO adds ~40KB overhead per connection
- Fallback mechanisms (polling) we don't need
- Custom protocol on top of WebSocket = extra parsing
- uWS handles 100K+ concurrent connections on modest hardware
- Socket.IO: ~15K msg/sec, uWS: ~150K msg/sec (10x difference)

---

## 3. Project Structure

```
liverelay/
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions: lint, test, build
├── src/
│   ├── config/
│   │   ├── index.ts                  # Environment config loader (zod validated)
│   │   └── constants.ts              # Magic numbers, defaults
│   │
│   ├── core/
│   │   ├── ConnectionManager.ts      # Track WebSocket connections per user
│   │   ├── RoomManager.ts            # Channel/room subscription management
│   │   ├── MessageRouter.ts          # Route messages to correct connections
│   │   ├── RateLimiter.ts            # Per-connection sliding window rate limit
│   │   └── MetricsCollector.ts       # In-memory metrics (connections, msg/sec)
│   │
│   ├── transport/
│   │   ├── WebSocketServer.ts        # uWS WebSocket setup, upgrade, handlers
│   │   ├── HttpServer.ts             # uWS HTTP routes (REST API)
│   │   └── middleware/
│   │       ├── auth.ts               # JWT verification on WS upgrade
│   │       └── rateLimit.ts          # HTTP rate limiting middleware
│   │
│   ├── redis/
│   │   ├── RedisClient.ts            # ioredis connection manager
│   │   ├── RedisPubSub.ts            # Pub/Sub for cross-instance messaging
│   │   ├── RedisPresence.ts          # Online/offline user tracking
│   │   └── RedisRoomSync.ts          # Distributed room membership
│   │
│   ├── auth/
│   │   ├── JwtVerifier.ts            # JWT token verification
│   │   └── types.ts                  # Auth payload types
│   │
│   ├── protocol/
│   │   ├── messages.ts               # Message type definitions (zod schemas)
│   │   ├── serializer.ts             # JSON serialization/deserialization
│   │   └── errors.ts                 # Error code definitions
│   │
│   ├── monitoring/
│   │   ├── healthCheck.ts            # /health endpoint logic
│   │   ├── metrics.ts                # /metrics endpoint (Prometheus-compatible)
│   │   └── logger.ts                 # Pino logger setup
│   │
│   ├── cluster/
│   │   └── master.ts                 # Node.js cluster fork manager
│   │
│   ├── types/
│   │   ├── connection.ts             # Connection, User, Room types
│   │   ├── events.ts                 # Event type definitions
│   │   └── config.ts                 # Config type definitions
│   │
│   ├── utils/
│   │   ├── idGenerator.ts            # Unique ID generation (nanoid)
│   │   └── gracefulShutdown.ts       # Clean shutdown handler
│   │
│   └── index.ts                      # Entry point: bootstrap server
│
├── client/                           # JavaScript client SDK
│   ├── src/
│   │   ├── LiveRelayClient.ts        # Client SDK for browsers/Node.js
│   │   ├── types.ts                  # Client-side types
│   │   └── index.ts                  # SDK entry point
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/                        # Simple monitoring dashboard
│   └── index.html                    # Single-page dashboard (vanilla JS)
│
├── tests/
│   ├── unit/
│   │   ├── ConnectionManager.test.ts
│   │   ├── RoomManager.test.ts
│   │   ├── MessageRouter.test.ts
│   │   └── RateLimiter.test.ts
│   ├── integration/
│   │   ├── websocket.test.ts         # WS connection, auth, messaging
│   │   ├── redis-pubsub.test.ts      # Multi-instance message relay
│   │   └── rest-api.test.ts          # HTTP API tests
│   └── load/
│       ├── ws-load-test.ts           # WebSocket load test script
│       └── results/                  # Load test result snapshots
│
├── docker/
│   ├── Dockerfile                    # Multi-stage production build
│   ├── Dockerfile.dev                # Development with hot reload
│   └── docker-compose.yml            # Full stack: app + Redis
│
├── docs/
│   ├── API.md                        # REST API documentation
│   ├── WEBSOCKET-PROTOCOL.md         # WebSocket message protocol
│   ├── DEPLOYMENT.md                 # VPS deployment guide
│   └── SCALING.md                    # Horizontal scaling guide
│
├── scripts/
│   ├── generate-jwt.ts               # Helper: generate test JWT tokens
│   └── benchmark.ts                  # Quick benchmark runner
│
├── .env.example                      # Environment variables template
├── .eslintrc.json                    # ESLint config
├── .prettierrc                       # Prettier config
├── tsconfig.json                     # TypeScript config (strict)
├── vitest.config.ts                  # Test config
├── package.json
└── README.md                         # Project documentation
```

---

## 4. Core Concepts

### 4.1 Connection Lifecycle

```
Client                          Server
  │                                │
  ├─── WS Upgrade Request ────────►│ 1. Extract JWT from query/header
  │    (wss://host?token=JWT)      │ 2. Verify JWT signature & expiry
  │                                │ 3. Extract userId from payload
  │◄── 101 Switching Protocols ────│ 4. Create Connection object
  │                                │ 5. Add to ConnectionManager
  │                                │ 6. Publish presence:online to Redis
  │                                │ 7. Send welcome message
  │                                │
  │◄── ping ───────────────────────│ 8. Server sends ping every 30s
  ├─── pong ──────────────────────►│ 9. Client responds with pong
  │                                │    (miss 3 pings = disconnect)
  │                                │
  ├─── subscribe:{room} ─────────►│ 10. Join room/channel
  │◄── subscribed:{room} ─────────│ 11. Confirm subscription
  │                                │
  │◄── message ────────────────────│ 12. Receive messages
  │                                │
  ├─── close ─────────────────────►│ 13. Client disconnects
  │                                │ 14. Remove from ConnectionManager
  │                                │ 15. Clean up room subscriptions
  │                                │ 16. Publish presence:offline to Redis
  │                                │
```

### 4.2 Message Flow (Cross-Instance)

```
Producer App                Instance 1              Redis              Instance 2           Client B
    │                          │                      │                    │                    │
    ├── POST /api/send ───────►│                      │                    │                    │
    │   {userId, event, data}  │                      │                    │                    │
    │                          ├── PUBLISH ──────────►│                    │                    │
    │                          │   channel:user:{id}  │                    │                    │
    │                          │                      ├── SUBSCRIBE ──────►│                    │
    │                          │                      │   channel:user:{id}│                    │
    │                          │                      │                    ├── WS Send ────────►│
    │                          │                      │                    │   {event, data}    │
    │◄── 200 OK ───────────────│                      │                    │                    │
```

### 4.3 Room/Channel System

```
Rooms are named channels that clients can subscribe to.

Types:
  • user:{userId}     — Private channel, only that user receives messages
  • room:{roomId}     — Shared channel, all subscribers receive messages  
  • broadcast         — Global channel, ALL connected clients receive

Examples:
  • user:abc123       — Notifications for user abc123
  • room:dashboard-1  — Live updates for a specific dashboard
  • room:order-5678   — Real-time order status updates
  • broadcast         — System-wide announcements

Room membership is tracked in Redis (sorted sets) for cross-instance consistency.
```

### 4.4 Authentication Flow

```
1. External app generates JWT with userId claim:
   {
     "sub": "user-abc-123",        // userId (required)
     "rooms": ["room:dashboard"],   // auto-join rooms (optional)
     "permissions": ["send", "subscribe"],  // permissions (optional)
     "exp": 1700000000              // expiry (required)
   }

2. Client connects with JWT:
   new WebSocket("wss://liverelay.example.com?token=eyJhbG...")

3. Server verifies JWT on upgrade:
   - Check signature against shared secret or public key
   - Check expiry
   - Extract userId and permissions
   - Reject with 401 if invalid

4. No session storage — JWT is stateless auth
```

---

## 5. REST API Specification

### Authentication
All REST endpoints require an API key in the `Authorization` header:
```
Authorization: Bearer <API_KEY>
```
This is a separate server-to-server API key, NOT the client JWT.

### Endpoints

#### POST /api/send
Send a message to a specific user or room.
```json
// Request
{
  "target": "user:abc123",           // or "room:dashboard-1"
  "event": "notification",
  "data": {
    "title": "New Order",
    "message": "Order #5678 received"
  }
}

// Response: 200 OK
{
  "success": true,
  "delivered": 2,                    // number of connections that received it
  "timestamp": "2026-03-22T10:00:00Z"
}
```

#### POST /api/broadcast
Send a message to ALL connected clients.
```json
// Request
{
  "event": "system:maintenance",
  "data": {
    "message": "Server restart in 5 minutes"
  }
}

// Response: 200 OK
{
  "success": true,
  "delivered": 1523,
  "timestamp": "2026-03-22T10:00:00Z"
}
```

#### POST /api/rooms/{roomId}/send
Send a message to a specific room.
```json
// Request
{
  "event": "update",
  "data": { "price": 42.50 }
}

// Response: 200 OK
{
  "success": true,
  "delivered": 45,
  "room": "room:stocks-AAPL"
}
```

#### GET /api/health
Health check endpoint.
```json
{
  "status": "healthy",
  "uptime": 86400,
  "connections": 1523,
  "rooms": 42,
  "redis": "connected",
  "version": "1.0.0"
}
```

#### GET /api/metrics
Prometheus-compatible metrics.
```
# HELP liverelay_connections_total Total active WebSocket connections
# TYPE liverelay_connections_total gauge
liverelay_connections_total 1523

# HELP liverelay_messages_sent_total Total messages sent
# TYPE liverelay_messages_sent_total counter
liverelay_messages_sent_total 458291

# HELP liverelay_rooms_total Total active rooms
# TYPE liverelay_rooms_total gauge
liverelay_rooms_total 42
```

#### GET /api/rooms
List active rooms with member counts.
```json
{
  "rooms": [
    { "id": "room:dashboard-1", "members": 12, "created": "2026-03-22T09:00:00Z" },
    { "id": "room:stocks-AAPL", "members": 45, "created": "2026-03-22T08:30:00Z" }
  ],
  "total": 42
}
```

#### GET /api/connections
List connection statistics.
```json
{
  "total": 1523,
  "authenticated": 1520,
  "anonymous": 3,
  "byInstance": {
    "instance-1": 512,
    "instance-2": 508,
    "instance-3": 503
  }
}
```

---

## 6. WebSocket Protocol

### Client → Server Messages

```typescript
// Subscribe to a room/channel
{ "type": "subscribe", "room": "room:dashboard-1" }

// Unsubscribe from a room/channel
{ "type": "unsubscribe", "room": "room:dashboard-1" }

// Ping (keepalive)
{ "type": "ping" }

// Send message to room (if permitted)
{ "type": "publish", "room": "room:chat-123", "event": "message", "data": { "text": "hello" } }
```

### Server → Client Messages

```typescript
// Welcome (on successful connection)
{ "type": "welcome", "connectionId": "conn_abc123", "userId": "user-abc-123" }

// Subscription confirmed
{ "type": "subscribed", "room": "room:dashboard-1" }

// Unsubscription confirmed
{ "type": "unsubscribed", "room": "room:dashboard-1" }

// Incoming message
{ "type": "message", "room": "room:dashboard-1", "event": "update", "data": { ... }, "timestamp": 1700000000 }

// Pong response
{ "type": "pong" }

// Error
{ "type": "error", "code": "RATE_LIMIT_EXCEEDED", "message": "Too many messages" }

// System notification
{ "type": "system", "event": "maintenance", "data": { "message": "..." } }
```

### Error Codes
```typescript
enum ErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  INVALID_MESSAGE = "INVALID_MESSAGE",
  CONNECTION_LIMIT = "CONNECTION_LIMIT",
  INTERNAL_ERROR = "INTERNAL_ERROR"
}
```

---

## 7. Redis Data Structures

### Presence Tracking
```
# Online users (sorted set, score = last_seen timestamp)
ZADD presence:online <timestamp> <userId>

# Remove stale users (older than 60s)
ZRANGEBYSCORE presence:online -inf <now - 60>

# Check if user is online
ZSCORE presence:online <userId>

# Count online users
ZCARD presence:online
```

### Room Membership
```
# Room members (set)
SADD room:{roomId}:members <userId>
SREM room:{roomId}:members <userId>
SMEMBERS room:{roomId}:members
SCARD room:{roomId}:members

# User's rooms (set)
SADD user:{userId}:rooms <roomId>
SREM user:{userId}:rooms <roomId>
SMEMBERS user:{userId}:rooms
```

### Connection Tracking (per instance)
```
# Instance connections (hash: connectionId → userId)
HSET instance:{instanceId}:connections <connectionId> <userId>
HDEL instance:{instanceId}:connections <connectionId>

# User connections across all instances (set)
SADD user:{userId}:connections <instanceId>:<connectionId>
SREM user:{userId}:connections <instanceId>:<connectionId>
```

### Pub/Sub Channels
```
# Per-user channel
PUBLISH channel:user:{userId} <message_json>
SUBSCRIBE channel:user:{userId}

# Per-room channel
PUBLISH channel:room:{roomId} <message_json>
SUBSCRIBE channel:room:{roomId}

# Broadcast channel
PUBLISH channel:broadcast <message_json>
SUBSCRIBE channel:broadcast
```

### Rate Limiting (Sliding Window)
```
# Rate limit key (sorted set with timestamp scores)
ZADD ratelimit:{userId} <timestamp> <requestId>
ZREMRANGEBYSCORE ratelimit:{userId} -inf <now - window>
ZCARD ratelimit:{userId}
EXPIRE ratelimit:{userId} <window>
```

---

## 8. Configuration

```env
# .env.example

# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
INSTANCE_ID=instance-1

# WebSocket
WS_PATH=/ws
WS_MAX_PAYLOAD_SIZE=65536          # 64KB max message size
WS_HEARTBEAT_INTERVAL=30000        # 30s ping interval
WS_HEARTBEAT_TIMEOUT=10000         # 10s pong timeout
WS_MAX_CONNECTIONS=10000            # Max connections per instance
WS_MAX_ROOMS_PER_CONNECTION=50      # Max room subscriptions per client

# Auth
JWT_SECRET=your-secret-key-here     # For HMAC-SHA256
JWT_PUBLIC_KEY=                      # For RS256 (optional, file path)
JWT_ALGORITHM=HS256                  # HS256 or RS256
API_KEY=your-server-api-key          # Server-to-server API key

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=liverelay:

# Rate Limiting
RATE_LIMIT_WINDOW=60000             # 1 minute window
RATE_LIMIT_MAX_MESSAGES=100         # Max messages per window (WS)
RATE_LIMIT_MAX_REQUESTS=60          # Max requests per window (HTTP)

# Logging
LOG_LEVEL=info                       # debug, info, warn, error
LOG_FORMAT=json                      # json or pretty

# Metrics
METRICS_ENABLED=true
METRICS_PATH=/api/metrics

# Cluster
CLUSTER_ENABLED=false
CLUSTER_WORKERS=0                    # 0 = number of CPU cores
```

---

## 9. Docker Setup

### Dockerfile (Multi-stage Production)
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S liverelay && \
    adduser -S liverelay -u 1001
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
USER liverelay
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "dist/index.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  liverelay:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - INSTANCE_ID=instance-1
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}
      - API_KEY=${API_KEY:-dev-api-key-change-in-production}
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - liverelay-network

  # Second instance for demonstrating horizontal scaling
  liverelay-2:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3002:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - INSTANCE_ID=instance-2
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}
      - API_KEY=${API_KEY:-dev-api-key-change-in-production}
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - liverelay-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
    networks:
      - liverelay-network

  # Simple monitoring dashboard (optional)
  dashboard:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./dashboard:/usr/share/nginx/html:ro
    depends_on:
      - liverelay
    networks:
      - liverelay-network

volumes:
  redis-data:

networks:
  liverelay-network:
    driver: bridge
```

---

## 10. Client SDK Design

```typescript
// LiveRelayClient — Browser & Node.js compatible

class LiveRelayClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;        // starts at 1s, exponential backoff
  private heartbeatTimer: Timer | null = null;
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(private config: {
    url: string;                         // wss://liverelay.example.com
    token: string;                       // JWT token
    autoReconnect?: boolean;             // default: true
    maxReconnectAttempts?: number;        // default: 10
  }) {}

  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Rooms
  subscribe(room: string): void;
  unsubscribe(room: string): void;

  // Events
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  once(event: string, handler: Function): void;

  // Built-in events:
  // 'connected'     — WebSocket connected + welcome received
  // 'disconnected'  — WebSocket closed
  // 'reconnecting'  — Attempting reconnection
  // 'error'         — Error received
  // 'message'       — Any message from any subscribed room
  // '{event_name}'  — Specific event from server

  // Send (if permitted)
  publish(room: string, event: string, data: any): void;
}

// Usage:
const client = new LiveRelayClient({
  url: 'wss://liverelay.example.com/ws',
  token: 'eyJhbG...'
});

client.on('connected', () => {
  client.subscribe('room:dashboard-1');
});

client.on('notification', (data) => {
  console.log('New notification:', data);
});

client.on('price-update', (data) => {
  console.log('Price changed:', data.price);
});

await client.connect();
```

---

## 11. Sprint Plan

### Sprint 1: Core Foundation (Day 1-3)
**Goal:** Basic WebSocket server that accepts connections, authenticates, and sends/receives messages.

| Task | Description | Priority |
|------|------------|----------|
| S1-01 | Project setup: package.json, tsconfig.json (strict), eslint, prettier | P0 |
| S1-02 | Config module: zod-validated env config loader | P0 |
| S1-03 | Logger setup: pino with structured JSON logging | P0 |
| S1-04 | uWebSockets.js server: basic HTTP + WS setup | P0 |
| S1-05 | JWT verification: auth middleware for WS upgrade | P0 |
| S1-06 | ConnectionManager: Map-based connection tracking (userId → connections) | P0 |
| S1-07 | Welcome message on successful connection | P0 |
| S1-08 | Heartbeat: server ping, client pong, timeout detection | P0 |
| S1-09 | Graceful shutdown handler | P1 |
| S1-10 | Unit tests: ConnectionManager, JWT verifier | P1 |

**Deliverable:** A server you can connect to with wscat, authenticate with JWT, and receive a welcome message.

### Sprint 2: Rooms & Messaging (Day 3-5)
**Goal:** Room subscription system and message routing.

| Task | Description | Priority |
|------|------------|----------|
| S2-01 | RoomManager: subscribe/unsubscribe/getMembers | P0 |
| S2-02 | MessageRouter: route message to room members or specific user | P0 |
| S2-03 | WS protocol handler: parse client messages, dispatch to router | P0 |
| S2-04 | REST API: POST /api/send (send to user) | P0 |
| S2-05 | REST API: POST /api/rooms/{id}/send (send to room) | P0 |
| S2-06 | REST API: POST /api/broadcast (send to all) | P0 |
| S2-07 | API key authentication for REST endpoints | P0 |
| S2-08 | Message validation: zod schemas for all message types | P1 |
| S2-09 | Unit tests: RoomManager, MessageRouter | P1 |
| S2-10 | Integration test: connect → subscribe → receive message flow | P1 |

**Deliverable:** Send a message via REST API, receive it on a subscribed WebSocket client.

### Sprint 3: Redis Integration (Day 5-7)
**Goal:** Redis pub/sub for multi-instance support, presence tracking.

| Task | Description | Priority |
|------|------------|----------|
| S3-01 | Redis client setup: ioredis with reconnection logic | P0 |
| S3-02 | RedisPubSub: publish messages to Redis, subscribe to channels | P0 |
| S3-03 | Cross-instance message relay: Instance A → Redis → Instance B | P0 |
| S3-04 | RedisPresence: online/offline tracking with sorted sets | P0 |
| S3-05 | RedisRoomSync: distributed room membership | P0 |
| S3-06 | REST API: GET /api/health (includes Redis status) | P0 |
| S3-07 | REST API: GET /api/rooms (list active rooms from Redis) | P1 |
| S3-08 | REST API: GET /api/connections (connection stats) | P1 |
| S3-09 | Integration test: multi-instance message relay | P1 |
| S3-10 | Connection cleanup on disconnect (Redis state) | P0 |

**Deliverable:** Two instances running, message sent to Instance 1 is received by client on Instance 2.

### Sprint 4: Production Hardening (Day 7-8)
**Goal:** Rate limiting, metrics, error handling, stability.

| Task | Description | Priority |
|------|------------|----------|
| S4-01 | RateLimiter: sliding window per connection (Redis-backed) | P0 |
| S4-02 | Rate limiting for HTTP API endpoints | P0 |
| S4-03 | Connection limits: max connections per instance | P0 |
| S4-04 | Max rooms per connection limit | P1 |
| S4-05 | MetricsCollector: connection count, msg/sec, room count | P0 |
| S4-06 | REST API: GET /api/metrics (Prometheus format) | P0 |
| S4-07 | Error handling: invalid messages, connection errors, Redis failures | P0 |
| S4-08 | Reconnection logic: Redis reconnect, backoff strategy | P1 |
| S4-09 | Structured error responses for all error cases | P1 |
| S4-10 | Full integration test suite | P1 |

**Deliverable:** Production-hardened server with rate limiting, metrics, and proper error handling.

### Sprint 5: Docker, Dashboard & Documentation (Day 8-10)
**Goal:** Containerization, monitoring dashboard, load testing, comprehensive docs.

| Task | Description | Priority |
|------|------------|----------|
| S5-01 | Dockerfile: multi-stage build (builder → production) | P0 |
| S5-02 | Dockerfile.dev: development with ts-node/tsx hot reload | P0 |
| S5-03 | docker-compose.yml: app + Redis + scaling demo | P0 |
| S5-04 | Client SDK: LiveRelayClient class with reconnection | P0 |
| S5-05 | Dashboard: single HTML page showing live metrics | P1 |
| S5-06 | Load test script: WebSocket connection + message throughput | P0 |
| S5-07 | Run load tests, capture results and screenshots | P0 |
| S5-08 | README.md: overview, quick start, architecture, API docs | P0 |
| S5-09 | API.md: detailed REST API documentation | P1 |
| S5-10 | WEBSOCKET-PROTOCOL.md: client protocol documentation | P1 |
| S5-11 | Deploy to VPS, verify production Docker setup | P0 |

**Deliverable:** Fully containerized project with docs, dashboard, load test results, and VPS deployment.

---

## 12. Key Implementation Notes

### uWebSockets.js Specifics
```typescript
// uWS has a different API than ws/socket.io — key differences:

// 1. The WebSocket upgrade is manual
app.ws('/ws', {
  upgrade: (res, req, context) => {
    // Extract JWT here, verify, then upgrade
    const token = req.getQuery('token');
    // ... verify JWT ...
    res.upgrade(
      { userId: decodedToken.sub },  // userData attached to ws
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'),
      context
    );
  },
  open: (ws) => {
    // ws.getUserData() returns { userId } from upgrade
    const { userId } = ws.getUserData();
    connectionManager.add(userId, ws);
  },
  message: (ws, message, isBinary) => {
    // message is ArrayBuffer, need to decode
    const text = Buffer.from(message).toString('utf-8');
    const parsed = JSON.parse(text);
    messageRouter.handle(ws, parsed);
  },
  close: (ws, code, message) => {
    connectionManager.remove(ws);
  }
});

// 2. uWS uses topics for pub/sub (in-process)
ws.subscribe('room:dashboard-1');     // subscribe to topic
app.publish('room:dashboard-1', msg); // publish to all subscribers

// 3. For cross-instance, we layer Redis pub/sub on top of uWS topics
```

### Redis Pub/Sub Pattern
```typescript
// Each instance subscribes to relevant Redis channels
// When a message arrives via Redis, it's forwarded to local uWS topics

class RedisPubSub {
  private subscriber: Redis;
  private publisher: Redis;

  async publishToUser(userId: string, message: string) {
    await this.publisher.publish(`channel:user:${userId}`, message);
  }

  async publishToRoom(roomId: string, message: string) {
    await this.publisher.publish(`channel:room:${roomId}`, message);
  }

  // On message received from Redis, forward to local uWS
  private handleRedisMessage(channel: string, message: string) {
    if (channel.startsWith('channel:room:')) {
      const roomId = channel.replace('channel:', '');
      this.app.publish(roomId, message);  // uWS local broadcast
    } else if (channel.startsWith('channel:user:')) {
      const userId = channel.split(':')[2];
      this.connectionManager.sendToUser(userId, message);
    }
  }
}
```

### Graceful Shutdown
```typescript
// Critical for zero-downtime deployments

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  
  // 1. Stop accepting new connections
  server.close();
  
  // 2. Notify connected clients
  connectionManager.broadcastAll({
    type: 'system',
    event: 'shutdown',
    data: { message: 'Server restarting, please reconnect' }
  });
  
  // 3. Wait for in-flight messages (max 5s)
  await sleep(5000);
  
  // 4. Close all WebSocket connections
  connectionManager.closeAll(1001, 'Server shutdown');
  
  // 5. Clean up Redis state for this instance
  await redisPresence.removeInstance(instanceId);
  
  // 6. Close Redis connections
  await redis.quit();
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## 13. Performance Targets

| Metric | Target | How to Verify |
|--------|--------|--------------|
| Concurrent Connections | 10,000+ per instance | Load test with autocannon |
| Message Throughput | 50,000+ msg/sec per instance | WebSocket load test |
| Message Latency (p50) | < 5ms (same instance) | Load test measurement |
| Message Latency (p95) | < 20ms (cross-instance via Redis) | Load test measurement |
| Memory per Connection | < 10KB | Process memory / connection count |
| Connection Setup Time | < 50ms (including JWT verify) | Load test measurement |
| Reconnection Time | < 3s (with exponential backoff) | Client SDK test |

---

## 14. Future Integration Points

### With EventForge (Project 2)
```
EventForge processes an event → calls LiveRelay REST API → 
client receives real-time notification

Example:
  1. Kafka consumer processes "order.completed" event
  2. Consumer calls POST /api/send { target: "user:abc", event: "order-complete", data: {...} }
  3. User's browser receives the notification instantly
```

### With AgentHub (Project 3)
```
AI Agent updates status → LiveRelay broadcasts to user's dashboard

Example:
  1. Agent completes a task
  2. Orchestrator calls POST /api/rooms/agent-session-123/send
  3. User sees real-time agent progress in their browser
```

---

## 15. README Structure (for GitHub)

```markdown
# 🔴 LiveRelay

> High-performance, self-hosted real-time messaging microservice

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## Features
- ⚡ uWebSockets.js — 10x faster than Socket.IO
- 🔄 Horizontal Scaling — Redis pub/sub, no sticky sessions
- 🔐 JWT Authentication — Stateless, secure
- 📡 REST API — Send messages from any backend
- 📊 Metrics — Prometheus-compatible endpoint
- 🐳 Docker Ready — One command deployment

## Quick Start
  docker compose up

## Architecture
  [diagram]

## API Documentation
  [link to API.md]

## Performance
  [load test results with charts]

## Tech Stack
  [badges]
```

---

## 16. Definition of Done

LiveRelay is "done" when:
- [ ] Server accepts WebSocket connections with JWT auth
- [ ] Clients can subscribe/unsubscribe to rooms
- [ ] Messages are routed correctly (user-specific, room, broadcast)
- [ ] Two instances relay messages through Redis pub/sub
- [ ] REST API works for sending messages from external apps
- [ ] Rate limiting is functional (WS and HTTP)
- [ ] Health check and metrics endpoints work
- [ ] Client SDK connects, reconnects, and receives messages
- [ ] Docker Compose starts everything with one command
- [ ] Load test results show 10K+ connections, 50K+ msg/sec
- [ ] README with architecture diagram, quick start, and API docs
- [ ] Dashboard shows live metrics
- [ ] Deployed and running on VPS
