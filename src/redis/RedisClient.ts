import { Redis } from 'ioredis';
import { logger } from '../monitoring/logger.js';

export interface RedisClientOptions {
  url: string;
  password?: string;
  db: number;
  keyPrefix: string;
}

export function createRedisClient(options: RedisClientOptions, name: string = 'default'): Redis {
  const client = new Redis(options.url, {
    password: options.password || undefined,
    db: options.db,
    keyPrefix: options.keyPrefix,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      logger.warn({ name, attempt: times, delay }, 'Redis reconnecting');
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('connect', () => {
    logger.info({ name }, 'Redis connected');
  });

  client.on('ready', () => {
    logger.info({ name }, 'Redis ready');
  });

  client.on('error', (err) => {
    logger.error({ name, err }, 'Redis error');
  });

  client.on('close', () => {
    logger.warn({ name }, 'Redis connection closed');
  });

  return client;
}

export async function checkRedisHealth(client: Redis): Promise<boolean> {
  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
