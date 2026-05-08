import { z } from 'zod';

// --- Client → Server Messages ---

export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  room: z.string().min(1),
});

export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  room: z.string().min(1),
});

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
});

export const publishMessageSchema = z.object({
  type: z.literal('publish'),
  room: z.string().min(1),
  event: z.string().min(1),
  data: z.unknown(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  pingMessageSchema,
  publishMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- Server → Client Messages ---

export interface WelcomeMessage {
  type: 'welcome';
  connectionId: string;
  userId: string;
}

export interface SubscribedMessage {
  type: 'subscribed';
  room: string;
}

export interface UnsubscribedMessage {
  type: 'unsubscribed';
  room: string;
}

export interface IncomingMessage {
  type: 'message';
  room: string;
  event: string;
  data: unknown;
  timestamp: number;
}

export interface PongMessage {
  type: 'pong';
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface SystemMessage {
  type: 'system';
  event: string;
  data: unknown;
}

export type ServerMessage =
  | WelcomeMessage
  | SubscribedMessage
  | UnsubscribedMessage
  | IncomingMessage
  | PongMessage
  | ErrorMessage
  | SystemMessage;
