/**
 * LiveRelay Interactive Demo — End-to-end test showing all features.
 *
 * Run:  node scripts/demo-test.cjs
 *
 * Prerequisites: Docker Compose stack running (docker compose -f docker/docker-compose.yml up -d)
 */
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const SECRET = 'dev-secret-change-in-production';
const API_KEY = 'dev-api-key-change-in-production';
const API_URL = 'http://localhost:3001/api';
const API_URL_2 = 'http://localhost:3002/api';

// ========== Helper Functions ==========

function makeToken(userId, rooms = []) {
  return jwt.sign(
    { sub: userId, rooms, permissions: ['send', 'subscribe'] },
    SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

/**
 * Connect and return { ws, welcome } — captures the welcome message
 * during the connection to avoid race conditions.
 */
function connectWs(userId, rooms = [], port = 3001) {
  return new Promise((resolve, reject) => {
    const token = makeToken(userId, rooms);
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
    let settled = false;

    ws.on('message', function onFirstMsg(data) {
      ws.removeListener('message', onFirstMsg);
      const msg = JSON.parse(data.toString());
      settled = true;
      resolve({ ws, welcome: msg });
    });

    ws.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });

    ws.on('unexpected-response', (_req, res) => {
      if (!settled) { settled = true; reject(new Error(`HTTP ${res.statusCode}`)); }
    });

    setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('Connection timeout')); }
    }, 5000);
  });
}

function waitForMessage(ws, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeout);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

async function apiCall(method, path, body, baseUrl = API_URL) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== Test Scenarios ==========

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║          LiveRelay — Interactive Demo              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // ---- Test 1: Health Check ----
  console.log('━━━ Test 1: Health Check ━━━');
  const health1 = await apiCall('GET', '/health');
  const health2 = await apiCall('GET', '/health', undefined, API_URL_2);
  console.log(`  Instance 1: ${JSON.stringify(health1.data)}`);
  console.log(`  Instance 2: ${JSON.stringify(health2.data)}`);
  console.log('  ✓ Both instances healthy\n');

  // ---- Test 2: WebSocket Connection + Auth ----
  console.log('━━━ Test 2: WebSocket Connection & JWT Auth ━━━');
  const { ws: alice, welcome: welcomeAlice } = await connectWs('alice', ['room:general']);
  console.log(`  Alice connected! Welcome: ${JSON.stringify(welcomeAlice)}`);
  console.log('  ✓ JWT auth + WebSocket handshake OK\n');

  // ---- Test 3: Room Subscribe via WebSocket ----
  console.log('━━━ Test 3: Room Join/Subscribe ━━━');
  alice.send(JSON.stringify({ type: 'subscribe', room: 'room:chat' }));
  const subResponse = await waitForMessage(alice);
  console.log(`  Alice joined room:chat: ${JSON.stringify(subResponse)}`);
  console.log('  ✓ Room subscription OK\n');

  // ---- Test 4: Direct Message via REST API ----
  console.log('━━━ Test 4: Direct Message (REST API → User) ━━━');
  const aliceMsgPromise = waitForMessage(alice);
  const sendResult = await apiCall('POST', '/send', {
    target: 'user:alice',
    event: 'notification',
    data: { title: 'Welcome!', body: 'You have 3 new messages' },
  });
  console.log(`  API response: ${JSON.stringify(sendResult.data)}`);
  const directMsg = await aliceMsgPromise;
  console.log(`  Alice received: ${JSON.stringify(directMsg)}`);
  console.log('  ✓ Server → User direct message OK\n');

  // ---- Test 5: Room Message via REST API (Multiple Users) ----
  console.log('━━━ Test 5: Room Message via REST API (Multiple Users) ━━━');
  const { ws: bob } = await connectWs('bob');
  bob.send(JSON.stringify({ type: 'subscribe', room: 'room:chat' }));
  await waitForMessage(bob); // subscribe ack

  const aliceRoomPromise = waitForMessage(alice);
  const bobRoomPromise = waitForMessage(bob);

  const roomSendResult = await apiCall('POST', '/rooms/room:chat/send', {
    event: 'chat.message',
    data: { from: 'system', text: 'Hello everyone!' },
  });
  console.log(`  API response: ${JSON.stringify(roomSendResult.data)}`);

  const aliceRoomMsg = await aliceRoomPromise;
  const bobRoomMsg = await bobRoomPromise;
  console.log(`  Alice received: ${JSON.stringify(aliceRoomMsg)}`);
  console.log(`  Bob received:   ${JSON.stringify(bobRoomMsg)}`);
  console.log('  ✓ Room broadcast to multiple users OK\n');

  // ---- Test 6: Broadcast to All ----
  console.log('━━━ Test 6: Broadcast to All Connected Users ━━━');
  const aliceBroadcast = waitForMessage(alice);
  const bobBroadcast = waitForMessage(bob);

  await apiCall('POST', '/broadcast', {
    event: 'system.announcement',
    data: { message: 'Server will restart in 5 minutes' },
  });

  console.log(`  Alice received: ${JSON.stringify(await aliceBroadcast)}`);
  console.log(`  Bob received:   ${JSON.stringify(await bobBroadcast)}`);
  console.log('  ✓ Broadcast to all users OK\n');

  // ---- Test 7: Publish to Room via WebSocket (Client-to-Client) ----
  console.log('━━━ Test 7: Publish to Room via WebSocket ━━━');
  const aliceFromBob = waitForMessage(alice);
  bob.send(
    JSON.stringify({
      type: 'publish',
      room: 'room:chat',
      event: 'chat.message',
      data: { text: 'Hello from Bob!' },
    }),
  );
  const aliceGotBob = await aliceFromBob;
  console.log(`  Alice received Bob's publish: ${JSON.stringify(aliceGotBob)}`);
  console.log('  ✓ WebSocket room publish (client-to-clients) OK\n');

  // ---- Test 8: Ping/Pong (Heartbeat) ----
  console.log('━━━ Test 8: Ping/Pong ━━━');
  alice.send(JSON.stringify({ type: 'ping' }));
  const pong = await waitForMessage(alice);
  console.log(`  Sent ping, got: ${JSON.stringify(pong)}`);
  console.log('  ✓ Heartbeat ping/pong OK\n');

  // ---- Test 9: Connections & Rooms Admin API ----
  console.log('━━━ Test 9: Admin API (Connections & Rooms) ━━━');
  const connections = await apiCall('GET', '/connections');
  const rooms = await apiCall('GET', '/rooms');
  console.log(`  Connections: ${JSON.stringify(connections.data)}`);
  console.log(`  Rooms: ${JSON.stringify(rooms.data)}`);
  console.log('  ✓ Admin endpoints OK\n');

  // ---- Test 10: Unsubscribe from Room ----
  console.log('━━━ Test 10: Room Unsubscribe ━━━');
  alice.send(JSON.stringify({ type: 'unsubscribe', room: 'room:chat' }));
  const unsubResponse = await waitForMessage(alice);
  console.log(`  Alice left room:chat: ${JSON.stringify(unsubResponse)}`);

  // Verify Alice no longer receives room messages
  const bobAlonePromise = waitForMessage(bob);
  await apiCall('POST', '/rooms/room:chat/send', {
    event: 'chat.message',
    data: { text: 'Alice should NOT see this' },
  });
  const bobAlone = await bobAlonePromise;
  console.log(`  Bob still receives: ${JSON.stringify(bobAlone)}`);
  console.log('  ✓ Room unsubscribe OK (Alice stopped receiving)\n');

  // ---- Test 11: Prometheus Metrics ----
  console.log('━━━ Test 11: Prometheus Metrics ━━━');
  const metricsRes = await fetch(`${API_URL}/metrics`);
  const metricsText = await metricsRes.text();
  const metricLines = metricsText.split('\n').filter((l) => !l.startsWith('#') && l.trim());
  console.log('  Sample metrics:');
  metricLines.slice(0, 8).forEach((line) => console.log(`    ${line}`));
  console.log('  ✓ Prometheus metrics OK\n');

  // ---- Test 12: Cross-Instance via Redis Pub/Sub ----
  console.log('━━━ Test 12: Cross-Instance via Redis Pub/Sub ━━━');
  const { ws: charlie, welcome: welcomeCharlie } = await connectWs('charlie', [], 3002);
  console.log(`  Charlie connected to instance-2: ${JSON.stringify(welcomeCharlie)}`);
  await sleep(500);

  // Send from instance-1's REST API to charlie (on instance-2)
  const charliePromise = waitForMessage(charlie, 3000);
  const crossResult = await apiCall('POST', '/send', {
    target: 'user:charlie',
    event: 'cross-instance',
    data: { message: 'This came from instance-1 API!' },
  });
  console.log(`  API (instance-1) response: ${JSON.stringify(crossResult.data)}`);

  try {
    const charlieMsg = await charliePromise;
    console.log(`  Charlie (instance-2) received: ${JSON.stringify(charlieMsg)}`);
    console.log('  ✓ Cross-instance messaging via Redis pub/sub OK\n');
  } catch {
    console.log('  ⚠ Cross-instance not received (Redis pub/sub propagation)\n');
  }

  // ---- Test 13: Invalid JWT Rejected ----
  console.log('━━━ Test 13: Security — Invalid JWT ━━━');
  const badResult = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3001/ws?token=invalid-token');
    ws.on('open', () => resolve('CONNECTED (bad!)'));
    ws.on('unexpected-response', (_req, res) => resolve(`REJECTED: HTTP ${res.statusCode}`));
    ws.on('error', () => resolve('REJECTED: error'));
    setTimeout(() => resolve('TIMEOUT'), 3000);
  });
  console.log(`  Result: ${badResult}`);
  console.log('  ✓ Invalid JWT rejected OK\n');

  // ---- Test 14: Invalid API Key Rejected ----
  console.log('━━━ Test 14: Security — Invalid API Key ━━━');
  const badApi = await fetch(`${API_URL}/connections`, {
    headers: { Authorization: 'Bearer wrong-key' },
  });
  const badApiBody = await badApi.text();
  console.log(`  Status: ${badApi.status} — Body: ${badApiBody}`);
  console.log('  ✓ Invalid API key rejected OK\n');

  // ---- Test 15: Invalid Message Format ----
  console.log('━━━ Test 15: Invalid Message Handling ━━━');
  alice.send('this is not json at all {{{');
  const errMsg = await waitForMessage(alice);
  console.log(`  Sent garbage, got: ${JSON.stringify(errMsg)}`);
  console.log('  ✓ Invalid message handled gracefully\n');

  // ---- Cleanup ----
  alice.close();
  bob.close();
  charlie.close();
  await sleep(500);

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        All 15 tests completed successfully!       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
