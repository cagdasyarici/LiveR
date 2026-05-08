import { nanoid } from 'nanoid';

export function generateConnectionId(): string {
  return `conn_${nanoid(16)}`;
}

export function generateInstanceId(): string {
  return `inst_${nanoid(8)}`;
}
