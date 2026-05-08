import pino from 'pino';

function createLogger(level: string = 'info', format: string = 'json'): pino.Logger {
  const options: pino.LoggerOptions = {
    level,
    ...(format === 'pretty'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  };

  return pino(options);
}

// Logger is initialized with defaults, re-created after config loads
let logger = createLogger(
  process.env.LOG_LEVEL ?? 'info',
  process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'development' ? 'pretty' : 'json'),
);

export function initLogger(level: string, format: string): void {
  logger = createLogger(level, format);
}

export { logger };
