import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisPresence } from '../../src/redis/RedisPresence.js';
import type Redis from 'ioredis';

function createMockRedis() {
  return {
    zadd: vi.fn().mockResolvedValue(1),
    zrem: vi.fn().mockResolvedValue(1),
    zscore: vi.fn().mockResolvedValue(null),
    zcard: vi.fn().mockResolvedValue(0),
    zrevrange: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
  } as unknown as Redis;
}

describe('RedisPresence', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let presence: RedisPresence;

  beforeEach(() => {
    redis = createMockRedis();
    presence = new RedisPresence(redis);
  });

  describe('setOnline', () => {
    it('should add user to presence sorted set', async () => {
      await presence.setOnline('user1');

      expect(redis.zadd).toHaveBeenCalledWith(
        'presence:online',
        expect.any(String),
        'user1',
      );
    });
  });

  describe('setOffline', () => {
    it('should remove user from presence sorted set', async () => {
      await presence.setOffline('user1');

      expect(redis.zrem).toHaveBeenCalledWith('presence:online', 'user1');
    });
  });

  describe('isOnline', () => {
    it('should return true when user has a score', async () => {
      vi.mocked(redis.zscore).mockResolvedValue('1700000000');

      const result = await presence.isOnline('user1');
      expect(result).toBe(true);
    });

    it('should return false when user has no score', async () => {
      vi.mocked(redis.zscore).mockResolvedValue(null);

      const result = await presence.isOnline('user1');
      expect(result).toBe(false);
    });
  });

  describe('getOnlineCount', () => {
    it('should return the count from zcard', async () => {
      vi.mocked(redis.zcard).mockResolvedValue(42);

      const count = await presence.getOnlineCount();
      expect(count).toBe(42);
    });
  });

  describe('getOnlineUsers', () => {
    it('should return users from zrevrange', async () => {
      vi.mocked(redis.zrevrange).mockResolvedValue(['user1', 'user2']);

      const users = await presence.getOnlineUsers(10);
      expect(users).toEqual(['user1', 'user2']);
      expect(redis.zrevrange).toHaveBeenCalledWith('presence:online', 0, 9);
    });
  });

  describe('cleanStale', () => {
    it('should remove entries older than threshold', async () => {
      vi.mocked(redis.zremrangebyscore).mockResolvedValue(3);

      const removed = await presence.cleanStale();
      expect(removed).toBe(3);
      expect(redis.zremrangebyscore).toHaveBeenCalledWith(
        'presence:online',
        '-inf',
        expect.any(String),
      );
    });
  });

  describe('removeInstance', () => {
    it('should remove multiple users at once', async () => {
      await presence.removeInstance(['user1', 'user2', 'user3']);

      expect(redis.zrem).toHaveBeenCalledWith('presence:online', 'user1', 'user2', 'user3');
    });

    it('should skip if no users provided', async () => {
      await presence.removeInstance([]);

      expect(redis.zrem).not.toHaveBeenCalled();
    });
  });
});
