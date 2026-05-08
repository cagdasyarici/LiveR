import type { Redis } from 'ioredis';
import type { TemplatedApp } from 'uWebSockets.js';
import type { ConnectionManager } from '../core/ConnectionManager.js';
import { logger } from '../monitoring/logger.js';

export class RedisPubSub {
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly subscribedChannels = new Set<string>();
  private onMessageDelivered?: (count: number) => void;

  constructor(
    subscriber: Redis,
    publisher: Redis,
    private readonly app: TemplatedApp,
    private readonly connectionManager: ConnectionManager,
  ) {
    this.subscriber = subscriber;
    this.publisher = publisher;

    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });

    // Always subscribe to broadcast channel
    void this.subscribeChannel('channel:broadcast');
  }

  /**
   * Register a callback that fires when this instance forwards a Redis message
   * to a local WebSocket client — used to update metrics.
   */
  setDeliveryCallback(cb: (count: number) => void): void {
    this.onMessageDelivered = cb;
  }

  /**
   * Publish a message to a Redis channel for cross-instance delivery
   */
  async publishToUser(userId: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(`channel:user:${userId}`, message);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to publish to user channel');
      return 0;
    }
  }

  async publishToRoom(roomId: string, message: string): Promise<number> {
    try {
      return await this.publisher.publish(`channel:room:${roomId}`, message);
    } catch (err) {
      logger.error({ err, roomId }, 'Failed to publish to room channel');
      return 0;
    }
  }

  async publishBroadcast(message: string): Promise<number> {
    try {
      return await this.publisher.publish('channel:broadcast', message);
    } catch (err) {
      logger.error({ err }, 'Failed to publish broadcast');
      return 0;
    }
  }

  /**
   * Subscribe to a Redis channel so this instance receives messages from others
   */
  async subscribeChannel(channel: string): Promise<void> {
    if (this.subscribedChannels.has(channel)) return;

    try {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
      logger.debug({ channel }, 'Subscribed to Redis channel');
    } catch (err) {
      logger.error({ err, channel }, 'Failed to subscribe to Redis channel');
    }
  }

  async unsubscribeChannel(channel: string): Promise<void> {
    if (!this.subscribedChannels.has(channel)) return;

    try {
      await this.subscriber.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      logger.debug({ channel }, 'Unsubscribed from Redis channel');
    } catch (err) {
      logger.error({ err, channel }, 'Failed to unsubscribe from Redis channel');
    }
  }

  /**
   * Subscribe to user-specific and room channels when a client connects
   */
  async subscribeForUser(userId: string): Promise<void> {
    await this.subscribeChannel(`channel:user:${userId}`);
  }

  async subscribeForRoom(roomId: string): Promise<void> {
    await this.subscribeChannel(`channel:room:${roomId}`);
  }

  async unsubscribeForRoom(roomId: string): Promise<void> {
    await this.unsubscribeChannel(`channel:room:${roomId}`);
  }

  /**
   * Handle incoming Redis messages — forward to local uWS topics or direct connections
   */
  private handleMessage(channel: string, message: string): void {
    if (channel === 'channel:broadcast') {
      // Broadcast to all local clients via uWS topic
      this.app.publish('broadcast', message, false);
      const localCount = this.connectionManager.size;
      if (localCount > 0) this.onMessageDelivered?.(localCount);
      logger.debug('Redis broadcast forwarded to local clients');
    } else if (channel.startsWith('channel:room:')) {
      // Strip 'channel:room:' prefix to recover the original roomId (e.g. 'room:global')
      const ROOM_PREFIX = 'channel:room:';
      const roomId = channel.slice(ROOM_PREFIX.length);
      this.app.publish(roomId, message, false);
      logger.debug({ roomId }, 'Redis room message forwarded');
    } else if (channel.startsWith('channel:user:')) {
      // Send directly to user's connections
      const userId = channel.split(':')[2];
      if (userId) {
        const userConns = this.connectionManager.getByUserId(userId);
        if (userConns) {
          let forwarded = 0;
          for (const ws of userConns) {
            ws.send(message, false);
            forwarded++;
          }
          if (forwarded > 0) {
            this.onMessageDelivered?.(forwarded);
          }
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.subscriber.unsubscribe();
      this.subscribedChannels.clear();
      logger.info('RedisPubSub shut down');
    } catch (err) {
      logger.error({ err }, 'Error during RedisPubSub shutdown');
    }
  }
}
