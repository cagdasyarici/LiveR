import type { Redis } from 'ioredis';
import { logger } from '../monitoring/logger.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetIn: number;
}

export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly windowMs: number,
    private readonly maxRequests: number,
    private readonly keyPrefix: string = 'ratelimit',
  ) {}

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      const pipeline = this.redis.pipeline();

      // Remove expired entries
      pipeline.zremrangebyscore(key, '-inf', windowStart.toString());

      // Add current request
      pipeline.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2, 8)}`);

      // Count requests in window
      pipeline.zcard(key);

      // Set TTL to auto-cleanup
      pipeline.pexpire(key, this.windowMs);

      const results = await pipeline.exec();

      // zcard result is at index 2
      const count = (results?.[2]?.[1] as number) ?? 0;
      const allowed = count <= this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - count);

      if (!allowed) {
        logger.debug({ identifier, count, limit: this.maxRequests }, 'Rate limit exceeded');
      }

      return {
        allowed,
        remaining,
        limit: this.maxRequests,
        resetIn: this.windowMs,
      };
    } catch (err) {
      logger.error({ err, identifier }, 'Rate limit check failed, allowing request');
      // Fail open — if Redis is down, allow the request
      return {
        allowed: true,
        remaining: this.maxRequests,
        limit: this.maxRequests,
        resetIn: this.windowMs,
      };
    }
  }

  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:${identifier}`;
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.error({ err, identifier }, 'Failed to reset rate limit');
    }
  }
}
