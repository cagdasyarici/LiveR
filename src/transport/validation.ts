import { z } from 'zod';

export const sendMessageSchema = z.object({
  target: z.string().min(1),
  event: z.string().min(1),
  data: z.unknown(),
});

export const broadcastMessageSchema = z.object({
  event: z.string().min(1),
  data: z.unknown(),
});

export const roomSendMessageSchema = z.object({
  event: z.string().min(1),
  data: z.unknown(),
});

export type SendMessagePayload = z.infer<typeof sendMessageSchema>;
export type BroadcastMessagePayload = z.infer<typeof broadcastMessageSchema>;
export type RoomSendMessagePayload = z.infer<typeof roomSendMessageSchema>;
