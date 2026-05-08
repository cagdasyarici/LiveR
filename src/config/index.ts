import { z } from 'zod';
import { DEFAULTS } from './constants.js';

const configSchema = z.object({
  // Server
  port: z.coerce.number().int().min(1).max(65535).default(DEFAULTS.PORT),
  host: z.string().default(DEFAULTS.HOST),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  instanceId: z.string().min(1).default(DEFAULTS.INSTANCE_ID),

  // WebSocket
  wsPath: z.string().startsWith('/').default(DEFAULTS.WS_PATH),
  wsMaxPayloadSize: z.coerce.number().int().positive().default(DEFAULTS.WS_MAX_PAYLOAD_SIZE),
  wsHeartbeatInterval: z.coerce.number().int().positive().default(DEFAULTS.WS_HEARTBEAT_INTERVAL),
  wsHeartbeatTimeout: z.coerce.number().int().positive().default(DEFAULTS.WS_HEARTBEAT_TIMEOUT),
  wsMaxConnections: z.coerce.number().int().positive().default(DEFAULTS.WS_MAX_CONNECTIONS),
  wsMaxRoomsPerConnection: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULTS.WS_MAX_ROOMS_PER_CONNECTION),

  // Auth
  jwtSecret: z.string().min(1),
  jwtPublicKey: z.string().optional(),
  jwtAlgorithm: z.enum(['HS256', 'RS256']).default('HS256'),
  apiKey: z.string().min(1),

  // Redis
  redisUrl: z.string().url().default(DEFAULTS.REDIS_URL),
  redisPassword: z.string().optional(),
  redisDb: z.coerce.number().int().min(0).max(15).default(DEFAULTS.REDIS_DB),
  redisKeyPrefix: z.string().default(DEFAULTS.REDIS_KEY_PREFIX),

  // Rate Limiting
  rateLimitWindow: z.coerce.number().int().positive().default(DEFAULTS.RATE_LIMIT_WINDOW),
  rateLimitMaxMessages: z.coerce.number().int().positive().default(DEFAULTS.RATE_LIMIT_MAX_MESSAGES),
  rateLimitMaxRequests: z.coerce.number().int().positive().default(DEFAULTS.RATE_LIMIT_MAX_REQUESTS),

  // Logging
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error', 'fatal'])
    .default(DEFAULTS.LOG_LEVEL as 'info'),
  logFormat: z.enum(['json', 'pretty']).default(DEFAULTS.LOG_FORMAT as 'json'),

  // Metrics
  metricsEnabled: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(DEFAULTS.METRICS_ENABLED),
  metricsPath: z.string().startsWith('/').default(DEFAULTS.METRICS_PATH),

  // Cluster
  clusterEnabled: z
    .preprocess((val) => val === 'true' || val === true, z.boolean())
    .default(DEFAULTS.CLUSTER_ENABLED),
  clusterWorkers: z.coerce.number().int().min(0).default(DEFAULTS.CLUSTER_WORKERS),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    port: process.env.PORT,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV,
    instanceId: process.env.INSTANCE_ID,

    wsPath: process.env.WS_PATH,
    wsMaxPayloadSize: process.env.WS_MAX_PAYLOAD_SIZE,
    wsHeartbeatInterval: process.env.WS_HEARTBEAT_INTERVAL,
    wsHeartbeatTimeout: process.env.WS_HEARTBEAT_TIMEOUT,
    wsMaxConnections: process.env.WS_MAX_CONNECTIONS,
    wsMaxRoomsPerConnection: process.env.WS_MAX_ROOMS_PER_CONNECTION,

    jwtSecret: process.env.JWT_SECRET,
    jwtPublicKey: process.env.JWT_PUBLIC_KEY || undefined,
    jwtAlgorithm: process.env.JWT_ALGORITHM,
    apiKey: process.env.API_KEY,

    redisUrl: process.env.REDIS_URL,
    redisPassword: process.env.REDIS_PASSWORD || undefined,
    redisDb: process.env.REDIS_DB,
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX,

    rateLimitWindow: process.env.RATE_LIMIT_WINDOW,
    rateLimitMaxMessages: process.env.RATE_LIMIT_MAX_MESSAGES,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,

    logLevel: process.env.LOG_LEVEL,
    logFormat: process.env.LOG_FORMAT,

    metricsEnabled: process.env.METRICS_ENABLED,
    metricsPath: process.env.METRICS_PATH,

    clusterEnabled: process.env.CLUSTER_ENABLED,
    clusterWorkers: process.env.CLUSTER_WORKERS,
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formatted = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${formatted}`);
  }

  return result.data;
}

export const config = loadConfig();
