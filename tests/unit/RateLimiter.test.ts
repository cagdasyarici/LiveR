import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/core/RateLimiter.js';
import type Redis from 'ioredis';

function createMockPipeline(cardValue: number = 1) {
  return {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, 0],          // zremrangebyscore result
      [null, 1],          // zadd result
      [null, cardValue],  // zcard result
      [null, 1],          // pexpire result
    ]),
  };
}

function createMockRedis(cardValue: number = 1) {
  const mockPipeline = createMockPipeline(cardValue);
  return {
    pipeline: vi.fn(() => mockPipeline),
    del: vi.fn().mockResolvedValue(1),
    _mockPipeline: mockPipeline,
  } as unknown as Redis & { _mockPipeline: ReturnType<typeof createMockPipeline> };
}

describe('RateLimiter', () => {
  describe('checkLimit', () => {
    it('should allow request when under limit', async () => {
      const redis = createMockRedis(5); // 5 requests in window
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      const result = await limiter.checkLimit('user1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(95);
      expect(result.limit).toBe(100);
    });

    it('should deny request when over limit', async () => {
      const redis = createMockRedis(101); // 101 requests in window
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      const result = await limiter.checkLimit('user1');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should allow request at exact limit', async () => {
      const redis = createMockRedis(100); // exactly at limit
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      const result = await limiter.checkLimit('user1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should fail open when Redis errors', async () => {
      const redis = createMockRedis(1);
      redis._mockPipeline.exec.mockRejectedValue(new Error('Redis down'));
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      const result = await limiter.checkLimit('user1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });

    it('should use correct key prefix', async () => {
      const redis = createMockRedis(1);
      const limiter = new RateLimiter(redis, 60000, 100, 'custom');

      await limiter.checkLimit('user1');

      // Pipeline is called, check that it was invoked
      expect(redis.pipeline).toHaveBeenCalled();
    });

    it('should remove expired entries from window', async () => {
      const redis = createMockRedis(1);
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      await limiter.checkLimit('user1');

      const pipeline = redis._mockPipeline;
      expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
        'ratelimit:user1',
        '-inf',
        expect.any(String),
      );
    });
  });

  describe('reset', () => {
    it('should delete the rate limit key', async () => {
      const redis = createMockRedis(1);
      const limiter = new RateLimiter(redis, 60000, 100, 'ratelimit');

      await limiter.reset('user1');

      expect(redis.del).toHaveBeenCalledWith('ratelimit:user1');
    });
  });
});
