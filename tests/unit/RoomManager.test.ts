import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../../src/core/RoomManager.js';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager(50);
  });

  describe('subscribe', () => {
    it('should subscribe a user to a room', () => {
      const result = manager.subscribe('user1', 'room:test');

      expect(result).toBe(true);
      expect(manager.isMember('user1', 'room:test')).toBe(true);
      expect(manager.getMemberCount('room:test')).toBe(1);
    });

    it('should allow multiple users in same room', () => {
      manager.subscribe('user1', 'room:test');
      manager.subscribe('user2', 'room:test');

      expect(manager.getMemberCount('room:test')).toBe(2);
    });

    it('should allow same user in multiple rooms', () => {
      manager.subscribe('user1', 'room:a');
      manager.subscribe('user1', 'room:b');

      expect(manager.getRoomsForUser('user1')?.size).toBe(2);
    });

    it('should not duplicate user in same room', () => {
      manager.subscribe('user1', 'room:test');
      manager.subscribe('user1', 'room:test');

      expect(manager.getMemberCount('room:test')).toBe(1);
    });

    it('should reject when room limit per user is reached', () => {
      const smallManager = new RoomManager(2);
      smallManager.subscribe('user1', 'room:a');
      smallManager.subscribe('user1', 'room:b');
      const result = smallManager.subscribe('user1', 'room:c');

      expect(result).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('should remove user from room', () => {
      manager.subscribe('user1', 'room:test');
      const result = manager.unsubscribe('user1', 'room:test');

      expect(result).toBe(true);
      expect(manager.isMember('user1', 'room:test')).toBe(false);
    });

    it('should clean up empty rooms', () => {
      manager.subscribe('user1', 'room:test');
      manager.unsubscribe('user1', 'room:test');

      expect(manager.hasRoom('room:test')).toBe(false);
    });

    it('should return false for non-member', () => {
      const result = manager.unsubscribe('user1', 'room:nonexistent');
      expect(result).toBe(false);
    });

    it('should keep room if other members remain', () => {
      manager.subscribe('user1', 'room:test');
      manager.subscribe('user2', 'room:test');
      manager.unsubscribe('user1', 'room:test');

      expect(manager.hasRoom('room:test')).toBe(true);
      expect(manager.getMemberCount('room:test')).toBe(1);
    });
  });

  describe('removeUserFromAllRooms', () => {
    it('should remove user from all rooms', () => {
      manager.subscribe('user1', 'room:a');
      manager.subscribe('user1', 'room:b');
      manager.subscribe('user1', 'room:c');

      const removed = manager.removeUserFromAllRooms('user1');

      expect(removed).toHaveLength(3);
      expect(manager.getRoomsForUser('user1')).toBeUndefined();
    });

    it('should return empty array for unknown user', () => {
      const removed = manager.removeUserFromAllRooms('unknown');
      expect(removed).toHaveLength(0);
    });

    it('should clean up empty rooms after removal', () => {
      manager.subscribe('user1', 'room:solo');
      manager.removeUserFromAllRooms('user1');

      expect(manager.hasRoom('room:solo')).toBe(false);
    });
  });

  describe('getMembers', () => {
    it('should return room members', () => {
      manager.subscribe('user1', 'room:test');
      manager.subscribe('user2', 'room:test');

      const members = manager.getMembers('room:test');
      expect(members?.size).toBe(2);
      expect(members?.has('user1')).toBe(true);
      expect(members?.has('user2')).toBe(true);
    });

    it('should return undefined for non-existent room', () => {
      expect(manager.getMembers('room:nope')).toBeUndefined();
    });
  });

  describe('getAllRooms', () => {
    it('should list all active rooms', () => {
      manager.subscribe('user1', 'room:a');
      manager.subscribe('user2', 'room:b');

      const rooms = manager.getAllRooms();
      expect(rooms).toHaveLength(2);
    });
  });

  describe('roomCount', () => {
    it('should track room count', () => {
      expect(manager.roomCount).toBe(0);

      manager.subscribe('user1', 'room:a');
      expect(manager.roomCount).toBe(1);

      manager.subscribe('user2', 'room:b');
      expect(manager.roomCount).toBe(2);

      manager.unsubscribe('user1', 'room:a');
      expect(manager.roomCount).toBe(1);
    });
  });
});
