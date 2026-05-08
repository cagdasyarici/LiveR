import type { ServerMessage, ClientMessage } from './messages.js';
import { clientMessageSchema } from './messages.js';

export function serialize(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function deserialize(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = clientMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}
