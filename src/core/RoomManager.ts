import { logger } from '../monitoring/logger.js';

export interface RoomInfo {
  id: string;
  members: Set<string>;
  createdAt: number;
}

export class RoomManager {
  // roomId → RoomInfo
  private readonly rooms = new Map<string, RoomInfo>();
  // userId → Set<roomId>
  private readonly userRooms = new Map<string, Set<string>>();
  private readonly maxRoomsPerUser: number;

  constructor(maxRoomsPerUser: number) {
    this.maxRoomsPerUser = maxRoomsPerUser;
  }

  subscribe(userId: string, roomId: string): boolean {
    // Check per-user room limit
    const userRoomSet = this.userRooms.get(userId);
    if (userRoomSet && userRoomSet.size >= this.maxRoomsPerUser) {
      logger.warn({ userId, roomId, max: this.maxRoomsPerUser }, 'User room limit reached');
      return false;
    }

    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, members: new Set(), createdAt: Date.now() };
      this.rooms.set(roomId, room);
    }

    // Add user to room
    room.members.add(userId);

    // Track user's rooms
    if (!userRoomSet) {
      const newSet = new Set<string>();
      newSet.add(roomId);
      this.userRooms.set(userId, newSet);
    } else {
      userRoomSet.add(roomId);
    }

    logger.debug({ userId, roomId, memberCount: room.members.size }, 'User subscribed to room');
    return true;
  }

  unsubscribe(userId: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const removed = room.members.delete(userId);

    // Clean up empty rooms
    if (room.members.size === 0) {
      this.rooms.delete(roomId);
    }

    // Update user's room set
    const userRoomSet = this.userRooms.get(userId);
    if (userRoomSet) {
      userRoomSet.delete(roomId);
      if (userRoomSet.size === 0) {
        this.userRooms.delete(userId);
      }
    }

    if (removed) {
      logger.debug({ userId, roomId }, 'User unsubscribed from room');
    }
    return removed;
  }

  removeUserFromAllRooms(userId: string): string[] {
    const userRoomSet = this.userRooms.get(userId);
    if (!userRoomSet) return [];

    const removedFrom: string[] = [];

    for (const roomId of userRoomSet) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.members.delete(userId);
        removedFrom.push(roomId);
        if (room.members.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }

    this.userRooms.delete(userId);
    return removedFrom;
  }

  getMembers(roomId: string): Set<string> | undefined {
    return this.rooms.get(roomId)?.members;
  }

  getMemberCount(roomId: string): number {
    return this.rooms.get(roomId)?.members.size ?? 0;
  }

  getRoomsForUser(userId: string): Set<string> | undefined {
    return this.userRooms.get(userId);
  }

  getRoomInfo(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  isMember(userId: string, roomId: string): boolean {
    return this.rooms.get(roomId)?.members.has(userId) ?? false;
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}
