import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisRoomSync } from '../../src/redis/RedisRoomSync.js';
import type Redis from 'ioredis';

function createMockPipeline() {
  const pipeline = {
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return pipeline;
}

function createMockRedis() {
  const mockPipeline = createMockPipeline();
  return {
    pipeline: vi.fn(() => mockPipeline),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    scard: vi.fn().mockResolvedValue(0),
    sismember: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(1),
    _mockPipeline: mockPipeline,
  } as unknown as Redis & { _mockPipeline: ReturnType<typeof createMockPipeline> };
}

describe('RedisRoomSync', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let roomSync: RedisRoomSync;

  beforeEach(() => {
    redis = createMockRedis();
    roomSync = new RedisRoomSync(redis);
  });

  describe('addMember', () => {
    it('should add user to room and room to user via pipeline', async () => {
      await roomSync.addMember('room:test', 'user1');

      const pipeline = redis._mockPipeline;
      expect(pipeline.sadd).toHaveBeenCalledWith('room:room:test:members', 'user1');
      expect(pipeline.sadd).toHaveBeenCalledWith('user:user1:rooms', 'room:test');
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove user from room and room from user via pipeline', async () => {
      await roomSync.removeMember('room:test', 'user1');

      const pipeline = redis._mockPipeline;
      expect(pipeline.srem).toHaveBeenCalledWith('room:room:test:members', 'user1');
      expect(pipeline.srem).toHaveBeenCalledWith('user:user1:rooms', 'room:test');
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('should return room members', async () => {
      vi.mocked(redis.smembers).mockResolvedValue(['user1', 'user2']);

      const members = await roomSync.getMembers('room:test');
      expect(members).toEqual(['user1', 'user2']);
      expect(redis.smembers).toHaveBeenCalledWith('room:room:test:members');
    });
  });

  describe('getMemberCount', () => {
    it('should return room member count', async () => {
      vi.mocked(redis.scard).mockResolvedValue(5);

      const count = await roomSync.getMemberCount('room:test');
      expect(count).toBe(5);
    });
  });

  describe('getUserRooms', () => {
    it('should return rooms the user is in', async () => {
      vi.mocked(redis.smembers).mockResolvedValue(['room:a', 'room:b']);

      const rooms = await roomSync.getUserRooms('user1');
      expect(rooms).toEqual(['room:a', 'room:b']);
      expect(redis.smembers).toHaveBeenCalledWith('user:user1:rooms');
    });
  });

  describe('isMember', () => {
    it('should return true when user is a member', async () => {
      vi.mocked(redis.sismember).mockResolvedValue(1);

      const result = await roomSync.isMember('room:test', 'user1');
      expect(result).toBe(true);
    });

    it('should return false when user is not a member', async () => {
      vi.mocked(redis.sismember).mockResolvedValue(0);

      const result = await roomSync.isMember('room:test', 'user1');
      expect(result).toBe(false);
    });
  });

  describe('removeUserFromAllRooms', () => {
    it('should remove user from all rooms via pipeline', async () => {
      vi.mocked(redis.smembers).mockResolvedValue(['room:a', 'room:b']);

      const rooms = await roomSync.removeUserFromAllRooms('user1');

      expect(rooms).toEqual(['room:a', 'room:b']);
      const pipeline = redis._mockPipeline;
      expect(pipeline.srem).toHaveBeenCalledWith('room:room:a:members', 'user1');
      expect(pipeline.srem).toHaveBeenCalledWith('room:room:b:members', 'user1');
      expect(pipeline.del).toHaveBeenCalledWith('user:user1:rooms');
    });

    it('should return empty array when user has no rooms', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([]);

      const rooms = await roomSync.removeUserFromAllRooms('user1');
      expect(rooms).toEqual([]);
    });
  });

  describe('cleanEmptyRoom', () => {
    it('should delete empty room key', async () => {
      vi.mocked(redis.scard).mockResolvedValue(0);

      const cleaned = await roomSync.cleanEmptyRoom('room:test');
      expect(cleaned).toBe(true);
      expect(redis.del).toHaveBeenCalledWith('room:room:test:members');
    });

    it('should not delete non-empty room', async () => {
      vi.mocked(redis.scard).mockResolvedValue(3);

      const cleaned = await roomSync.cleanEmptyRoom('room:test');
      expect(cleaned).toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
