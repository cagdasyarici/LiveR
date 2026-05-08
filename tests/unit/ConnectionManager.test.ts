import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionManager } from '../../src/core/ConnectionManager.js';
import type { LiveRelayWebSocket, UserData } from '../../src/types/connection.js';

function createMockWs(userId: string, connectionId: string): LiveRelayWebSocket {
  const userData: UserData = {
    userId,
    connectionId,
    rooms: [],
    permissions: [],
    connectedAt: Date.now(),
    lastPong: Date.now(),
  };

  const sent: string[] = [];

  return {
    getUserData: () => userData,
    send: (message: string) => {
      sent.push(message);
      return 1;
    },
    end: () => {},
    close: () => {},
    subscribe: () => true,
    unsubscribe: () => true,
    publish: () => true,
    // Expose sent messages for testing
    _sent: sent,
  } as unknown as LiveRelayWebSocket;
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager(100);
  });

  describe('add', () => {
    it('should add a connection', () => {
      const ws = createMockWs('user1', 'conn1');
      const result = manager.add(ws);

      expect(result).toBe(true);
      expect(manager.size).toBe(1);
    });

    it('should track multiple connections per user', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user1', 'conn2');

      manager.add(ws1);
      manager.add(ws2);

      expect(manager.size).toBe(2);
      expect(manager.getByUserId('user1')?.size).toBe(2);
    });

    it('should reject when connection limit is reached', () => {
      const smallManager = new ConnectionManager(2);
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user2', 'conn2');
      const ws3 = createMockWs('user3', 'conn3');

      expect(smallManager.add(ws1)).toBe(true);
      expect(smallManager.add(ws2)).toBe(true);
      expect(smallManager.add(ws3)).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a connection', () => {
      const ws = createMockWs('user1', 'conn1');
      manager.add(ws);
      manager.remove(ws);

      expect(manager.size).toBe(0);
      expect(manager.getByUserId('user1')).toBeUndefined();
    });

    it('should keep other connections for same user', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user1', 'conn2');

      manager.add(ws1);
      manager.add(ws2);
      manager.remove(ws1);

      expect(manager.size).toBe(1);
      expect(manager.getByUserId('user1')?.size).toBe(1);
    });
  });

  describe('getByConnectionId', () => {
    it('should return the correct websocket', () => {
      const ws = createMockWs('user1', 'conn1');
      manager.add(ws);

      expect(manager.getByConnectionId('conn1')).toBe(ws);
    });

    it('should return undefined for unknown id', () => {
      expect(manager.getByConnectionId('unknown')).toBeUndefined();
    });
  });

  describe('sendToUser', () => {
    it('should send message to all user connections', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user1', 'conn2');

      manager.add(ws1);
      manager.add(ws2);

      const sent = manager.sendToUser('user1', {
        type: 'message',
        room: 'test',
        event: 'test',
        data: { hello: 'world' },
        timestamp: Date.now(),
      });

      expect(sent).toBe(2);
    });

    it('should return 0 for unknown user', () => {
      const sent = manager.sendToUser('unknown', {
        type: 'pong',
      });
      expect(sent).toBe(0);
    });
  });

  describe('broadcastAll', () => {
    it('should send message to all connections', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user2', 'conn2');

      manager.add(ws1);
      manager.add(ws2);

      const sent = manager.broadcastAll({
        type: 'system',
        event: 'test',
        data: {},
      });

      expect(sent).toBe(2);
    });
  });

  describe('isUserOnline', () => {
    it('should return true for connected user', () => {
      const ws = createMockWs('user1', 'conn1');
      manager.add(ws);

      expect(manager.isUserOnline('user1')).toBe(true);
    });

    it('should return false for disconnected user', () => {
      expect(manager.isUserOnline('user1')).toBe(false);
    });

    it('should return false after user disconnects', () => {
      const ws = createMockWs('user1', 'conn1');
      manager.add(ws);
      manager.remove(ws);

      expect(manager.isUserOnline('user1')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user1', 'conn2');
      const ws3 = createMockWs('user2', 'conn3');

      manager.add(ws1);
      manager.add(ws2);
      manager.add(ws3);

      const stats = manager.getStats();
      expect(stats.total).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
    });
  });

  describe('closeAll', () => {
    it('should clear all connections', () => {
      const ws1 = createMockWs('user1', 'conn1');
      const ws2 = createMockWs('user2', 'conn2');

      manager.add(ws1);
      manager.add(ws2);
      manager.closeAll(1001, 'shutdown');

      expect(manager.size).toBe(0);
    });
  });
});
