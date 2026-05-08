import type { Redis } from 'ioredis';
import { logger } from '../monitoring/logger.js';

export class RedisRoomSync {
  constructor(private readonly redis: Redis) {}

  async addMember(roomId: string, userId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.sadd(`room:${roomId}:members`, userId);
      pipeline.sadd(`user:${userId}:rooms`, roomId);
      await pipeline.exec();
    } catch (err) {
      logger.error({ err, roomId, userId }, 'Failed to add room member');
    }
  }

  async removeMember(roomId: string, userId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.srem(`room:${roomId}:members`, userId);
      pipeline.srem(`user:${userId}:rooms`, roomId);
      await pipeline.exec();
    } catch (err) {
      logger.error({ err, roomId, userId }, 'Failed to remove room member');
    }
  }

  async getMembers(roomId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`room:${roomId}:members`);
    } catch (err) {
      logger.error({ err, roomId }, 'Failed to get room members');
      return [];
    }
  }

  async getMemberCount(roomId: string): Promise<number> {
    try {
      return await this.redis.scard(`room:${roomId}:members`);
    } catch (err) {
      logger.error({ err, roomId }, 'Failed to get room member count');
      return 0;
    }
  }

  async getUserRooms(userId: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`user:${userId}:rooms`);
    } catch (err) {
      logger.error({ err, userId }, 'Failed to get user rooms');
      return [];
    }
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    try {
      return (await this.redis.sismember(`room:${roomId}:members`, userId)) === 1;
    } catch (err) {
      logger.error({ err, roomId, userId }, 'Failed to check membership');
      return false;
    }
  }

  async removeUserFromAllRooms(userId: string): Promise<string[]> {
    try {
      const rooms = await this.redis.smembers(`user:${userId}:rooms`);
      if (rooms.length === 0) return [];

      const pipeline = this.redis.pipeline();
      for (const roomId of rooms) {
        pipeline.srem(`room:${roomId}:members`, userId);
      }
      pipeline.del(`user:${userId}:rooms`);
      await pipeline.exec();

      return rooms;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to remove user from all rooms');
      return [];
    }
  }

  /**
   * Clean up empty room keys (maintenance task)
   */
  async cleanEmptyRoom(roomId: string): Promise<boolean> {
    try {
      const count = await this.redis.scard(`room:${roomId}:members`);
      if (count === 0) {
        await this.redis.del(`room:${roomId}:members`);
        return true;
      }
      return false;
    } catch (err) {
      logger.error({ err, roomId }, 'Failed to clean empty room');
      return false;
    }
  }
}
