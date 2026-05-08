import type { us_listen_socket } from 'uWebSockets.js';
import type { Redis } from 'ioredis';
import type { ConnectionManager } from '../core/ConnectionManager.js';
import type { RedisPubSub } from '../redis/RedisPubSub.js';
import { logger } from '../monitoring/logger.js';

interface ShutdownDependencies {
  listenSocket: us_listen_socket | null;
  connectionManager: ConnectionManager;
  instanceId: string;
  redisPubSub?: RedisPubSub;
  redisClient?: Redis;
  redisSubscriber?: Redis;
  redisPublisher?: Redis;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setupGracefulShutdown(deps: ShutdownDependencies): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal, instanceId: deps.instanceId }, 'Shutdown signal received');

    // 1. Stop accepting new connections
    if (deps.listenSocket) {
      const { us_listen_socket_close } = await import('uWebSockets.js');
      us_listen_socket_close(deps.listenSocket);
      logger.info('Stopped accepting new connections');
    }

    // 2. Notify connected clients
    deps.connectionManager.broadcastAll({
      type: 'system',
      event: 'shutdown',
      data: { message: 'Server restarting, please reconnect' },
    });

    // 3. Wait for in-flight messages
    await sleep(2000);

    // 4. Close all connections
    deps.connectionManager.closeAll(1001, 'Server shutdown');
    logger.info('All connections closed');

    // 5. Clean up Redis
    if (deps.redisPubSub) {
      await deps.redisPubSub.shutdown();
    }

    const redisClients = [deps.redisClient, deps.redisSubscriber, deps.redisPublisher].filter(
      (c): c is Redis => c !== undefined,
    );

    for (const client of redisClients) {
      try {
        await client.quit();
      } catch (err) {
        logger.error({ err }, 'Error closing Redis connection');
      }
    }

    if (redisClients.length > 0) {
      logger.info('Redis connections closed');
    }

    // 6. Exit
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
