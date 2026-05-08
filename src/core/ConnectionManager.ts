import type { LiveRelayWebSocket, ConnectionStats } from '../types/connection.js';
import { serialize } from '../protocol/serializer.js';
import type { ServerMessage } from '../protocol/messages.js';
import { logger } from '../monitoring/logger.js';

export class ConnectionManager {
  // userId → Set of WebSockets
  private readonly userConnections = new Map<string, Set<LiveRelayWebSocket>>();
  // connectionId → WebSocket
  private readonly connections = new Map<string, LiveRelayWebSocket>();
  private readonly maxConnections: number;

  constructor(maxConnections: number) {
    this.maxConnections = maxConnections;
  }

  add(ws: LiveRelayWebSocket): boolean {
    if (this.connections.size >= this.maxConnections) {
      logger.warn({ max: this.maxConnections }, 'Connection limit reached');
      return false;
    }

    const { userId, connectionId } = ws.getUserData();

    this.connections.set(connectionId, ws);

    let userSet = this.userConnections.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.userConnections.set(userId, userSet);
    }
    userSet.add(ws);

    logger.debug({ userId, connectionId, total: this.connections.size }, 'Connection added');
    return true;
  }

  remove(ws: LiveRelayWebSocket): void {
    const { userId, connectionId } = ws.getUserData();

    this.connections.delete(connectionId);

    const userSet = this.userConnections.get(userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    logger.debug({ userId, connectionId, total: this.connections.size }, 'Connection removed');
  }

  getByConnectionId(connectionId: string): LiveRelayWebSocket | undefined {
    return this.connections.get(connectionId);
  }

  getByUserId(userId: string): Set<LiveRelayWebSocket> | undefined {
    return this.userConnections.get(userId);
  }

  sendToUser(userId: string, message: ServerMessage): number {
    const userSet = this.userConnections.get(userId);
    if (!userSet) return 0;

    const payload = serialize(message);
    let sent = 0;
    for (const ws of userSet) {
      ws.send(payload, false);
      sent++;
    }
    return sent;
  }

  sendToConnection(connectionId: string, message: ServerMessage): boolean {
    const ws = this.connections.get(connectionId);
    if (!ws) return false;
    ws.send(serialize(message), false);
    return true;
  }

  broadcastAll(message: ServerMessage): number {
    const payload = serialize(message);
    let sent = 0;
    for (const ws of this.connections.values()) {
      ws.send(payload, false);
      sent++;
    }
    return sent;
  }

  closeAll(code: number, message: string): void {
    for (const ws of this.connections.values()) {
      ws.end(code, message);
    }
    this.connections.clear();
    this.userConnections.clear();
  }

  isUserOnline(userId: string): boolean {
    const userSet = this.userConnections.get(userId);
    return userSet !== undefined && userSet.size > 0;
  }

  getStats(): ConnectionStats {
    return {
      total: this.connections.size,
      uniqueUsers: this.userConnections.size,
    };
  }

  getAllConnections(): IterableIterator<LiveRelayWebSocket> {
    return this.connections.values();
  }

  get size(): number {
    return this.connections.size;
  }
}
