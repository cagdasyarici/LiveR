import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { JwtVerifier } from '../../src/auth/JwtVerifier.js';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

function createToken(payload: Record<string, unknown>, secret = TEST_SECRET): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

describe('JwtVerifier', () => {
  const verifier = new JwtVerifier({
    secret: TEST_SECRET,
    algorithm: 'HS256',
  });

  describe('verify', () => {
    it('should verify a valid token', () => {
      const token = createToken({
        sub: 'user-123',
        rooms: ['room:dashboard'],
        permissions: ['send', 'subscribe'],
      });

      const result = verifier.verify(token);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-123');
      expect(result!.rooms).toEqual(['room:dashboard']);
      expect(result!.permissions).toEqual(['send', 'subscribe']);
    });

    it('should return defaults for missing optional fields', () => {
      const token = createToken({ sub: 'user-456' });

      const result = verifier.verify(token);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-456');
      expect(result!.rooms).toEqual([]);
      expect(result!.permissions).toEqual([]);
    });

    it('should return null for expired token', () => {
      const token = createToken({
        sub: 'user-789',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });

      const result = verifier.verify(token);
      expect(result).toBeNull();
    });

    it('should return null for invalid signature', () => {
      const token = createToken({ sub: 'user-111' }, 'wrong-secret');

      const result = verifier.verify(token);
      expect(result).toBeNull();
    });

    it('should return null for missing sub claim', () => {
      const token = createToken({ name: 'no-sub' });

      const result = verifier.verify(token);
      expect(result).toBeNull();
    });

    it('should return null for malformed token', () => {
      const result = verifier.verify('not.a.valid.token');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = verifier.verify('');
      expect(result).toBeNull();
    });
  });
});
