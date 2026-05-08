export enum ErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  CONNECTION_LIMIT = 'CONNECTION_LIMIT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ProtocolError {
  type: 'error';
  code: ErrorCode;
  message: string;
}

export function createError(code: ErrorCode, message: string): ProtocolError {
  return { type: 'error', code, message };
}
