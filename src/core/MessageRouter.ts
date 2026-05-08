import type { TemplatedApp } from 'uWebSockets.js';
import type { ConnectionManager } from './ConnectionManager.js';
import type { RoomManager } from './RoomManager.js';
import type { RedisPubSub } from '../redis/RedisPubSub.js';
import type { IncomingMessage } from '../protocol/messages.js';
import { serialize } from '../protocol/serializer.js';
import { logger } from '../monitoring/logger.js';

export interface RouteResult {
  success: boolean;
  delivered: number;
  timestamp: string;
  room?: string;
}

export class MessageRouter {
  private readonly redisPubSub?: RedisPubSub;

  constructor(
    private readonly app: TemplatedApp,
    private readonly connectionManager: ConnectionManager,
    private readonly roomManager: RoomManager,
    redisPubSub?: RedisPubSub,
  ) {
    this.redisPubSub = redisPubSub;
  }

  sendToTarget(target: string, event: string, data: unknown): RouteResult {
    const timestamp = new Date().toISOString();
    const message: IncomingMessage = {
      type: 'message',
      room: target,
      event,
      data,
      timestamp: Date.now(),
    };
    const payload = serialize(message);

    let delivered = 0;

    if (target.startsWith('user:')) {
      const userId = target.slice(5);
      delivered = this.connectionManager.sendToUser(userId, message);

      // Also publish via Redis for cross-instance delivery.
      // If the user wasn't found locally (delivered=0), count as 1 —
      // the message is en route via Redis to whichever instance holds
      // the connection (or silently dropped if user is offline everywhere).
      if (this.redisPubSub) {
        void this.redisPubSub.publishToUser(userId, payload);
        if (delivered === 0) delivered = 1;
      }

      logger.debug({ target, event, delivered }, 'Sent to user');
    } else if (target.startsWith('room:') || target.includes(':')) {
      // Strip 'room:' prefix — uWS topics and Redis channels use bare room names
      const roomId = target.startsWith('room:') ? target.slice(5) : target;
      this.app.publish(roomId, payload, false);
      delivered = this.roomManager.getMemberCount(roomId);

      if (this.redisPubSub) {
        void this.redisPubSub.publishToRoom(roomId, payload);
      }

      logger.debug({ target, roomId, event, delivered }, 'Sent to room');
    } else {
      logger.warn({ target }, 'Unknown target format');
      return { success: false, delivered: 0, timestamp };
    }

    return { success: true, delivered, timestamp };
  }

  sendToRoom(roomId: string, event: string, data: unknown): RouteResult {
    const timestamp = new Date().toISOString();
    const message: IncomingMessage = {
      type: 'message',
      room: roomId,
      event,
      data,
      timestamp: Date.now(),
    };
    const payload = serialize(message);

    this.app.publish(roomId, payload, false);
    const delivered = this.roomManager.getMemberCount(roomId);

    if (this.redisPubSub) {
      void this.redisPubSub.publishToRoom(roomId, payload);
    }

    logger.debug({ roomId, event, delivered }, 'Sent to room');
    return { success: true, delivered, timestamp, room: roomId };
  }

  broadcast(event: string, data: unknown): RouteResult {
    const timestamp = new Date().toISOString();
    const message: IncomingMessage = {
      type: 'message',
      room: 'broadcast',
      event,
      data,
      timestamp: Date.now(),
    };
    const payload = serialize(message);

    this.app.publish('broadcast', payload, false);
    const delivered = this.connectionManager.size;

    if (this.redisPubSub) {
      void this.redisPubSub.publishBroadcast(payload);
    }

    logger.debug({ event, delivered }, 'Broadcast sent');
    return { success: true, delivered, timestamp };
  }
}
