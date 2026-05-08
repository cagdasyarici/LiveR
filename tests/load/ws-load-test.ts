/**
 * WebSocket Load Test for LiveRelay
 *
 * Usage:
 *   npx tsx tests/load/ws-load-test.ts
 *   npx tsx tests/load/ws-load-test.ts --connections 1000 --duration 30 --msgRate 10
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

interface LoadTestConfig {
  url: string;
  secret: string;
  connections: number;
  duration: number;
  msgRate: number;
}

function parseArgs(): LoadTestConfig {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const val = args[i + 1];
    if (key && val) opts[key] = val;
  }

  return {
    url: opts.url ?? 'ws://localhost:3001/ws',
    secret: opts.secret ?? process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    connections: parseInt(opts.connections ?? '100'),
    duration: parseInt(opts.duration ?? '10'),
    msgRate: parseInt(opts.msgRate ?? '5'),
  };
}

function generateToken(secret: string, userId: string): string {
  return jwt.sign(
    { sub: userId, rooms: ['room:loadtest'], permissions: ['send', 'subscribe'] },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

const config = parseArgs();

console.log('\n=== LiveRelay WebSocket Load Test ===\n');
console.log(`  Target:      ${config.url}`);
console.log(`  Connections:  ${config.connections}`);
console.log(`  Duration:     ${config.duration}s`);
console.log(`  Msg rate:     ${config.msgRate} msg/s per connection`);
console.log('');

const stats = {
  connected: 0,
  failed: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0,
  startTime: Date.now(),
};

const sockets: WebSocket[] = [];

async function connectClient(index: number): Promise<void> {
  const userId = `loadtest-user-${index}`;
  const token = generateToken(config.secret, userId);

  return new Promise((resolve) => {
    const ws = new WebSocket(`${config.url}?token=${token}`);

    ws.on('open', () => {
      stats.connected++;
      sockets.push(ws);

      // Subscribe to loadtest room
      ws.send(JSON.stringify({ type: 'subscribe', room: 'room:loadtest' }));
      resolve();
    });

    ws.on('message', () => {
      stats.messagesReceived++;
    });

    ws.on('error', () => {
      stats.errors++;
      stats.failed++;
      resolve();
    });

    ws.on('close', () => {
      // Expected on shutdown
    });

    // Timeout
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        stats.failed++;
        resolve();
      }
    }, 5000);
  });
}

async function run(): Promise<void> {
  // Phase 1: Connect all clients
  console.log(`Connecting ${config.connections} clients...`);

  const batchSize = 50;
  for (let i = 0; i < config.connections; i += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, config.connections - i) },
      (_, j) => connectClient(i + j),
    );
    await Promise.all(batch);
    process.stdout.write(`  ${stats.connected}/${config.connections} connected\r`);
  }

  console.log(`\nConnected: ${stats.connected}, Failed: ${stats.failed}\n`);

  // Phase 2: Send messages
  console.log(`Sending messages for ${config.duration}s...`);

  const msgInterval = 1000 / config.msgRate;
  const timers: ReturnType<typeof setInterval>[] = [];

  for (const ws of sockets) {
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'publish',
            room: 'room:loadtest',
            event: 'load-test',
            data: { ts: Date.now() },
          }),
        );
        stats.messagesSent++;
      }
    }, msgInterval);
    timers.push(timer);
  }

  // Progress reporting
  const progressTimer = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const msgPerSec = Math.round(stats.messagesSent / elapsed);
    process.stdout.write(
      `  Sent: ${stats.messagesSent} | Recv: ${stats.messagesReceived} | Rate: ${msgPerSec} msg/s\r`,
    );
  }, 1000);

  // Wait for duration
  await new Promise((resolve) => setTimeout(resolve, config.duration * 1000));

  // Cleanup
  clearInterval(progressTimer);
  for (const timer of timers) clearInterval(timer);

  // Phase 3: Results
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const avgMsgPerSec = Math.round(stats.messagesSent / elapsed);

  console.log('\n\n=== Results ===\n');
  console.log(`  Duration:         ${elapsed.toFixed(1)}s`);
  console.log(`  Connections:      ${stats.connected}`);
  console.log(`  Failed:           ${stats.failed}`);
  console.log(`  Messages Sent:    ${stats.messagesSent.toLocaleString()}`);
  console.log(`  Messages Recv:    ${stats.messagesReceived.toLocaleString()}`);
  console.log(`  Avg msg/s:        ${avgMsgPerSec.toLocaleString()}`);
  console.log(`  Errors:           ${stats.errors}`);
  console.log('');

  // Close all
  for (const ws of sockets) {
    ws.close();
  }

  process.exit(0);
}

void run();
