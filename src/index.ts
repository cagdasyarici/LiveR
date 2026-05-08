import uWS from 'uWebSockets.js';
import { config } from './config/index.js';
import { initLogger, logger } from './monitoring/logger.js';
import { ConnectionManager } from './core/ConnectionManager.js';
import { RoomManager } from './core/RoomManager.js';
import { MessageRouter } from './core/MessageRouter.js';
import { RateLimiter } from './core/RateLimiter.js';
import { MetricsCollector } from './core/MetricsCollector.js';
import { JwtVerifier } from './auth/JwtVerifier.js';
import { setupWebSocket } from './transport/WebSocketServer.js';
import { setupHttpRoutes } from './transport/HttpServer.js';
import { setupGracefulShutdown } from './utils/gracefulShutdown.js';
import { startHeartbeat } from './core/Heartbeat.js';
import { createRedisClient } from './redis/RedisClient.js';
import { RedisPubSub } from './redis/RedisPubSub.js';
import { RedisPresence } from './redis/RedisPresence.js';
import { RedisRoomSync } from './redis/RedisRoomSync.js';
import type { us_listen_socket } from 'uWebSockets.js';

// Initialize logger with config
initLogger(config.logLevel, config.logFormat);

logger.info({ instanceId: config.instanceId, nodeEnv: config.nodeEnv }, 'Starting LiveRelay');

// Core services
const connectionManager = new ConnectionManager(config.wsMaxConnections);
const roomManager = new RoomManager(config.wsMaxRoomsPerConnection);
const metrics = new MetricsCollector();

const jwtVerifier = new JwtVerifier({
  secret: config.jwtSecret,
  publicKeyPath: config.jwtPublicKey,
  algorithm: config.jwtAlgorithm,
});

// Create uWS app
const app = uWS.App();

// Redis setup
const redisOptions = {
  url: config.redisUrl,
  password: config.redisPassword,
  db: config.redisDb,
  keyPrefix: config.redisKeyPrefix,
};

const redisClient = createRedisClient(redisOptions, 'main');
const redisSubscriber = createRedisClient({ ...redisOptions, keyPrefix: '' }, 'subscriber');
const redisPublisher = createRedisClient({ ...redisOptions, keyPrefix: '' }, 'publisher');

const redisPubSub = new RedisPubSub(redisSubscriber, redisPublisher, app, connectionManager);
redisPubSub.setDeliveryCallback((count) => metrics.incrementMessagesSent(count));
const redisPresence = new RedisPresence(redisClient);
const redisRoomSync = new RedisRoomSync(redisClient);

// Rate limiters (Redis-backed)
const wsRateLimiter = new RateLimiter(
  redisClient,
  config.rateLimitWindow,
  config.rateLimitMaxMessages,
  'ratelimit',
);

const httpRateLimiter = new RateLimiter(
  redisClient,
  config.rateLimitWindow,
  config.rateLimitMaxRequests,
  'ratelimit',
);

// Message router with Redis support
const messageRouter = new MessageRouter(app, connectionManager, roomManager, redisPubSub);

// Setup routes
setupWebSocket({
  app,
  config,
  connectionManager,
  roomManager,
  jwtVerifier,
  rateLimiter: wsRateLimiter,
  metrics,
  redisPubSub,
  redisPresence,
  redisRoomSync,
});

setupHttpRoutes({
  app,
  config,
  connectionManager,
  messageRouter,
  roomManager,
  redisClient,
  httpRateLimiter,
  metrics,
});

// Start heartbeat
startHeartbeat(connectionManager, config.wsHeartbeatInterval, config.wsHeartbeatTimeout);

// Listen
let listenSocket: us_listen_socket | null = null;

app.listen(config.host, config.port, (token) => {
  if (token) {
    listenSocket = token;
    logger.info(
      { host: config.host, port: config.port, wsPath: config.wsPath },
      `LiveRelay listening on ${config.host}:${config.port}`,
    );

    setupGracefulShutdown({
      listenSocket,
      connectionManager,
      instanceId: config.instanceId,
      redisPubSub,
      redisClient,
      redisSubscriber,
      redisPublisher,
    });
  } else {
    logger.fatal({ host: config.host, port: config.port }, 'Failed to listen');
    process.exit(1);
  }
});
