import type { TemplatedApp, HttpResponse, HttpRequest, WebSocket } from 'uWebSockets.js';
import type { UserData } from '../types/connection.js';
import type { ConnectionManager } from '../core/ConnectionManager.js';
import type { RoomManager } from '../core/RoomManager.js';
import type { RateLimiter } from '../core/RateLimiter.js';
import type { MetricsCollector } from '../core/MetricsCollector.js';
import type { JwtVerifier } from '../auth/JwtVerifier.js';
import type { RedisPubSub } from '../redis/RedisPubSub.js';
import type { RedisPresence } from '../redis/RedisPresence.js';
import type { RedisRoomSync } from '../redis/RedisRoomSync.js';
import type { Config } from '../config/index.js';
import { generateConnectionId } from '../utils/idGenerator.js';
import { deserialize, serialize } from '../protocol/serializer.js';
import { createError, ErrorCode } from '../protocol/errors.js';
import { logger } from '../monitoring/logger.js';

export interface WebSocketDependencies {
  app: TemplatedApp;
  config: Config;
  connectionManager: ConnectionManager;
  roomManager: RoomManager;
  jwtVerifier: JwtVerifier;
  rateLimiter?: RateLimiter;
  metrics?: MetricsCollector;
  redisPubSub?: RedisPubSub;
  redisPresence?: RedisPresence;
  redisRoomSync?: RedisRoomSync;
}

export function setupWebSocket(deps: WebSocketDependencies): void {
  const {
    app,
    config,
    connectionManager,
    roomManager,
    jwtVerifier,
    rateLimiter,
    metrics,
    redisPubSub,
    redisPresence,
    redisRoomSync,
  } = deps;

  app.ws<UserData>(config.wsPath, {
    maxPayloadLength: config.wsMaxPayloadSize,
    idleTimeout: 0,

    upgrade: (res: HttpResponse, req: HttpRequest, context) => {
      const query = req.getQuery();
      const params = new URLSearchParams(query);
      const token = params.get('token');

      let aborted = false;
      res.onAborted(() => {
        aborted = true;
      });

      if (!token) {
        if (!aborted) {
          res.writeStatus('401 Unauthorized').end('Missing token');
        }
        return;
      }

      const authResult = jwtVerifier.verify(token);
      if (!authResult) {
        if (!aborted) {
          res.writeStatus('401 Unauthorized').end('Invalid token');
        }
        return;
      }

      if (connectionManager.size >= config.wsMaxConnections) {
        if (!aborted) {
          res.writeStatus('503 Service Unavailable').end('Connection limit reached');
        }
        return;
      }

      const connectionId = generateConnectionId();
      const userData: UserData = {
        userId: authResult.userId,
        connectionId,
        rooms: [...authResult.rooms],
        permissions: authResult.permissions,
        connectedAt: Date.now(),
        lastPong: Date.now(),
      };

      if (!aborted) {
        res.upgrade(
          userData,
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context,
        );
      }
    },

    open: (ws: WebSocket<UserData>) => {
      const data = ws.getUserData();
      const added = connectionManager.add(ws);

      if (!added) {
        ws.send(
          serialize(createError(ErrorCode.CONNECTION_LIMIT, 'Connection limit reached')),
          false,
        );
        ws.end(1013, 'Connection limit reached');
        return;
      }

      metrics?.incrementConnectionsOpened();

      // Auto-subscribe to user's private channel (uWS topic)
      ws.subscribe(`user:${data.userId}`);

      // Auto-subscribe to rooms from JWT (both uWS topic + RoomManager)
      for (const room of data.rooms) {
        ws.subscribe(room);
        roomManager.subscribe(data.userId, room);
      }

      // Subscribe to broadcast channel
      ws.subscribe('broadcast');

      // Redis: presence + pub/sub subscriptions + room sync
      if (redisPresence) {
        void redisPresence.setOnline(data.userId);
      }
      if (redisPubSub) {
        void redisPubSub.subscribeForUser(data.userId);
        for (const room of data.rooms) {
          void redisPubSub.subscribeForRoom(room);
        }
      }
      if (redisRoomSync) {
        for (const room of data.rooms) {
          void redisRoomSync.addMember(room, data.userId);
        }
      }

      // Send welcome message
      ws.send(
        serialize({
          type: 'welcome',
          connectionId: data.connectionId,
          userId: data.userId,
        }),
        false,
      );

      logger.info(
        { userId: data.userId, connectionId: data.connectionId, rooms: data.rooms },
        'Client connected',
      );
    },

    message: (ws: WebSocket<UserData>, message, _isBinary) => {
      const raw = Buffer.from(message).toString('utf-8');
      const parsed = deserialize(raw);

      if (!parsed) {
        ws.send(
          serialize(createError(ErrorCode.INVALID_MESSAGE, 'Invalid message format')),
          false,
        );
        metrics?.incrementErrors();
        return;
      }

      const data = ws.getUserData();
      metrics?.incrementMessagesReceived();

      // Rate limit check for non-ping messages
      if (parsed.type !== 'ping' && rateLimiter) {
        void rateLimiter.checkLimit(`ws:${data.userId}`).then((result) => {
          if (!result.allowed) {
            ws.send(
              serialize(createError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many messages')),
              false,
            );
            metrics?.incrementRateLimitHits();
            return;
          }
          handleMessage(ws, parsed, data);
        });
        return;
      }

      handleMessage(ws, parsed, data);
    },

    close: (ws: WebSocket<UserData>, _code, _message) => {
      const data = ws.getUserData();
      connectionManager.remove(ws);
      roomManager.removeUserFromAllRooms(data.userId);
      metrics?.incrementConnectionsClosed();

      // Redis: presence + room sync cleanup
      if (redisPresence) {
        void redisPresence.setOffline(data.userId);
      }
      if (redisRoomSync) {
        void redisRoomSync.removeUserFromAllRooms(data.userId);
      }

      logger.info(
        { userId: data.userId, connectionId: data.connectionId },
        'Client disconnected',
      );
    },
  });

  function handleMessage(
    ws: WebSocket<UserData>,
    parsed: import('../protocol/messages.js').ClientMessage,
    data: UserData,
  ): void {
    switch (parsed.type) {
      case 'ping':
        data.lastPong = Date.now();
        ws.send(serialize({ type: 'pong' }), false);
        break;

      case 'subscribe': {
        const subscribed = roomManager.subscribe(data.userId, parsed.room);
        if (!subscribed) {
          ws.send(
            serialize(
              createError(ErrorCode.PERMISSION_DENIED, 'Max room subscriptions reached'),
            ),
            false,
          );
          return;
        }
        ws.subscribe(parsed.room);
        if (!data.rooms.includes(parsed.room)) {
          data.rooms.push(parsed.room);
        }

        if (redisPubSub) {
          void redisPubSub.subscribeForRoom(parsed.room);
        }
        if (redisRoomSync) {
          void redisRoomSync.addMember(parsed.room, data.userId);
        }

        ws.send(serialize({ type: 'subscribed', room: parsed.room }), false);
        metrics?.incrementMessagesSent();
        logger.debug({ userId: data.userId, room: parsed.room }, 'Subscribed to room');
        break;
      }

      case 'unsubscribe':
        ws.unsubscribe(parsed.room);
        roomManager.unsubscribe(data.userId, parsed.room);
        data.rooms = data.rooms.filter((r) => r !== parsed.room);

        if (redisRoomSync) {
          void redisRoomSync.removeMember(parsed.room, data.userId);
        }

        ws.send(serialize({ type: 'unsubscribed', room: parsed.room }), false);
        metrics?.incrementMessagesSent();
        logger.debug({ userId: data.userId, room: parsed.room }, 'Unsubscribed from room');
        break;

      case 'publish':
        if (!data.permissions.includes('send')) {
          ws.send(
            serialize(createError(ErrorCode.PERMISSION_DENIED, 'No send permission')),
            false,
          );
          return;
        }

        const payload = serialize({
          type: 'message',
          room: parsed.room,
          event: parsed.event,
          data: parsed.data,
          timestamp: Date.now(),
        });

        ws.publish(parsed.room, payload, false);
        metrics?.incrementMessagesSent();

        if (redisPubSub) {
          void redisPubSub.publishToRoom(parsed.room, payload);
        }
        break;
    }
  }
}
