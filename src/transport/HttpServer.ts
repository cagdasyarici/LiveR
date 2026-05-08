import type { TemplatedApp, HttpResponse, HttpRequest } from 'uWebSockets.js';
import type { Redis } from 'ioredis';
import type { Config } from '../config/index.js';
import type { ConnectionManager } from '../core/ConnectionManager.js';
import type { MessageRouter } from '../core/MessageRouter.js';
import type { RoomManager } from '../core/RoomManager.js';
import type { RateLimiter } from '../core/RateLimiter.js';
import type { MetricsCollector } from '../core/MetricsCollector.js';
import { checkRedisHealth } from '../redis/RedisClient.js';
import { requireApiKey } from './middleware/auth.js';
import { sendMessageSchema, broadcastMessageSchema, roomSendMessageSchema } from './validation.js';
import { logger } from '../monitoring/logger.js';

function readBody(res: HttpResponse): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let aborted = false;

    res.onAborted(() => {
      aborted = true;
      reject(new Error('Request aborted'));
    });

    res.onData((chunk, isLast) => {
      buffer += Buffer.from(chunk).toString('utf-8');
      if (isLast && !aborted) {
        resolve(buffer);
      }
    });
  });
}

function sendJson(res: HttpResponse, status: string, data: unknown): void {
  res.cork(() => {
    res
      .writeStatus(status)
      .writeHeader('Content-Type', 'application/json')
      .writeHeader('Access-Control-Allow-Origin', '*')
      .end(JSON.stringify(data));
  });
}

/**
 * Extract IP from request synchronously (must be called before handler returns).
 */
function extractIp(req: HttpRequest): string {
  const forwarded = req.getHeader('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

/**
 * Check rate limit by IP. Returns true if allowed, false if limited (response already sent).
 */
async function checkRateLimit(
  res: HttpResponse,
  ip: string,
  rateLimiter: RateLimiter,
): Promise<boolean> {
  const identifier = `http:${ip}`;
  const result = await rateLimiter.checkLimit(identifier);

  if (!result.allowed) {
    res.cork(() => {
      res
        .writeStatus('429 Too Many Requests')
        .writeHeader('Content-Type', 'application/json')
        .writeHeader('Retry-After', Math.ceil(result.resetIn / 1000).toString())
        .writeHeader('X-RateLimit-Limit', result.limit.toString())
        .writeHeader('X-RateLimit-Remaining', '0')
        .end(
          JSON.stringify({
            error: 'Too many requests',
            retryAfter: Math.ceil(result.resetIn / 1000),
          }),
        );
    });
    return false;
  }

  return true;
}

export interface HttpDependencies {
  app: TemplatedApp;
  config: Config;
  connectionManager: ConnectionManager;
  messageRouter: MessageRouter;
  roomManager: RoomManager;
  redisClient?: Redis;
  httpRateLimiter?: RateLimiter;
  metrics?: MetricsCollector;
}

export function setupHttpRoutes(deps: HttpDependencies): void {
  const {
    app,
    config,
    connectionManager,
    messageRouter,
    roomManager,
    redisClient,
    httpRateLimiter,
    metrics,
  } = deps;

  // Health check (no auth, no rate limit)
  app.get('/api/health', (res, _req) => {
    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });

    const stats = connectionManager.getStats();

    const respond = (redisStatus: string): void => {
      if (aborted) return;
      const overallStatus = redisStatus === 'connected' ? 'healthy' : 'degraded';
      sendJson(res, '200 OK', {
        status: overallStatus,
        uptime: Math.floor(process.uptime()),
        connections: stats.total,
        rooms: roomManager.roomCount,
        redis: redisStatus,
        version: '1.0.0',
        instanceId: config.instanceId,
      });
    };

    if (redisClient) {
      checkRedisHealth(redisClient)
        .then((healthy) => respond(healthy ? 'connected' : 'disconnected'))
        .catch(() => respond('error'));
    } else {
      respond('not_configured');
    }
  });

  // Metrics endpoint (Prometheus format, no auth)
  if (config.metricsEnabled && metrics) {
    app.get(config.metricsPath, (res, _req) => {
      res.onAborted(() => {});

      const body = metrics.toPrometheus(connectionManager.size, roomManager.roomCount);
      res.cork(() => {
        res
          .writeStatus('200 OK')
          .writeHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
          .writeHeader('Access-Control-Allow-Origin', '*')
          .end(body);
      });
    });
  }

  // POST /api/send
  app.post('/api/send', (res, req) => {
    // Read all req data synchronously before handler returns
    if (!requireApiKey(res, req, config.apiKey)) return;
    const ip = extractIp(req);

    // Start reading body immediately (onData must be registered synchronously)
    const bodyPromise = readBody(res);

    const handleRequest = async (): Promise<void> => {
      if (httpRateLimiter) {
        const allowed = await checkRateLimit(res, ip, httpRateLimiter);
        if (!allowed) {
          metrics?.incrementRateLimitHits();
          return;
        }
      }

      try {
        const body = await bodyPromise;

        const parsed = sendMessageSchema.safeParse(JSON.parse(body));
        if (!parsed.success) {
          sendJson(res, '400 Bad Request', {
            error: 'Invalid request body',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const { target, event, data } = parsed.data;
        const result = messageRouter.sendToTarget(target, event, data);
        metrics?.incrementMessagesSent(result.delivered);
        sendJson(res, '200 OK', result);
      } catch (err) {
        logger.error({ err }, 'Error handling POST /api/send');
        sendJson(res, '400 Bad Request', { error: 'Invalid JSON body' });
        metrics?.incrementErrors();
      }
    };

    void handleRequest();
  });

  // POST /api/broadcast
  app.post('/api/broadcast', (res, req) => {
    if (!requireApiKey(res, req, config.apiKey)) return;
    const ip = extractIp(req);
    const bodyPromise = readBody(res);

    const handleRequest = async (): Promise<void> => {
      if (httpRateLimiter) {
        const allowed = await checkRateLimit(res, ip, httpRateLimiter);
        if (!allowed) {
          metrics?.incrementRateLimitHits();
          return;
        }
      }

      try {
        const body = await bodyPromise;

        const parsed = broadcastMessageSchema.safeParse(JSON.parse(body));
        if (!parsed.success) {
          sendJson(res, '400 Bad Request', {
            error: 'Invalid request body',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const { event, data } = parsed.data;
        const result = messageRouter.broadcast(event, data);
        metrics?.incrementMessagesSent(result.delivered);
        sendJson(res, '200 OK', result);
      } catch (err) {
        logger.error({ err }, 'Error handling POST /api/broadcast');
        sendJson(res, '400 Bad Request', { error: 'Invalid JSON body' });
        metrics?.incrementErrors();
      }
    };

    void handleRequest();
  });

  // POST /api/rooms/:roomId/send
  app.post('/api/rooms/:roomId/send', (res, req) => {
    if (!requireApiKey(res, req, config.apiKey)) return;
    const ip = extractIp(req);
    const roomId = req.getParameter(0);
    if (!roomId) {
      sendJson(res, '400 Bad Request', { error: 'Missing roomId parameter' });
      return;
    }

    const bodyPromise = readBody(res);

    const handleRequest = async (): Promise<void> => {
      if (httpRateLimiter) {
        const allowed = await checkRateLimit(res, ip, httpRateLimiter);
        if (!allowed) {
          metrics?.incrementRateLimitHits();
          return;
        }
      }

      try {
        const body = await bodyPromise;

        const parsed = roomSendMessageSchema.safeParse(JSON.parse(body));
        if (!parsed.success) {
          sendJson(res, '400 Bad Request', {
            error: 'Invalid request body',
            details: parsed.error.flatten().fieldErrors,
          });
          return;
        }

        const { event, data } = parsed.data;
        const result = messageRouter.sendToRoom(roomId, event, data);
        metrics?.incrementMessagesSent(result.delivered);
        sendJson(res, '200 OK', result);
      } catch (err) {
        logger.error({ err }, 'Error handling POST /api/rooms/:roomId/send');
        sendJson(res, '400 Bad Request', { error: 'Invalid JSON body' });
        metrics?.incrementErrors();
      }
    };

    void handleRequest();
  });

  // GET /api/rooms
  app.get('/api/rooms', (res, req) => {
    res.onAborted(() => {});

    if (!requireApiKey(res, req, config.apiKey)) return;

    const rooms = roomManager.getAllRooms().map((room) => ({
      id: room.id,
      members: room.members.size,
      created: new Date(room.createdAt).toISOString(),
    }));

    sendJson(res, '200 OK', { rooms, total: rooms.length });
  });

  // GET /api/connections
  app.get('/api/connections', (res, req) => {
    res.onAborted(() => {});

    if (!requireApiKey(res, req, config.apiKey)) return;

    const stats = connectionManager.getStats();
    sendJson(res, '200 OK', { total: stats.total, uniqueUsers: stats.uniqueUsers });
  });

  // CORS preflight
  app.options('/*', (res, _req) => {
    res.cork(() => {
      res
        .writeStatus('204 No Content')
        .writeHeader('Access-Control-Allow-Origin', '*')
        .writeHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        .writeHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        .writeHeader('Access-Control-Max-Age', '86400')
        .end();
    });
  });

  // Catch-all 404
  app.any('/*', (res, _req) => {
    sendJson(res, '404 Not Found', { error: 'Not found' });
  });

  logger.info('HTTP routes registered');
}

export { readBody, sendJson };
