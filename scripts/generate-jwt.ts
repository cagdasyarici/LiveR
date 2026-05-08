/**
 * JWT Token Generator — Helper script for testing LiveRelay.
 *
 * Usage:
 *   npx tsx scripts/generate-jwt.ts
 *   npx tsx scripts/generate-jwt.ts --user user-123 --rooms room:dashboard,room:chat --permissions send,subscribe
 *   npx tsx scripts/generate-jwt.ts --secret my-secret --expires 24h
 */

import jwt from 'jsonwebtoken';

function parseArgs(): {
  secret: string;
  userId: string;
  rooms: string[];
  permissions: string[];
  expiresIn: string;
} {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const val = args[i + 1];
    if (key && val) opts[key] = val;
  }

  return {
    secret: opts.secret ?? process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    userId: opts.user ?? `user-${Math.random().toString(36).slice(2, 8)}`,
    rooms: opts.rooms ? opts.rooms.split(',') : [],
    permissions: opts.permissions ? opts.permissions.split(',') : ['send', 'subscribe'],
    expiresIn: opts.expires ?? '1h',
  };
}

const config = parseArgs();

const payload = {
  sub: config.userId,
  rooms: config.rooms,
  permissions: config.permissions,
};

const token = jwt.sign(payload, config.secret, {
  algorithm: 'HS256',
  expiresIn: config.expiresIn,
});

console.log('\n=== LiveRelay JWT Token ===\n');
console.log('Payload:', JSON.stringify(payload, null, 2));
console.log('\nToken:\n', token);
console.log('\nWebSocket URL:');
console.log(`  ws://localhost:3001/ws?token=${token}`);
console.log('\ncURL test:');
console.log(`  curl http://localhost:3001/api/health`);
console.log('');
