import type { WebSocket } from 'uWebSockets.js';

export interface UserData {
  userId: string;
  connectionId: string;
  rooms: string[];
  permissions: string[];
  connectedAt: number;
  lastPong: number;
}

export type LiveRelayWebSocket = WebSocket<UserData>;

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  rooms: string[];
  connectedAt: number;
}

export interface ConnectionStats {
  total: number;
  uniqueUsers: number;
}
