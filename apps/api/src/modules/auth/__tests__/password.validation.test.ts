import { describe, it, expect } from 'vitest';
import { forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from '@crm/shared';

// =============================================================================
// forgotPasswordSchema Validation
// =============================================================================

describe('forgotPasswordSchema', () => {
  describe('email', () => {
    it('rejects missing email', () => {
      const result = forgotPasswordSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects invalid email format', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'notanemail' });
      expect(result.success).toBe(false);
    });

    it('transforms email to lowercase', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'USER@EXAMPLE.COM' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
      }
    });

    it('accepts valid email', () => {
      const result = forgotPasswordSchema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// resetPasswordSchema Validation
// =============================================================================

describe('resetPasswordSchema', () => {
  describe('token', () => {
    it('rejects missing token', () => {
      const result = resetPasswordSchema.safeParse({ password: '12345678' });
      expect(result.success).toBe(false);
    });

    it('rejects empty token', () => {
      const result = resetPasswordSchema.safeParse({ token: '', password: '12345678' });
      expect(result.success).toBe(false);
    });

    it('accepts valid token', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc123', password: '12345678' });
      expect(result.success).toBe(true);
    });
  });

  describe('password', () => {
    it('rejects missing password', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc123' });
      expect(result.success).toBe(false);
    });

    it('rejects password shorter than 8 characters', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc', password: '1234567' });
      expect(result.success).toBe(false);
    });

    it('rejects password longer than 72 characters', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc', password: 'a'.repeat(73) });
      expect(result.success).toBe(false);
    });

    it('accepts password at minimum length (8 chars)', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc', password: '12345678' });
      expect(result.success).toBe(true);
    });

    it('accepts password at maximum length (72 chars)', () => {
      const result = resetPasswordSchema.safeParse({ token: 'abc', password: 'a'.repeat(72) });
      expect(result.success).toBe(true);
    });
  });

  describe('valid input', () => {
    it('accepts complete valid input', () => {
      const input = { token: 'validtoken123', password: 'securepassword123' };
      const result = resetPasswordSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });
  });
});

// =============================================================================
// changePasswordSchema Validation
// =============================================================================

describe('changePasswordSchema', () => {
  describe('currentPassword', () => {
    it('rejects missing currentPassword', () => {
      const result = changePasswordSchema.safeParse({ newPassword: '12345678' });
      expect(result.success).toBe(false);
    });

    it('rejects empty currentPassword', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: '12345678',
      });
      expect(result.success).toBe(false);
    });

    it('accepts any non-empty currentPassword', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'x',
        newPassword: '12345678',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('newPassword', () => {
    it('rejects missing newPassword', () => {
      const result = changePasswordSchema.safeParse({ currentPassword: 'oldpassword' });
      expect(result.success).toBe(false);
    });

    it('rejects newPassword shorter than 8 characters', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldpassword',
        newPassword: '1234567',
      });
      expect(result.success).toBe(false);
    });

    it('rejects newPassword longer than 72 characters', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldpassword',
        newPassword: 'a'.repeat(73),
      });
      expect(result.success).toBe(false);
    });

    it('accepts newPassword at minimum length (8 chars)', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldpassword',
        newPassword: '12345678',
      });
      expect(result.success).toBe(true);
    });

    it('accepts newPassword at maximum length (72 chars)', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldpassword',
        newPassword: 'a'.repeat(72),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('valid input', () => {
    it('accepts complete valid input', () => {
      const input = { currentPassword: 'oldpassword123', newPassword: 'newpassword456' };
      const result = changePasswordSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });
  });
});
