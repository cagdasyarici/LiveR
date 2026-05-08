export interface SendEventPayload {
  target: string;
  event: string;
  data: unknown;
}

export interface BroadcastEventPayload {
  event: string;
  data: unknown;
}

export interface RoomSendPayload {
  event: string;
  data: unknown;
}
