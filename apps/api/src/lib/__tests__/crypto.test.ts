import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateSessionId,
  generateResetToken,
  hashResetToken,
  timingSafeDelay,
} from '../crypto.js';

describe('crypto utilities', () => {
  describe('hashPassword', () => {
    it('returns argon2id hash', async () => {
      const hash = await hashPassword('testpassword');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('creates unique hashes for same input (different salts)', async () => {
      const hash1 = await hashPassword('testpassword');
      const hash2 = await hashPassword('testpassword');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty password', async () => {
      const hash = await hashPassword('');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('handles long password', async () => {
      const longPassword = 'a'.repeat(72);
      const hash = await hashPassword(longPassword);
      expect(hash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for matching password', async () => {
      const hash = await hashPassword('correctpassword');
      const result = await verifyPassword('correctpassword', hash);
      expect(result).toBe(true);
    });

    it('returns false for wrong password', async () => {
      const hash = await hashPassword('correctpassword');
      const result = await verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });

    it('returns false for empty password when hash is not empty', async () => {
      const hash = await hashPassword('somepassword');
      const result = await verifyPassword('', hash);
      expect(result).toBe(false);
    });

    it('handles case sensitivity', async () => {
      const hash = await hashPassword('Password');
      const result = await verifyPassword('password', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateSessionId', () => {
    it('returns 64-char hex string (32 bytes)', () => {
      const sid = generateSessionId();
      expect(sid).toMatch(/^[a-f0-9]{64}$/);
      expect(sid).toHaveLength(64);
    });

    it('generates unique values', () => {
      const sids = new Set(Array.from({ length: 100 }, generateSessionId));
      expect(sids.size).toBe(100);
    });
  });

  describe('generateResetToken', () => {
    it('returns 64-char hex string (32 bytes)', () => {
      const token = generateResetToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(token).toHaveLength(64);
    });

    it('generates unique values', () => {
      const tokens = new Set(Array.from({ length: 100 }, generateResetToken));
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashResetToken', () => {
    it('returns deterministic SHA-256 hash', () => {
      const hash1 = hashResetToken('token123');
      const hash2 = hashResetToken('token123');
      expect(hash1).toBe(hash2);
    });

    it('returns 64-char hex string', () => {
      const hash = hashResetToken('anytoken');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toHaveLength(64);
    });

    it('produces different hashes for different inputs', () => {
      const hash1 = hashResetToken('token1');
      const hash2 = hashResetToken('token2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('timingSafeDelay', () => {
    it('delays between 100-150ms', async () => {
      const start = Date.now();
      await timingSafeDelay();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(200); // Allow some overhead
    });

    it('has random jitter (multiple calls vary)', async () => {
      const delays: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await timingSafeDelay();
        delays.push(Date.now() - start);
      }
      // Check that delays are not all identical (high probability with jitter)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });
});
