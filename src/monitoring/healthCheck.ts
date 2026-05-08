import type { ConnectionManager } from '../core/ConnectionManager.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  connections: number;
  redis: string;
  version: string;
  instanceId: string;
}

export function getHealthStatus(
  connectionManager: ConnectionManager,
  instanceId: string,
): HealthStatus {
  const stats = connectionManager.getStats();

  return {
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    connections: stats.total,
    redis: 'not_configured',
    version: '1.0.0',
    instanceId,
  };
}
