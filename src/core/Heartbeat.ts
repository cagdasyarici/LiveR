import type { ConnectionManager } from './ConnectionManager.js';
import { logger } from '../monitoring/logger.js';

const PING_PAYLOAD = JSON.stringify({ type: 'ping' });

export function startHeartbeat(
  connectionManager: ConnectionManager,
  interval: number,
  timeout: number,
): () => void {
  const timer = setInterval(() => {
    const now = Date.now();
    let disconnected = 0;

    for (const ws of connectionManager.getAllConnections()) {
      const data = ws.getUserData();
      const elapsed = now - data.lastPong;

      if (elapsed > interval + timeout) {
        // Client missed heartbeat — disconnect
        logger.debug(
          { userId: data.userId, connectionId: data.connectionId, elapsed },
          'Heartbeat timeout, disconnecting',
        );
        ws.end(1001, 'Heartbeat timeout');
        disconnected++;
      } else {
        // Send ping to client
        ws.send(PING_PAYLOAD, false);
      }
    }

    if (disconnected > 0) {
      logger.info({ disconnected }, 'Heartbeat: disconnected stale clients');
    }
  }, interval);

  logger.info({ interval, timeout }, 'Heartbeat started');

  return (): void => {
    clearInterval(timer);
  };
}
