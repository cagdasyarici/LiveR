import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageRouter } from '../../src/core/MessageRouter.js';
import { ConnectionManager } from '../../src/core/ConnectionManager.js';
import { RoomManager } from '../../src/core/RoomManager.js';
import type { TemplatedApp } from 'uWebSockets.js';

function createMockApp(): TemplatedApp {
  return {
    publish: vi.fn(),
  } as unknown as TemplatedApp;
}

function createMockWs(userId: string, connectionId: string) {
  return {
    getUserData: () => ({
      userId,
      connectionId,
      rooms: [],
      permissions: [],
      connectedAt: Date.now(),
      lastPong: Date.now(),
    }),
    send: vi.fn(() => 1),
    end: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn(() => true),
    unsubscribe: vi.fn(() => true),
    publish: vi.fn(() => true),
  } as unknown as import('../../src/types/connection.js').LiveRelayWebSocket;
}

describe('MessageRouter', () => {
  let app: TemplatedApp;
  let connectionManager: ConnectionManager;
  let roomManager: RoomManager;
  let router: MessageRouter;

  beforeEach(() => {
    app = createMockApp();
    connectionManager = new ConnectionManager(100);
    roomManager = new RoomManager(50);
    router = new MessageRouter(app, connectionManager, roomManager);
  });

  describe('sendToTarget', () => {
    it('should send to a specific user', () => {
      const ws = createMockWs('user-abc', 'conn-1');
      connectionManager.add(ws);

      const result = router.sendToTarget('user:user-abc', 'notification', { title: 'Hello' });

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(1);
      expect(ws.send).toHaveBeenCalled();
    });

    it('should return delivered=0 for offline user', () => {
      const result = router.sendToTarget('user:offline-user', 'notification', {});

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(0);
    });

    it('should publish to room via uWS', () => {
      roomManager.subscribe('user1', 'room:dashboard');
      roomManager.subscribe('user2', 'room:dashboard');

      const result = router.sendToTarget('room:dashboard', 'update', { data: 1 });

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(2);
      expect(app.publish).toHaveBeenCalled();
    });
  });

  describe('sendToRoom', () => {
    it('should publish to a room and return member count', () => {
      roomManager.subscribe('user1', 'room:stocks');
      roomManager.subscribe('user2', 'room:stocks');
      roomManager.subscribe('user3', 'room:stocks');

      const result = router.sendToRoom('room:stocks', 'price-update', { price: 42.5 });

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(3);
      expect(result.room).toBe('room:stocks');
      expect(app.publish).toHaveBeenCalledWith('room:stocks', expect.any(String), false);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to all connections via uWS topic', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user2', 'conn2');
      connectionManager.add(ws1);
      connectionManager.add(ws2);

      const result = router.broadcast('system:maintenance', { message: 'Restarting' });

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(2);
      expect(app.publish).toHaveBeenCalledWith('broadcast', expect.any(String), false);
    });

    it('should return 0 delivered when no connections', () => {
      const result = router.broadcast('test', {});

      expect(result.success).toBe(true);
      expect(result.delivered).toBe(0);
    });
  });
});
