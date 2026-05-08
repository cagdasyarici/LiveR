export interface JwtPayload {
  sub: string;
  rooms?: string[];
  permissions?: string[];
  exp: number;
  iat?: number;
}

export interface AuthResult {
  userId: string;
  rooms: string[];
  permissions: string[];
}
