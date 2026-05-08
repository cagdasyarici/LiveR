import type { Redis } from 'ioredis';
import { logger } from '../monitoring/logger.js';

const PRESENCE_KEY = 'presence:online';
const STALE_THRESHOLD_SEC = 60;

export class RedisPresence {
  constructor(private readonly redis: Redis) {}

  async setOnline(userId: string): Promise<void> {
    try {
      await this.redis.zadd(PRESENCE_KEY, Date.now().toString(), userId);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to set user online');
    }
  }

  async setOffline(userId: string): Promise<void> {
    try {
      await this.redis.zrem(PRESENCE_KEY, userId);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to set user offline');
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    try {
      const score = await this.redis.zscore(PRESENCE_KEY, userId);
      return score !== null;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to check user online status');
      return false;
    }
  }

  async getOnlineCount(): Promise<number> {
    try {
      return await this.redis.zcard(PRESENCE_KEY);
    } catch (err) {
      logger.error({ err }, 'Failed to get online count');
      return 0;
    }
  }

  async getOnlineUsers(limit: number = 100): Promise<string[]> {
    try {
      return await this.redis.zrevrange(PRESENCE_KEY, 0, limit - 1);
    } catch (err) {
      logger.error({ err }, 'Failed to get online users');
      return [];
    }
  }

  async refreshPresence(userId: string): Promise<void> {
    await this.setOnline(userId);
  }

  async cleanStale(): Promise<number> {
    try {
      const threshold = Date.now() - STALE_THRESHOLD_SEC * 1000;
      const removed = await this.redis.zremrangebyscore(PRESENCE_KEY, '-inf', threshold.toString());
      if (removed > 0) {
        logger.info({ removed }, 'Cleaned stale presence entries');
      }
      return removed;
    } catch (err) {
      logger.error({ err }, 'Failed to clean stale presence');
      return 0;
    }
  }

  /**
   * Remove all presence data for a given instance (used during shutdown)
   */
  async removeInstance(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    try {
      await this.redis.zrem(PRESENCE_KEY, ...userIds);
      logger.info({ count: userIds.length }, 'Removed instance users from presence');
    } catch (err) {
      logger.error({ err }, 'Failed to remove instance from presence');
    }
  }
}
