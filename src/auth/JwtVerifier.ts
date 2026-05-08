import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { logger } from '../monitoring/logger.js';
import type { AuthResult, JwtPayload } from './types.js';

export class JwtVerifier {
  private readonly secret: string | Buffer;
  private readonly algorithm: jwt.Algorithm;

  constructor(options: { secret: string; publicKeyPath?: string; algorithm: string }) {
    this.algorithm = options.algorithm as jwt.Algorithm;

    if (options.algorithm === 'RS256' && options.publicKeyPath) {
      this.secret = readFileSync(options.publicKeyPath);
    } else {
      this.secret = options.secret;
    }
  }

  verify(token: string): AuthResult | null {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: [this.algorithm],
      }) as JwtPayload;

      if (!decoded.sub) {
        logger.warn('JWT missing sub claim');
        return null;
      }

      return {
        userId: decoded.sub,
        rooms: decoded.rooms ?? [],
        permissions: decoded.permissions ?? [],
      };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        logger.debug({ err }, 'JWT token expired');
      } else if (err instanceof jwt.JsonWebTokenError) {
        logger.debug({ err }, 'JWT verification failed');
      } else {
        logger.error({ err }, 'Unexpected JWT verification error');
      }
      return null;
    }
  }
}
